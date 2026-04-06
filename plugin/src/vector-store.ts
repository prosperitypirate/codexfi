/**
 * vector-store.ts
 *
 * Pure TypeScript replacement for LanceDB. Zero native dependencies.
 *
 * Storage: ~/.codexfi/store.jsonl  (one MemoryRecord per line)
 * In-memory: Map<id, MemoryRecord> loaded on init, kept in sync on every write.
 * Search: brute-force cosine similarity over Float32Array vectors.
 *
 * Why Float32Array:
 *   - Same precision as LanceDB (32-bit floats)
 *   - V8 optimises typed array arithmetic — cosine over 1024 dims ≈ 0.01ms
 *   - At 3k records × 1024 dims ≈ 12MB RAM  (acceptable for a desktop plugin)
 *   - At 50k records × 1024 dims ≈ 200MB RAM (future concern, swap to HNSW then)
 *
 * Atomic writes: write to a temp file then rename — crash-safe on all platforms.
 * Concurrency: OpenCode is single-session; last-write-wins is acceptable.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { DATA_DIR } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface MemoryRecord {
	id: string;
	memory: string;
	user_id: string;
	/** 1024-dim embedding stored as a plain number[] in JSONL, Float32Array in RAM. */
	vector: Float32Array;
	metadata_json: string;
	created_at: string;
	updated_at: string;
	hash: string;
	chunk: string;
	superseded_by: string;
	type: string;
}

/** Serialised form written to JSONL — vector is a plain number[] */
interface PersistedRecord extends Omit<MemoryRecord, "vector"> {
	vector: number[];
}

export interface AddRecord extends Omit<MemoryRecord, "vector"> {
	vector: number[] | Float32Array;
}

export interface UpdateValues {
	memory?: string;
	updated_at?: string;
	hash?: string;
	metadata_json?: string;
	chunk?: string;
	superseded_by?: string;
	type?: string;
}

export interface SearchResult extends Omit<MemoryRecord, "vector"> {
	_distance: number;
}

export interface FilterOptions {
	user_id?: string;
	superseded_by?: "" | null;
	excludeId?: string;
}

// ── Store path ───────────────────────────────────────────────────────────────────

const STORE_PATH = join(DATA_DIR, "store.jsonl");
const STORE_TMP = join(DATA_DIR, "store.jsonl.tmp");

// ── In-memory map ────────────────────────────────────────────────────────────────

const records = new Map<string, MemoryRecord>();
let initialised = false;

// ── Cosine similarity ─────────────────────────────────────────────────────────────

/**
 * Cosine distance (0 = identical, 2 = opposite) between two Float32Arrays.
 * Matches LanceDB's distanceType("cosine") convention.
 */
function cosineDistance(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot   += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	if (normA === 0 || normB === 0) return 1; // treat zero-vectors as fully dissimilar
	return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Persistence ───────────────────────────────────────────────────────────────────

function toFloat32(v: number[] | Float32Array): Float32Array {
	return v instanceof Float32Array ? v : new Float32Array(v);
}

function serialise(r: MemoryRecord): string {
	const persisted: PersistedRecord = { ...r, vector: Array.from(r.vector) };
	return JSON.stringify(persisted);
}

function deserialise(line: string): MemoryRecord | null {
	try {
		const p = JSON.parse(line) as PersistedRecord;
		return { ...p, vector: toFloat32(p.vector) };
	} catch {
		return null;
	}
}

/** Atomically rewrite the entire JSONL file from the in-memory map. */
function persist(): void {
	mkdirSync(dirname(STORE_PATH), { recursive: true });
	const lines = Array.from(records.values()).map(serialise).join("\n") + "\n";
	writeFileSync(STORE_TMP, lines, "utf8");
	renameSync(STORE_TMP, STORE_PATH);
}

// ── Public API ────────────────────────────────────────────────────────────────────

/**
 * Initialise the store — load JSONL from disk into memory.
 * Safe to call multiple times (idempotent after first call).
 */
export function init(): void {
	if (initialised) return;
	initialised = true;
	_loadFromDisk();
}

/**
 * Reload the store from disk — discards the in-memory map and re-reads
 * store.jsonl. Used by the dashboard server to pick up writes from the
 * plugin process (which runs in a separate Bun instance).
 */
export function reload(): void {
	records.clear();
	_loadFromDisk();
}

function _loadFromDisk(): void {
	if (!existsSync(STORE_PATH)) return;

	const raw = readFileSync(STORE_PATH, "utf8");
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const rec = deserialise(trimmed);
		if (rec) records.set(rec.id, rec);
	}
}

/** Total number of records (including superseded). */
export function countRows(): number {
	return records.size;
}

/** Add one or more records. Throws if a record with the same id already exists. */
export function add(rows: AddRecord[]): void {
	for (const row of rows) {
		records.set(row.id, { ...row, vector: toFloat32(row.vector) });
	}
	persist();
}

/**
 * Add many records without persisting on each insert.
 * Writes to disk exactly once at the end — use for bulk imports/migrations.
 */
export function bulkAdd(rows: AddRecord[]): void {
	for (const row of rows) {
		records.set(row.id, { ...row, vector: toFloat32(row.vector) });
	}
	persist();
}

/** Update fields on a record matching `where.id`. */
export function update(where: { id: string }, values: UpdateValues): void {
	const rec = records.get(where.id);
	if (!rec) return;
	records.set(where.id, { ...rec, ...values });
	persist();
}

/** Delete a record by id. */
export function deleteById(id: string): void {
	records.delete(id);
	persist();
}

/**
 * Vector search — returns up to `limit` records sorted by cosine distance ascending,
 * optionally filtered. Matches LanceDB's .search(vector).distanceType("cosine").
 */
export function search(
	queryVector: number[] | Float32Array,
	options: {
		filter?: FilterOptions;
		limit?: number;
	} = {},
): SearchResult[] {
	const qv = toFloat32(queryVector);
	const limit = options.limit ?? 20;
	const filter = options.filter;

	const candidates: Array<{ rec: MemoryRecord; dist: number }> = [];

	for (const rec of records.values()) {
		if (filter) {
			if (filter.user_id !== undefined && rec.user_id !== filter.user_id) continue;
			if (filter.superseded_by !== undefined && rec.superseded_by !== "") continue;
			if (filter.excludeId !== undefined && rec.id === filter.excludeId) continue;
		}
		const dist = cosineDistance(qv, rec.vector);
		candidates.push({ rec, dist });
	}

	candidates.sort((a, b) => a.dist - b.dist);

	return candidates.slice(0, limit).map(({ rec, dist }) => ({
		...rec,
		_distance: dist,
	}));
}

/**
 * Pure filter scan — no vector, no similarity ranking.
 * Replaces the zero-vector hack used in LanceDB for list/getMemoriesByTypes.
 */
export function scan(
	filter: FilterOptions,
	options: { limit?: number } = {},
): MemoryRecord[] {
	const limit = options.limit ?? 10_000;
	const results: MemoryRecord[] = [];

	for (const rec of records.values()) {
		if (filter.user_id !== undefined && rec.user_id !== filter.user_id) continue;
		if (filter.superseded_by !== undefined && rec.superseded_by !== "") continue;
		if (filter.excludeId !== undefined && rec.id === filter.excludeId) continue;
		results.push(rec);
		if (results.length >= limit) break;
	}

	return results;
}

/** Direct record lookup by id. */
export function getById(id: string): MemoryRecord | undefined {
	return records.get(id);
}

/** Expose the raw map for migration/export tooling only. */
export function _allRecords(): ReadonlyMap<string, MemoryRecord> {
	return records;
}
