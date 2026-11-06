/**
 * Integration tests for the embedding-model aware store (store.ts + store/):
 *
 *   - embed_model schema migration for pre-1.0 databases (all rows → voyage-code-3)
 *   - vector search never compares vectors from different embedding models
 *   - addMemory(): insert, dedup-update (vector refreshed), contradiction pass
 *   - countStaleEmbeddings() / reembedStale() migration
 *   - ingest(): extraction → typed rows; singleton + session-summary aging
 *
 * Mocked local embedder (bag-of-words) + fake LLM; temp SQLite DBs.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";

import * as vs from "../../../plugin/src/store/index.js";
import { LEGACY_EMBED_MODEL } from "../../../plugin/src/store/schema.js";
import {
	addMemory,
	countStaleEmbeddings,
	ingest,
	list,
	reembedStale,
	search,
	searchByVector,
} from "../../../plugin/src/store.js";
import { activeThresholds, currentEmbedModelId, embed, embedderInfo } from "../../../plugin/src/embedder.js";
import { CONDENSE_SYSTEM, CONTRADICTION_SYSTEM, EXTRACTION_SYSTEM, SUMMARY_SYSTEM } from "../../../plugin/src/prompts.js";
import { MAX_SESSION_SUMMARIES } from "../../../plugin/src/config.js";
import { llmCalls, resetFakeLlm, setLlmHandler } from "../helpers/fake-llm.js";
import { bowVector, cosine, deterministicVector, MOCK_DIMS } from "../helpers/mock-embedder.js";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import { makeTempDir } from "../helpers/test-env.js";

const now = () => new Date().toISOString();

function row(id: string, memory: string, userId: string, extra: Partial<vs.AddRecord> = {}): vs.AddRecord {
	const ts = now();
	return {
		id, memory, user_id: userId, vector: bowVector(memory),
		metadata_json: JSON.stringify({ type: "learned-pattern" }), created_at: ts, updated_at: ts,
		hash: id, chunk: "", superseded_by: "", type: "learned-pattern", embed_model: currentEmbedModelId(),
		...extra,
	};
}

// ── Schema migration (own DB) ───────────────────────────────────────────────────

describe("embed_model migration", () => {
	afterAll(() => vs._resetForTests());

	test("a pre-1.0 database gains embed_model and existing rows are labelled voyage-code-3", () => {
		const dir = makeTempDir("legacy-db");
		const legacy = new Database(join(dir, "store.db"));
		// Schema exactly as shipped by codexfi <= 0.7.x (no embed_model column).
		legacy.run(`CREATE TABLE memories (
			id TEXT PRIMARY KEY, memory TEXT NOT NULL, user_id TEXT NOT NULL, vector BLOB NOT NULL,
			metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
			hash TEXT NOT NULL, chunk TEXT NOT NULL DEFAULT '', superseded_by TEXT NOT NULL DEFAULT '',
			type TEXT NOT NULL DEFAULT ''
		)`);
		const vec = new Float32Array(1024).map((_, i) => Math.sin(i));
		legacy.prepare(
			"INSERT INTO memories (id, memory, user_id, vector, metadata_json, created_at, updated_at, hash, chunk, superseded_by, type) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
		).run("legacy-1", "Old voyage-era memory", "proj", Buffer.from(vec.buffer), '{"type":"tech-context"}', now(), now(), "h", "", "", "tech-context");
		legacy.close();

		vs._setStorePathForTests(dir); // opens + migrates

		const migrated = vs.getById("legacy-1")!;
		expect(migrated.embed_model).toBe(LEGACY_EMBED_MODEL);
		expect(LEGACY_EMBED_MODEL).toBe("voyage-code-3");
		expect(migrated.memory).toBe("Old voyage-era memory");
		expect(Array.from(migrated.vector)).toEqual(Array.from(vec)); // vector untouched

		const check = new Database(join(dir, "store.db"));
		const cols = (check.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).map((c) => c.name);
		const idx = (check.prepare("PRAGMA index_list(memories)").all() as Array<{ name: string }>).map((i) => i.name);
		check.close();
		expect(cols).toContain("embed_model");
		expect(idx).toContain("idx_memories_embed_model");
	});

	test("re-opening an already migrated DB is a no-op", () => {
		const dir = makeTempDir("fresh-db");
		vs._setStorePathForTests(dir);
		vs.add([row("fresh-1", "new row", "proj")]);
		vs._resetForTests();
		vs._setStorePathForTests(dir);
		expect(vs.getById("fresh-1")!.embed_model).toBe(currentEmbedModelId());
	});
});

// ── Everything below shares one temp DB ─────────────────────────────────────────

describe("store with the mocked local embedder", () => {
	beforeAll(async () => {
		await setupTempDb();
	});

	afterAll(() => {
		teardownTempDb();
	});

	beforeEach(() => resetFakeLlm());

	test("sanity: the active model is local and embed() is the bag-of-words double", async () => {
		expect(embedderInfo().provider).toBe("local");
		expect(currentEmbedModelId()).toMatch(/^local:/);
		expect(await embed("alpha beta")).toEqual(bowVector("alpha beta"));
	});

	describe("cross-model isolation", () => {
		test("searchByVector ignores rows embedded by another model, even with an identical vector", async () => {
			const U = "iso_project";
			const text = "Identical vector stored under two different embedding models";
			vs.add([
				row("iso-current", text, U),
				row("iso-voyage", text, U, { embed_model: "voyage-code-3" }),
				row("iso-unlabelled", text, U, { embed_model: "" }),
			]);
			const hits = await searchByVector(bowVector(text), U, { threshold: 0 });
			expect(hits.map((h) => h.id)).toEqual(["iso-current"]);
		});

		test("vectors of a different dimension never match (no NaN, no crash)", async () => {
			const U = "iso_dims_project";
			vs.add([row("dims-1024", "Legacy row with a 1024-dim vector", U, { vector: deterministicVector("x", MOCK_DIMS / 2) })]);
			const hits = await searchByVector(bowVector("Legacy row with a 1024-dim vector"), U, { threshold: 0 });
			expect(hits).toEqual([]);
		});
	});

	describe("addMemory", () => {
		const U = "add_project";

		test("stores a new memory (default type learned-pattern) with the current embed_model", async () => {
			const r = await addMemory("  The cache layer uses Redis with a five minute TTL  ", U);
			expect(r.event).toBe("ADD");
			expect(r.type).toBe("learned-pattern");
			expect(r.memory).toBe("The cache layer uses Redis with a five minute TTL");
			const stored = vs.getById(r.id)!;
			expect(stored.embed_model).toBe(currentEmbedModelId());
			expect(JSON.parse(stored.metadata_json).type).toBe("learned-pattern");
			expect(Array.from(stored.vector)).toEqual(bowVector(r.memory).map((x) => Math.fround(x)));
		});

		test("a near-duplicate updates the existing row and refreshes its vector", async () => {
			const original = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
			const first = await addMemory(original, U, { type: "preference" });
			const revised = `${original} mike`;
			// Within the active model's dedup distance → treated as the same memory.
			expect(1 - cosine(bowVector(original), bowVector(revised))).toBeLessThan(activeThresholds().dedupDistance);

			const second = await addMemory(revised, U, { type: "preference" });
			expect(second.event).toBe("UPDATE");
			expect(second.id).toBe(first.id);
			const stored = vs.getById(first.id)!;
			expect(stored.memory).toBe(revised);
			const v = Array.from(stored.vector);
			expect(cosine(v, bowVector(revised))).toBeCloseTo(1, 5);
			expect(cosine(v, bowVector(original))).toBeLessThan(0.9999);
		});

		test("contradiction detection runs only when candidates exist, and supersedes what the LLM names", async () => {
			const oldText = "Deployments target Heroku dynos";
			const newText = "Deployments now target Fly machines";
			// Precondition: similar enough to be a candidate, not so similar it dedups.
			const distance = 1 - cosine(bowVector(oldText), bowVector(newText));
			expect(distance).toBeGreaterThan(activeThresholds().dedupDistance);
			expect(distance).toBeLessThan(activeThresholds().contradictionDistance);

			const old = await addMemory(oldText, U);
			const contradictionCallsBefore = llmCalls.filter((c) => c.system === CONTRADICTION_SYSTEM).length;
			setLlmHandler((system, user) => {
				if (system !== CONTRADICTION_SYSTEM) return "[]";
				expect(user).toContain(old.id);
				return JSON.stringify([old.id]);
			});
			const fresh = await addMemory(newText, U);
			expect(fresh.event).toBe("ADD");
			expect(llmCalls.filter((c) => c.system === CONTRADICTION_SYSTEM).length).toBeGreaterThan(contradictionCallsBefore);
			expect(vs.getById(old.id)!.superseded_by).toBe(fresh.id);
			expect((await list(U, { limit: 100 })).map((m) => m.id)).not.toContain(old.id);
		});

		test("no similar memories → no LLM call at all", async () => {
			await addMemory("Completely novel unrelated vocabulary xylograph quixotic", "add_isolated_project");
			expect(llmCalls).toHaveLength(0);
		});
	});

	describe("stale embeddings", () => {
		test("countStaleEmbeddings / reembedStale migrate rows from an older model", async () => {
			const U = "stale_project";
			const texts = ["Stale voyage memory one about payments", "Stale voyage memory two about invoices", "Stale voyage memory three about refunds"];
			const staleBefore = countStaleEmbeddings();
			// Voyage-era rows: 1024-dim vectors from another model.
			vs.add(texts.map((t, i) => row(`stale-${i}`, t, U, { vector: deterministicVector(t, 1024), embed_model: "voyage-code-3" })));
			expect(countStaleEmbeddings()).toBe(staleBefore + 3);
			expect(await search("Stale voyage memory two about invoices", U, { threshold: 0 })).toEqual([]);

			const migrated = await reembedStale(500, 2);
			expect(migrated).toBe(staleBefore + 3);
			expect(countStaleEmbeddings()).toBe(0);

			const r = vs.getById("stale-1")!;
			expect(r.embed_model).toBe(currentEmbedModelId());
			expect(r.vector.length).toBe(bowVector("x").length);
			const hits = await search("Stale voyage memory two about invoices", U, { threshold: 0.5 });
			expect(hits[0]!.id).toBe("stale-1");
		});

		test("reembedStale honours max and is resumable", async () => {
			const U = "stale_partial_project";
			await reembedStale(); // start from a clean slate regardless of test order
			vs.add([0, 1, 2, 3].map((i) => row(`partial-${i}`, `Partial stale memory ${i}`, U, { embed_model: "voyage-code-3" })));
			expect(await reembedStale(3)).toBe(3);
			expect(countStaleEmbeddings()).toBe(1);
			expect(await reembedStale(3)).toBe(1);
			expect(countStaleEmbeddings()).toBe(0);
			expect(await reembedStale()).toBe(0);
		});
	});

	describe("ingest", () => {
		test("extracts typed facts via the LLM and stores them with source chunk + metadata", async () => {
			const U = "ingest_project";
			setLlmHandler((system) =>
				system === EXTRACTION_SYSTEM
					? JSON.stringify([
						{ memory: "Uses Drizzle ORM for Postgres migrations", type: "tech-context" },
						{ memory: "Fixed flaky e2e test by awaiting the network idle event", type: "error-solution" },
					])
					: "[]",
			);
			const results = await ingest(
				[{ role: "user", content: "why is the e2e test flaky?" }, { role: "assistant", content: "It did not wait for network idle; fixed." }],
				U,
				{ metadata: { source: "test", session_id: "s1" } },
			);
			expect(results.map((r) => [r.type, r.event])).toEqual([["tech-context", "ADD"], ["error-solution", "ADD"]]);
			const extraction = llmCalls.find((c) => c.system === EXTRACTION_SYSTEM)!;
			expect(extraction.user).toContain("[user] why is the e2e test flaky?");

			const stored = vs.getById(results[0]!.id)!;
			expect(JSON.parse(stored.metadata_json)).toEqual({ source: "test", session_id: "s1", type: "tech-context" });
			expect(stored.type).toBe("tech-context");
			expect(stored.chunk).toContain("[assistant] It did not wait for network idle");
		});

		test("LLM returning nothing → nothing stored", async () => {
			const results = await ingest([{ role: "user", content: "hello" }], "ingest_empty_project");
			expect(results).toEqual([]);
		});

		test("active-context is a singleton per project", async () => {
			const U = "aging_active_project";
			for (const m of ["Wiring the login form", "Login done, now OAuth refresh tokens", "OAuth done, next: offline consent scope"]) {
				await addMemory(m, U, { type: "active-context" });
			}
			const rows = (await list(U, { limit: 50 })).filter((r) => r.metadata.type === "active-context");
			expect(rows.map((r) => r.memory)).toEqual(["OAuth done, next: offline consent scope"]);
		});

		test("progress is a singleton per project", async () => {
			const U = "aging_progress_project";
			await addMemory("Phase 1 of the migration is complete", U, { type: "progress" });
			await addMemory("Phase 2 rollout started for internal tenants", U, { type: "progress" });
			const rows = (await list(U, { limit: 50 })).filter((r) => r.metadata.type === "progress");
			expect(rows.map((r) => r.memory)).toEqual(["Phase 2 rollout started for internal tenants"]);
		});

		test(`session summaries beyond ${MAX_SESSION_SUMMARIES} condense the oldest into a learned-pattern`, async () => {
			const U = "aging_sessions_project";
			setLlmHandler((system) => {
				if (system === SUMMARY_SYSTEM) return "[]";
				if (system === CONDENSE_SYSTEM) return JSON.stringify([{ memory: "Condensed: the first session set up the repo", type: "learned-pattern" }]);
				return "[]";
			});
			const ids: string[] = [];
			const topics = ["repository scaffolding", "database schema design", "authentication flow", "billing integration"];
			for (let i = 0; i < MAX_SESSION_SUMMARIES + 1; i++) {
				const r = await addMemory(`Session ${i}: worked on ${topics[i]} in depth`, U, { type: "session-summary" });
				ids.push(r.id);
				await Bun.sleep(5); // distinct created_at ordering
			}
			const rows = await list(U, { limit: 50 });
			const sessions = rows.filter((r) => r.metadata.type === "session-summary").map((r) => r.id);
			expect(sessions.sort()).toEqual(ids.slice(1).sort());
			const condensed = rows.find((r) => r.metadata.type === "learned-pattern")!;
			expect(condensed.memory).toBe("Condensed: the first session set up the repo");
			expect(condensed.metadata.condensed_from).toBe(ids[0]);
			expect(vs.getById(condensed.id)!.embed_model).toBe(currentEmbedModelId());
		});
	});
});
