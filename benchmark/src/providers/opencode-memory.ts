/**
 * Provider adapter for the opencode-memory embedded store (plugin).
 *
 * Replaces the HTTP-based adapter that called the Docker backend at localhost:8020.
 * Now uses the embedded LanceDB store directly via plugin/src/store.ts.
 *
 * API surface used (all direct function calls, no HTTP):
 *   store.ingest()       – extract + embed + store memories from messages
 *   store.search()       – semantic vector search with recency blending
 *   store.list()         – list all memories for cleanup
 *   store.deleteMemory() – delete single memory
 *   db.init()            – initialize LanceDB connection
 *   db.refresh()         – refresh table handle between operations
 */

import type {
	Provider,
	UnifiedSession,
	IngestResult,
	IngestProgressCallback,
	SearchResult,
} from "../types.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";

import * as db from "../../../plugin/src/db.js";
import * as store from "../../../plugin/src/store.js";

// Memory types included in hybrid enumeration retrieval ("list all X", "every Y").
// Narrow set for pure enumeration queries — excludes architecture (too broad, adds noise)
// and session-summary (cross-project narrative contamination, caused Q177 regression).
const ENUMERATION_TYPES = [
	"tech-context", "preference", "learned-pattern", "error-solution", "project-config",
];

// Wider set for cross-project synthesis queries ("across both projects", "overall state").
// Includes architecture because synthesis queries often need component/endpoint/chart details
// that are stored as architecture-type memories.
// Mirrors plugin/src/index.ts — keep both in sync.
const SYNTHESIS_TYPES = [
	...ENUMERATION_TYPES, "architecture",
];

// Detects enumeration intent: queries that enumerate facts across all sessions.
// These cannot be answered by top-K semantic similarity alone when the corpus spans 25+ sessions.
const ENUMERATION_REGEX = /\b(list\s+all|list\s+every|all\s+the\s+\w+|every\s+(env|config|setting|preference|error|pattern|tool|developer|tech|project|decision|approach)|across\s+all(\s+sessions)?|complete\s+(list|history|tech\s+stack|stack)|entire\s+(history|list|project\s+history|tech\s+stack)|describe\s+all|enumerate\s+all|full\s+(list|history|tech\s+stack))\b/i;

export class OpencodeMemoryProvider implements Provider {
	readonly name = "opencode-memory";

	async initialize(): Promise<void> {
		try {
			await db.init();
			log.success("Embedded LanceDB store initialized");
		} catch (err) {
			throw new Error(
				`Embedded store failed to initialize: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	/**
	 * Ingest all sessions into the embedded store.
	 * Each session is sent as a list of messages — the LLM extractor
	 * extracts typed memories automatically (exactly how the plugin works in prod).
	 */
	async ingest(sessions: UnifiedSession[], runTag: string, onProgress?: IngestProgressCallback): Promise<IngestResult> {
		let memoriesAdded = 0;
		let memoriesUpdated = 0;
		const sessionIds: string[] = [];
		const sessionDurations: number[] = [];
		let done = 0;

		const phaseStart = Date.now();

		for (const session of sessions) {
			log.dim(`  Ingesting ${session.sessionId} (${session.messages.length} messages)`);

			const metadata: Record<string, unknown> = {
				session_id: session.sessionId,
				...session.metadata,
			};

			const t0 = Date.now();
			const results = await store.ingest(
				session.messages,
				runTag,
				{ metadata },
			);
			const durationMs = Date.now() - t0;

			let sessionAdded = 0, sessionUpdated = 0;
			for (const r of results) {
				if (r.event === "ADD") { memoriesAdded++; sessionAdded++; }
				else if (r.event === "UPDATE") { memoriesUpdated++; sessionUpdated++; }
			}
			sessionIds.push(session.sessionId);
			sessionDurations.push(durationMs);
			done++;
			onProgress?.(session.sessionId, sessionAdded, sessionUpdated, done, durationMs);

			// Small delay to avoid hammering the LLM extractor
			await sleep(500);
		}

		const totalDurationMs = Date.now() - phaseStart;
		return { memoriesAdded, memoriesUpdated, sessionIds, sessionDurations, totalDurationMs };
	}

	/**
	 * Semantic search using the embedded vector store.
	 *
	 * recency_weight is applied per question type:
	 *   session-continuity → 0.5  (temporal queries need recency boost)
	 *   all others         → 0.0  (pure semantic; superseding already handles knowledge-update)
	 */
	async search(query: string, runTag: string, limit = 20, questionType?: string): Promise<SearchResult[]> {
		const RECENCY_WEIGHTS: Record<string, number> = {
			"session-continuity": 0.5,
		};
		const recency_weight = RECENCY_WEIGHTS[questionType ?? ""] ?? 0.0;

		// Hybrid enumeration retrieval: for cross-synthesis questions or queries that
		// enumerate facts across all sessions, also fetch all memories of relevant types.
		const isEnumeration = ENUMERATION_REGEX.test(query);
		const isWideSynthesis = questionType === "cross-session-synthesis" ||
			/\b(both\s+(projects?|the)|across\s+both|end[\s-]to[\s-]end|how\s+has.{0,30}evolved|sequence\s+of.{0,20}decisions?)\b/i.test(query);
		const types = isWideSynthesis ? SYNTHESIS_TYPES : isEnumeration ? ENUMERATION_TYPES : undefined;

		// Refresh table to see any recently ingested data
		await db.refresh();

		const results = await store.search(query, runTag, {
			limit,
			// NOTE: benchmark intentionally uses 0.2 (vs plugin default 0.45) to avoid
			// artificially constraining recall during evaluation. All runs use the same
			// threshold, so cross-run comparisons are valid — but absolute Hit@K numbers
			// will be higher than production recall at 0.45.
			threshold: 0.2,
			recencyWeight: recency_weight,
			...(types ? { types } : {}),
		});

		return results.map((r) => ({
			id: r.id,
			memory: r.memory,
			chunk: r.chunk ?? "",
			score: r.score,
			metadata: r.metadata,
			date: r.date ?? (r.metadata?.date as string | undefined),
		}));
	}

	/**
	 * Delete all memories for a run tag (cleanup after benchmark).
	 */
	async clear(runTag: string): Promise<void> {
		// Refresh to see all ingested memories
		await db.refresh();

		// include_superseded=true ensures memories retired by relational versioning
		// during the run are also returned and deleted — otherwise they are orphaned.
		const rows = await store.list(runTag, { limit: 1000, includeSuperseded: true });

		if (rows.length === 0) {
			log.dim("  Nothing to clean up");
			return;
		}

		log.dim(`  Deleting ${rows.length} memories...`);
		let deleted = 0;
		for (const row of rows) {
			try {
				await store.deleteMemory(row.id);
				deleted++;
				// Emit at 25%, 50%, 75%, and 100% to avoid flooding the feed
				const pct = deleted / rows.length;
				if (pct === 1 || deleted === 1 || Math.floor((deleted - 1) / rows.length * 4) < Math.floor(pct * 4)) {
					emit({ type: "cleanup_progress", deleted, total: rows.length });
				}
			} catch {
				// best-effort cleanup
			}
		}
		log.success(`Cleaned up ${deleted}/${rows.length} memories for run tag ${runTag}`);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
