/**
 * Memory store — CRUD, deduplication, aging, contradiction detection, search with recency blending.
 *
 * All operations use the embedded LanceDB table directly.
 */

import { createHash, randomUUID } from "node:crypto";

import {
	EMBEDDING_DIMS,
	CHUNK_TRUNCATION,
	CONTRADICTION_CANDIDATE_DISTANCE,
	CONTRADICTION_CANDIDATE_LIMIT,
	DEDUP_DISTANCE,
	ENUM_BASE_SCORE,
	MAX_SESSION_SUMMARIES,
	RECENCY_DECAY,
	STRUCTURAL_CONTRADICTION_DISTANCE,
	STRUCTURAL_DEDUP_DISTANCE,
	STRUCTURAL_TYPES,
	VERSIONING_SKIP_TYPES,
	validateId,
} from "./config.js";
import type { VectorQuery } from "@lancedb/lancedb";
import { getTable } from "./db.js";
import { embed } from "./embedder.js";
import { condenseToLearnedPattern, detectContradictions, extractMemories } from "./extractor.js";
import { withRetry, DB_RETRY, DB_SEARCH_RETRY } from "./retry.js";
import type { ExtractionMode, IngestResult, Message, SearchResult } from "./types.js";

// ── Safe JSON parsing ───────────────────────────────────────────────────────────

/**
 * Parse JSON with a fallback default. All metadata_json parsing MUST use this
 * helper to prevent silent failures from malformed data in the extras loop,
 * search candidates, or list results.
 */
function safeParseJson(raw: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
	try {
		return JSON.parse((raw as string) || "{}");
	} catch {
		return fallback;
	}
}

// ── Deduplication ───────────────────────────────────────────────────────────────

/**
 * Find the closest existing memory if within distance threshold.
 * Returns null when table is empty, search fails, or no match close enough.
 */
async function findDuplicate(
	userId: string,
	vector: number[],
	distanceThreshold: number = DEDUP_DISTANCE,
): Promise<Record<string, unknown> | null> {
	try {
		const table = getTable();
		const count = await table.countRows();
		if (count === 0) return null;

		const safeUserId = validateId(userId, "user_id");
		const results = await (table.search(vector) as VectorQuery)
			.distanceType("cosine")
			.where(`user_id = '${safeUserId}'`)
			.limit(1)
			.toArray();

		if (results.length > 0 && (results[0]._distance as number) <= distanceThreshold) {
			return results[0];
		}
	} catch (e) {
		console.debug("Dedup search error:", e);
	}
	return null;
}

// ── Relational versioning ───────────────────────────────────────────────────────

/**
 * Find non-superseded memories within contradiction distance.
 */
async function findContradictionCandidates(
	userId: string,
	vector: number[],
	newId: string,
	memoryType: string,
	limit: number = CONTRADICTION_CANDIDATE_LIMIT,
): Promise<Array<Record<string, unknown>>> {
	const maxDistance = STRUCTURAL_TYPES.has(memoryType)
		? STRUCTURAL_CONTRADICTION_DISTANCE
		: CONTRADICTION_CANDIDATE_DISTANCE;

	try {
		const table = getTable();
		const count = await table.countRows();
		if (count === 0) return [];

		const safeUserId = validateId(userId, "user_id");
		const safeNewId = validateId(newId, "new_id");
		const results = await (table.search(vector) as VectorQuery)
			.distanceType("cosine")
			.where(`user_id = '${safeUserId}' AND id != '${safeNewId}' AND superseded_by = ''`)
			.limit(limit)
			.toArray();

		return results.filter(r => (r._distance as number) <= maxDistance);
	} catch (e) {
		console.debug("findContradictionCandidates error:", e);
		return [];
	}
}

/**
 * Mark an old memory as superseded by a new one.
 */
async function markSuperseded(oldId: string, newId: string): Promise<void> {
	try {
		const safeOldId = validateId(oldId, "old_id");
		const now = new Date().toISOString();
		await getTable().update({
			where: `id = '${safeOldId}'`,
			values: { superseded_by: newId, updated_at: now },
		});
	} catch (e) {
		console.warn(`markSuperseded error for ${oldId} → ${newId}:`, e);
	}
}

/**
 * Full versioning pass for a newly inserted memory.
 * Returns list of IDs that were marked superseded.
 */
async function checkAndSupersede(
	userId: string,
	newMemory: string,
	vector: number[],
	newId: string,
	memoryType: string,
): Promise<string[]> {
	if (VERSIONING_SKIP_TYPES.has(memoryType)) return [];

	const candidates = await findContradictionCandidates(userId, vector, newId, memoryType);
	if (candidates.length === 0) return [];

	const supersededIds = await detectContradictions(
		newMemory,
		candidates.map(c => ({ id: c.id as string, memory: c.memory as string })),
	);

	for (const sid of supersededIds) {
		await markSuperseded(sid, newId);
	}

	return supersededIds;
}

// ── Type queries ────────────────────────────────────────────────────────────────

/**
 * Return non-superseded memories matching any of `memoryTypes` for `userId`.
 * Sorted by created_at ascending.
 */
async function getMemoriesByTypes(
	userId: string,
	memoryTypes: string[],
	limit?: number,
): Promise<Array<Record<string, unknown>>> {
	try {
		const table = getTable();
		const count = await table.countRows();
		if (count === 0) return [];

		const safeUserId = validateId(userId, "user_id");
		// WORKAROUND: LanceDB JS SDK requires a vector for every query — there is no
		// pure-filter query mode. We pass a zero-vector to get filtering without
		// meaningful similarity ranking. Results are then filtered/sorted in JS.
		// Uses EMBEDDING_DIMS to stay in sync if the embedding model changes.
		const results = await table
			.search(new Array(EMBEDDING_DIMS).fill(0))
			.where(`user_id = '${safeUserId}' AND superseded_by = ''`)
			.limit(10_000) // generous cap — single-user system
			.toArray();

		const typeSet = new Set(memoryTypes);
		let typed = results.filter(r => {
			const meta = safeParseJson(r.metadata_json);
			return typeSet.has(meta.type as string);
		});

		typed.sort((a, b) =>
			((a.created_at as string) || "").localeCompare((b.created_at as string) || "")
		);

		if (limit !== undefined) {
			typed = typed.slice(0, limit);
		}

		return typed;
	} catch (e) {
		console.debug("getMemoriesByTypes error:", e);
		return [];
	}
}

/**
 * Return all non-superseded memories of a single type.
 */
async function getMemoriesByType(
	userId: string,
	memoryType: string,
): Promise<Array<Record<string, unknown>>> {
	return getMemoriesByTypes(userId, [memoryType]);
}

// ── Aging rules ─────────────────────────────────────────────────────────────────

/**
 * Enforce rolling-window aging rules after inserting a new memory.
 *
 * progress: only the latest entry survives — all older ones are deleted.
 * session-summary: capped at MAX_SESSION_SUMMARIES; oldest condensed → learned-pattern.
 */
async function applyAgingRules(userId: string, memoryType: string, newId: string): Promise<void> {
	if (!memoryType) return;

	if (memoryType === "progress") {
		await ageProgress(userId, newId);
	} else if (memoryType === "session-summary") {
		await ageSessionSummaries(userId);
	}
}

async function ageProgress(userId: string, newId: string): Promise<void> {
	try {
		const rows = await getMemoriesByType(userId, "progress");
		for (const row of rows) {
			if ((row.id as string) !== newId) {
				const safeId = validateId(row.id as string, "id");
				await getTable().delete(`id = '${safeId}'`);
			}
		}
	} catch (e) {
		console.warn("Aging progress error:", e);
	}
}

async function ageSessionSummaries(userId: string): Promise<void> {
	try {
		const existing = await getMemoriesByType(userId, "session-summary");
		if (existing.length <= MAX_SESSION_SUMMARIES) return;

		const oldest = existing[0];
		const oldestId = oldest.id as string;
		const oldestMemory = oldest.memory as string;

		const condensed = await condenseToLearnedPattern(oldestMemory);
		if (condensed) {
			const now = new Date().toISOString();
			const vector = await embed(condensed.memory, "document");
			await withRetry(
				() => getTable().add([{
					id: randomUUID(),
					memory: condensed.memory,
					user_id: userId,
					vector,
					metadata_json: JSON.stringify({
						type: "learned-pattern",
						condensed_from: oldestId,
					}),
					created_at: now,
					updated_at: now,
					hash: createHash("md5").update(condensed.memory).digest("hex"),
					chunk: "",
					superseded_by: "",
					type: "learned-pattern",
				}]),
				"LanceDB write (condensed learned-pattern)",
				DB_RETRY,
			);
		}

		const safeOldestId = validateId(oldestId, "id");
		await getTable().delete(`id = '${safeOldestId}'`);
	} catch (e) {
		console.warn("Aging session-summary error:", e);
	}
}

// ── Public API: ingest ──────────────────────────────────────────────────────────

export interface IngestOptions {
	metadata?: Record<string, unknown>;
	mode?: ExtractionMode;
}

/**
 * Extract memories from messages and store them with dedup, versioning, and aging.
 */
export async function ingest(
	messages: Message[],
	userId: string,
	options: IngestOptions = {},
): Promise<IngestResult[]> {
	const safeUserId = validateId(userId, "user_id");
	const mode = options.mode ?? "normal";
	const baseMetadata = options.metadata ?? {};

	const facts = await extractMemories(messages, mode);
	const results: IngestResult[] = [];
	const now = new Date().toISOString();

	for (const fact of facts) {
		const factText = fact.memory;
		const factType = fact.type || (baseMetadata.type as string) || "";
		// Chunk = full truncated conversation attached to each memory for detail queries.
		// Display truncation (400 chars for [MEMORY] block snippets) is separate (context.ts:126).
		const factChunk = (fact.chunk || "").slice(0, CHUNK_TRUNCATION);

		const metadata = { ...baseMetadata, ...(factType ? { type: factType } : {}) };
		const metadataStr = JSON.stringify(metadata);
		const factHash = createHash("md5").update(factText).digest("hex");
		const vector = await embed(factText, "document");

		const threshold = STRUCTURAL_TYPES.has(factType) ? STRUCTURAL_DEDUP_DISTANCE : DEDUP_DISTANCE;
		const dup = await findDuplicate(safeUserId, vector, threshold);

		if (dup) {
			// Dedup match — update existing memory (lightweight refresh)
			const safeId = validateId(dup.id as string, "id");
			await withRetry(
				() => getTable().update({
					where: `id = '${safeId}'`,
					values: {
						memory: factText,
						updated_at: now,
						hash: factHash,
						metadata_json: metadataStr,
						chunk: factChunk,
					},
				}),
				"LanceDB update (dedup)",
				DB_RETRY,
			);
			results.push({ id: dup.id as string, memory: factText, event: "UPDATE" });
		} else {
			// New insert — full pipeline: add, aging, contradiction detection
			const memId = randomUUID();
			await withRetry(
				() => getTable().add([{
					id: memId,
					memory: factText,
					user_id: safeUserId,
					vector,
					metadata_json: metadataStr,
					created_at: now,
					updated_at: now,
					hash: factHash,
					chunk: factChunk,
					superseded_by: "",
					type: factType,
				}]),
				"LanceDB write (new memory)",
				DB_RETRY,
			);
			results.push({ id: memId, memory: factText, event: "ADD" });

			if (factType) {
				await applyAgingRules(safeUserId, factType, memId);
			}

			// Contradiction detection — mark stale memories as superseded
			await checkAndSupersede(safeUserId, factText, vector, memId, factType);
		}
	}

	return results;
}

// ── Public API: search ──────────────────────────────────────────────────────────

export interface SearchOptions {
	limit?: number;
	threshold?: number;
	recencyWeight?: number;
	types?: string[];
}

/**
 * Semantic search over memories with optional recency blending and hybrid enumeration.
 */
export async function search(
	query: string,
	userId: string,
	options: SearchOptions = {},
): Promise<SearchResult[]> {
	const safeUserId = validateId(userId, "user_id");
	const table = getTable();
	const count = await table.countRows();
	if (count === 0) return [];

	const limit = options.limit ?? 20;
	const threshold = options.threshold ?? 0.3;
	const w = options.recencyWeight ?? 0.0;

	const queryVector = await embed(query, "query");
	// LanceDB JS SDK prefilters by default (.where() filters BEFORE ANN search).
	// Use .postfilter() to opt out.
	const rows = await withRetry(
		() => (table.search(queryVector) as VectorQuery)
			.distanceType("cosine")
			.where(`user_id = '${safeUserId}' AND superseded_by = ''`)
			.limit(limit)
			.toArray(),
		"LanceDB search",
		DB_SEARCH_RETRY,
	);

	// Build candidates with semantic scores + parsed dates
	const candidates = rows.map(r => {
		const semantic = Math.max(0, 1.0 - (r._distance as number ?? 1.0));
		const meta = safeParseJson(r.metadata_json);
		const d = extractDate(r);
		return {
			id: r.id as string,
			memory: r.memory as string,
			chunk: (r.chunk as string) || "",
			semantic,
			metadata: meta,
			created_at: (r.created_at as string) || null,
			date: d ? d.toISOString().slice(0, 10) : null,
			_dateObj: d,
			score: 0,
		};
	});

	// Optional recency blending
	if (w > 0) {
		const dates = candidates
			.map(c => c._dateObj)
			.filter((d): d is Date => d !== null);
		const maxDate = dates.length > 0 ? dates.reduce((a, b) => a > b ? a : b) : null;

		for (const c of candidates) {
			if (maxDate !== null) {
				const rec = recencyScore(c._dateObj, maxDate);
				c.score = +((1.0 - w) * c.semantic + w * rec).toFixed(4);
			} else {
				c.score = +c.semantic.toFixed(4);
			}
		}
	} else {
		for (const c of candidates) {
			c.score = +c.semantic.toFixed(4);
		}
	}

	let results: SearchResult[] = candidates
		.filter(c => c.score >= threshold)
		.sort((a, b) => b.score - a.score)
		.map(c => ({
			id: c.id,
			memory: c.memory,
			chunk: c.chunk,
			score: c.score,
			metadata: c.metadata,
			created_at: c.created_at,
			date: c.date,
		}));

	// Hybrid enumeration retrieval
	if (options.types && options.types.length > 0) {
		const seenIds = new Set(results.map(r => r.id));
		const totalExtrasLimit = limit;
		const typeRows = await getMemoriesByTypes(safeUserId, options.types, totalExtrasLimit);

		const extras: SearchResult[] = [];
		for (const tr of typeRows) {
			if (seenIds.has(tr.id as string)) continue;
			const meta = safeParseJson(tr.metadata_json);
			const d = extractDate(tr);
			extras.push({
				id: tr.id as string,
				memory: tr.memory as string,
				chunk: (tr.chunk as string) || "",
				score: ENUM_BASE_SCORE,
				metadata: meta,
				created_at: (tr.created_at as string) || null,
				date: d ? d.toISOString().slice(0, 10) : null,
			});
			seenIds.add(tr.id as string);
			if (extras.length >= totalExtrasLimit) break;
		}

		// Sort extras by recency
		extras.sort((a, b) =>
			(b.created_at || "").localeCompare(a.created_at || "")
		);

		results = [...results, ...extras].sort((a, b) => b.score - a.score);
	}

	return results;
}

// ── Public API: list ────────────────────────────────────────────────────────────

export interface ListOptions {
	limit?: number;
	includeSuperseded?: boolean;
}

/**
 * List stored memories for a user, ordered by most recently updated.
 */
export async function list(
	userId: string,
	options: ListOptions = {},
): Promise<Array<{
	id: string;
	memory: string;
	user_id: string;
	metadata: Record<string, unknown>;
	created_at: string | null;
	updated_at: string | null;
}>> {
	const safeUserId = validateId(userId, "user_id");
	const table = getTable();
	const count = await table.countRows();
	if (count === 0) return [];

	const limit = options.limit ?? 20;

	// WORKAROUND: zero-vector for non-semantic query (see getMemoriesByTypes comment).
	// Uses EMBEDDING_DIMS constant to stay in sync with embedding model.
	const whereClause = options.includeSuperseded
		? `user_id = '${safeUserId}'`
		: `user_id = '${safeUserId}' AND superseded_by = ''`;

	const rows = await table
		.search(new Array(EMBEDDING_DIMS).fill(0))
		.where(whereClause)
		.limit(10_000)
		.toArray();

	// Sort by updated_at descending
	rows.sort((a, b) =>
		((b.updated_at as string) || "").localeCompare((a.updated_at as string) || "")
	);

	return rows.slice(0, limit).map(r => ({
		id: r.id as string,
		memory: r.memory as string,
		user_id: r.user_id as string,
		metadata: safeParseJson(r.metadata_json),
		created_at: (r.created_at as string) || null,
		updated_at: (r.updated_at as string) || null,
	}));
}

/**
 * List memories filtered by types.
 */
export async function listByType(
	userId: string,
	types: string[],
	options: { limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
	return getMemoriesByTypes(userId, types, options.limit);
}

// ── Public API: delete ──────────────────────────────────────────────────────────

/**
 * Delete a single memory by ID.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
	const safeId = validateId(memoryId, "memory_id");
	await withRetry(
		() => getTable().delete(`id = '${safeId}'`),
		"LanceDB delete",
		DB_RETRY,
	);
}

// ── Public API: getProfile ──────────────────────────────────────────────────────

/**
 * Get user profile (all memories, limited).
 */
export async function getProfile(
	userId: string,
	limit = 100,
): Promise<Array<{
	id: string;
	memory: string;
	metadata: Record<string, unknown>;
	created_at: string | null;
}>> {
	return (await list(userId, { limit })).map(r => ({
		id: r.id,
		memory: r.memory,
		metadata: r.metadata,
		created_at: r.created_at,
	}));
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Parse session date from metadata_json['date'], falling back to created_at[:10].
 */
function extractDate(row: Record<string, unknown>): Date | null {
	const meta = safeParseJson(row.metadata_json);
	const raw = (meta.date as string) || ((row.created_at as string) || "").slice(0, 10);
	if (raw) {
		const parsed = new Date(raw);
		if (!isNaN(parsed.getTime())) return parsed;
	}
	return null;
}

/**
 * Exponential decay recency score: 1.0 for maxDate, lower for older.
 */
function recencyScore(d: Date | null, maxDate: Date): number {
	if (!d) return 0;
	const daysDiff = Math.max(0, (maxDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
	return Math.exp(-RECENCY_DECAY * daysDiff);
}
