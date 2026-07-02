/**
 * Integration tests for store.ts — CRUD, search, list, delete, dedup.
 *
 * Uses the SQLite vector store in a temp directory. Bypasses ingest()
 * (which needs a real extraction LLM) by inserting rows directly via
 * store.add(), then testing searchByVector(), list(), deleteMemory(),
 * getProfile().
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import * as db from "../../../plugin/src/db.js";
import * as vs from "../../../plugin/src/store/index.js";
import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";
import { searchByVector, list, deleteMemory, getProfile, listStructured, listByType } from "../../../plugin/src/store.js";
import { deterministicVector } from "../helpers/mock-embedder.js";

let tempDir: string;

beforeAll(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-test-store-"));
	// Redirect store path BEFORE init so writes never touch real store
	vs._setStorePathForTests(tempDir);
	await db.init(tempDir);

	// Verify isolation: store path must be under tmpdir, not ~/.codexfi
	const realStoreDir = resolve(homedir(), ".codexfi");
	if (tempDir.startsWith(realStoreDir)) {
		throw new Error(`Test isolation failure: tempDir ${tempDir} is inside real store ${realStoreDir}`);
	}

	// Seed test data — 5 memories for "test-project", 2 for "other-project"
	const now = new Date().toISOString();

	db.store.add([
		{
			id: "mem-1",
			memory: "Authentication uses JWT tokens stored in httpOnly cookies",
			user_id: "test-project",
			vector: deterministicVector("Authentication uses JWT tokens stored in httpOnly cookies"),
			metadata_json: JSON.stringify({ type: "architecture" }),
			created_at: now,
			updated_at: now,
			hash: "hash1",
			chunk: "Full context about auth implementation...",
			superseded_by: "",
			type: "architecture",
		},
		{
			id: "mem-2",
			memory: "Tech stack: Bun runtime, TypeScript, SQLite via bun:sqlite",
			user_id: "test-project",
			vector: deterministicVector("Tech stack: Bun runtime, TypeScript, SQLite via bun:sqlite"),
			metadata_json: JSON.stringify({ type: "tech-context" }),
			created_at: now,
			updated_at: now,
			hash: "hash2",
			chunk: "Project uses Bun as the runtime...",
			superseded_by: "",
			type: "tech-context",
		},
		{
			id: "mem-3",
			memory: "Database migrations stored in db/migrations/ using goose",
			user_id: "test-project",
			vector: deterministicVector("Database migrations stored in db/migrations/ using goose"),
			metadata_json: JSON.stringify({ type: "learned-pattern" }),
			created_at: now,
			updated_at: now,
			hash: "hash3",
			chunk: "",
			superseded_by: "",
			type: "learned-pattern",
		},
		{
			id: "mem-4",
			memory: "User prefers tabs for indentation",
			user_id: "test-project",
			vector: deterministicVector("User prefers tabs for indentation"),
			metadata_json: JSON.stringify({ type: "preference" }),
			created_at: now,
			updated_at: now,
			hash: "hash4",
			chunk: "",
			superseded_by: "",
			type: "preference",
		},
		{
			id: "mem-5-superseded",
			memory: "Old auth implementation (superseded)",
			user_id: "test-project",
			vector: deterministicVector("Old auth implementation"),
			metadata_json: JSON.stringify({ type: "architecture" }),
			created_at: now,
			updated_at: now,
			hash: "hash5",
			chunk: "",
			superseded_by: "mem-1",
			type: "architecture",
		},
		{
			id: "mem-other-1",
			memory: "Other project uses PostgreSQL 15",
			user_id: "other-project",
			vector: deterministicVector("Other project uses PostgreSQL 15"),
			metadata_json: JSON.stringify({ type: "tech-context" }),
			created_at: now,
			updated_at: now,
			hash: "hash6",
			chunk: "",
			superseded_by: "",
			type: "tech-context",
		},
		{
			id: "mem-other-2",
			memory: "Other project deploys to AWS ECS",
			user_id: "other-project",
			vector: deterministicVector("Other project deploys to AWS ECS"),
			metadata_json: JSON.stringify({ type: "architecture" }),
			created_at: now,
			updated_at: now,
			hash: "hash7",
			chunk: "",
			superseded_by: "",
			type: "architecture",
		},
	]);
});

afterAll(() => {
	vs._resetForTests();
	try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ── searchByVector ──────────────────────────────────────────────────────────────

describe("searchByVector", () => {
	test("finds memories and returns ranked results", async () => {
		// Use the exact same text as a stored memory to guarantee a match
		const queryVector = deterministicVector("Authentication uses JWT tokens stored in httpOnly cookies");
		const results = await searchByVector(queryVector, "test-project", {
			limit: 5,
			threshold: 0,
		});

		expect(results.length).toBeGreaterThan(0);
		// Exact same vector should produce perfect score for the matching memory
		const jwtResult = results.find(r => r.memory.includes("JWT"));
		expect(jwtResult).toBeDefined();
		expect(jwtResult!.score).toBeCloseTo(1.0, 1);
	});

	test("filters by user_id (project isolation)", async () => {
		const queryVector = deterministicVector("PostgreSQL database");
		const results = await searchByVector(queryVector, "other-project", {
			limit: 10,
			threshold: 0,
		});

		// Should only find "other-project" memories
		for (const r of results) {
			expect(r.id).toMatch(/^mem-other/);
		}
	});

	test("excludes superseded memories", async () => {
		const queryVector = deterministicVector("authentication");
		const results = await searchByVector(queryVector, "test-project", {
			limit: 10,
			threshold: 0,
		});

		const ids = results.map(r => r.id);
		expect(ids).not.toContain("mem-5-superseded");
	});

	test("respects limit parameter", async () => {
		const queryVector = deterministicVector("anything");
		const results = await searchByVector(queryVector, "test-project", {
			limit: 2,
			threshold: 0,
		});

		expect(results.length).toBeLessThanOrEqual(2);
	});

	test("respects threshold parameter", async () => {
		const queryVector = deterministicVector("completely unrelated quantum physics");
		const results = await searchByVector(queryVector, "test-project", {
			limit: 10,
			threshold: 0.99, // Very high threshold — should find nothing
		});

		expect(results.length).toBe(0);
	});

	test("returns score, metadata, and chunk", async () => {
		const queryVector = deterministicVector("JWT authentication cookies");
		const results = await searchByVector(queryVector, "test-project", {
			limit: 1,
			threshold: 0,
		});

		const r = results[0]!;
		expect(r.score).toBeGreaterThan(0);
		expect(r.score).toBeLessThanOrEqual(1);
		expect(r.metadata).toBeDefined();
		expect(typeof r.metadata).toBe("object");
		expect(r.id).toBeDefined();
		expect(r.memory).toBeDefined();
	});

	test("returns empty array for nonexistent user", async () => {
		const queryVector = deterministicVector("anything");
		const results = await searchByVector(queryVector, "nonexistent-user", {
			limit: 10,
			threshold: 0,
		});

		expect(results).toEqual([]);
	});
});

// ── list ────────────────────────────────────────────────────────────────────────

describe("list", () => {
	test("returns memories for a user", async () => {
		const results = await list("test-project", { limit: 10 });
		expect(results.length).toBe(4); // 4 active, 1 superseded excluded
	});

	test("excludes superseded by default", async () => {
		const results = await list("test-project", { limit: 10 });
		const ids = results.map(r => r.id);
		expect(ids).not.toContain("mem-5-superseded");
	});

	test("includes superseded when requested", async () => {
		const results = await list("test-project", { limit: 10, includeSuperseded: true });
		const ids = results.map(r => r.id);
		expect(ids).toContain("mem-5-superseded");
		expect(results.length).toBe(5);
	});

	test("respects limit parameter", async () => {
		const results = await list("test-project", { limit: 2 });
		expect(results.length).toBe(2);
	});

	test("returns empty for nonexistent user", async () => {
		const results = await list("nonexistent-user");
		expect(results).toEqual([]);
	});

	test("returns parsed metadata", async () => {
		const results = await list("test-project", { limit: 10 });
		const arch = results.find(r => r.id === "mem-1");
		expect(arch).toBeDefined();
		expect(arch!.metadata.type).toBe("architecture");
	});

	test("isolates by user_id", async () => {
		const results = await list("other-project", { limit: 10 });
		expect(results.length).toBe(2);
		for (const r of results) {
			expect(r.user_id).toBe("other-project");
		}
	});
});

// ── deleteMemory ────────────────────────────────────────────────────────────────

describe("deleteMemory", () => {
	test("deletes a memory by ID", async () => {
		// Add a throwaway memory directly via db.store.add(), then delete it
		const now = new Date().toISOString();
		db.store.add([{
			id: "mem-delete-test",
			memory: "To be deleted",
			user_id: "test-project",
			vector: new Array(EMBEDDING_DIMS).fill(0),
			metadata_json: "{}",
			created_at: now,
			updated_at: now,
			hash: "deleteme",
			chunk: "",
			superseded_by: "",
			type: "",
		}]);

		await deleteMemory("mem-delete-test");

		// Verify it's gone
		const results = await list("test-project", { limit: 100 });
		const ids = results.map(r => r.id);
		expect(ids).not.toContain("mem-delete-test");
	});

	test("no-ops on unknown ID without throwing", async () => {
		const countBefore = await list("test-project", { limit: 100 });
		await deleteMemory("nonexistent-id-12345");
		const countAfter = await list("test-project", { limit: 100 });
		expect(countAfter.length).toBe(countBefore.length);
	});
});

// ── getProfile ──────────────────────────────────────────────────────────────────

describe("getProfile", () => {
	test("returns memories with id, memory, metadata, created_at", async () => {
		const results = await getProfile("test-project", 10);
		expect(results.length).toBeGreaterThan(0);

		const first = results[0]!;
		expect(first.id).toBeDefined();
		expect(first.memory).toBeDefined();
		expect(first.metadata).toBeDefined();
		expect(first.created_at).toBeDefined();
	});

	test("excludes superseded memories", async () => {
		const results = await getProfile("test-project", 10);
		const ids = results.map(r => r.id);
		expect(ids).not.toContain("mem-5-superseded");
	});
});

// ── listStructured (issue #201) ──────────────────────────────────────────────
// Uses a dedicated user_id so these rows don't affect the exact-count
// assertions in the `list` describe block above.

describe("listStructured", () => {
	const SF_USER = "structured-fetch-test";

	beforeAll(() => {
		const ts = (day: string) => `2026-01-${day}T00:00:00.000Z`;

		db.store.add([
			{
				id: "sf-tech-oldest",
				memory: "Oldest tech fact",
				user_id: SF_USER,
				vector: deterministicVector("Oldest tech fact"),
				metadata_json: JSON.stringify({ type: "tech-context" }),
				created_at: ts("01"),
				updated_at: ts("01"),
				hash: "sf1",
				chunk: "",
				superseded_by: "",
				type: "tech-context",
			},
			{
				id: "sf-arch",
				memory: "An architecture fact",
				user_id: SF_USER,
				vector: deterministicVector("An architecture fact"),
				metadata_json: JSON.stringify({ type: "architecture" }),
				created_at: ts("02"),
				updated_at: ts("02"),
				hash: "sf2",
				chunk: "",
				superseded_by: "",
				type: "architecture",
			},
			// Newer than both structural rows above, but NOT a rendered type —
			// under the pre-#201 behavior these would have won the type-agnostic
			// recency window and starved the structural rows. Must never appear
			// in listStructured() results regardless of recency.
			{
				id: "sf-learned-pattern",
				memory: "Should never appear in listStructured (learned-pattern)",
				user_id: SF_USER,
				vector: deterministicVector("Should never appear in listStructured (learned-pattern)"),
				metadata_json: JSON.stringify({ type: "learned-pattern" }),
				created_at: ts("03"),
				updated_at: ts("03"),
				hash: "sf3",
				chunk: "",
				superseded_by: "",
				type: "learned-pattern",
			},
			{
				id: "sf-preference",
				memory: "Should never appear in listStructured (preference)",
				user_id: SF_USER,
				vector: deterministicVector("Should never appear in listStructured (preference)"),
				metadata_json: JSON.stringify({ type: "preference" }),
				created_at: ts("04"),
				updated_at: ts("04"),
				hash: "sf4",
				chunk: "",
				superseded_by: "",
				type: "preference",
			},
			// Superseded tech-context — newer than the active ones, but must be
			// excluded regardless of type or recency.
			{
				id: "sf-tech-superseded",
				memory: "Superseded tech fact",
				user_id: SF_USER,
				vector: deterministicVector("Superseded tech fact"),
				metadata_json: JSON.stringify({ type: "tech-context" }),
				created_at: ts("05"),
				updated_at: ts("05"),
				hash: "sf5",
				chunk: "",
				superseded_by: "sf-tech-oldest",
				type: "tech-context",
			},
			{
				id: "sf-tech-newest",
				memory: "Newest tech fact",
				user_id: SF_USER,
				vector: deterministicVector("Newest tech fact"),
				metadata_json: JSON.stringify({ type: "tech-context" }),
				created_at: ts("06"),
				updated_at: ts("06"),
				hash: "sf6",
				chunk: "",
				superseded_by: "",
				type: "tech-context",
			},
		]);
	});

	test("returns only the requested rendered types, excluding atomic types even when newer", async () => {
		const results = await listStructured(SF_USER, ["tech-context", "architecture"]);
		const ids = results.map(r => r.id);

		expect(ids).toContain("sf-tech-oldest");
		expect(ids).toContain("sf-tech-newest");
		expect(ids).toContain("sf-arch");
		expect(ids).not.toContain("sf-learned-pattern");
		expect(ids).not.toContain("sf-preference");
	});

	test("excludes superseded memories regardless of type or recency", async () => {
		const results = await listStructured(SF_USER, ["tech-context", "architecture"]);
		const ids = results.map(r => r.id);
		expect(ids).not.toContain("sf-tech-superseded");
	});

	test("sorts newest-first by updated_at", async () => {
		const results = await listStructured(SF_USER, ["tech-context", "architecture"]);
		const ids = results.map(r => r.id);
		expect(ids).toEqual(["sf-tech-newest", "sf-arch", "sf-tech-oldest"]);
	});

	test("respects limit — returns the newest N, not the oldest N", async () => {
		const results = await listStructured(SF_USER, ["tech-context", "architecture"], { limit: 2 });
		const ids = results.map(r => r.id);
		expect(ids).toEqual(["sf-tech-newest", "sf-arch"]);
	});

	test("returns empty for a type not present", async () => {
		const results = await listStructured(SF_USER, ["product-context"]);
		expect(results).toEqual([]);
	});
});

// ── listByType / getMemoriesByTypes sort-order fix (issue #201) ─────────────
// Uses its own user_id so these rows don't affect other describe blocks.

describe("listByType sort order", () => {
	const SORT_USER = "sort-order-test";

	beforeAll(() => {
		const ts = (day: string) => `2026-02-${day}T00:00:00.000Z`;

		db.store.add(
			["01", "02", "03", "04", "05"].map((day, i) => ({
				id: `sort-e${i + 1}`,
				memory: `Error solution ${i + 1}`,
				user_id: SORT_USER,
				vector: deterministicVector(`Error solution ${i + 1}`),
				metadata_json: JSON.stringify({ type: "error-solution" }),
				created_at: ts(day),
				updated_at: ts(day),
				hash: `sort-hash-${i + 1}`,
				chunk: "",
				superseded_by: "",
				type: "error-solution",
			})),
		);
	});

	test("with a limit: returns the newest N, not the oldest N", async () => {
		// sort-e5 was created last (2026-02-05) — the pre-fix behavior sorted
		// ascending then sliced, silently returning sort-e1/e2 (oldest) instead.
		const results = await listByType(SORT_USER, ["error-solution"], { limit: 2 });
		const ids = results.map(r => r.id);
		expect(ids).toEqual(["sort-e5", "sort-e4"]);
	});

	test("without a limit: returns ALL, sorted oldest-first", async () => {
		// Required for ageSessionSummaries(), which reads existing[0] as "the
		// oldest" entry to condense. Must not change for the unlimited case.
		const results = await listByType(SORT_USER, ["error-solution"]);
		const ids = results.map(r => r.id);
		expect(ids).toEqual(["sort-e1", "sort-e2", "sort-e3", "sort-e4", "sort-e5"]);
	});
});

// ── store.update() `type` column (issue #201, Item 3) ────────────────────────
// Lighter-weight test suggested during review in place of a full ingest()
// mock: verifies the underlying primitive db.store.update() correctly syncs
// the raw `type` column, not just metadata_json.type — the exact mechanism
// the dedup-refresh fix in store.ts's ingest() now relies on.

describe("store.update() type column sync", () => {
	const TYPE_SYNC_USER = "type-column-sync-test";

	test("updating with a type value changes the raw type column, not just metadata_json", async () => {
		const now = new Date().toISOString();
		db.store.add([{
			id: "type-sync-1",
			memory: "Initial fact",
			user_id: TYPE_SYNC_USER,
			vector: deterministicVector("Initial fact"),
			metadata_json: JSON.stringify({ type: "architecture" }),
			created_at: now,
			updated_at: now,
			hash: "type-sync-hash-1",
			chunk: "",
			superseded_by: "",
			type: "architecture",
		}]);

		db.store.update({ id: "type-sync-1" }, {
			metadata_json: JSON.stringify({ type: "tech-context" }),
			type: "tech-context",
			updated_at: new Date().toISOString(),
		});

		const rows = db.store.scan({ user_id: TYPE_SYNC_USER, superseded_by: "" });
		const row = rows.find(r => r.id === "type-sync-1");

		expect(row).toBeDefined();
		expect(row!.type).toBe("tech-context");
		expect(JSON.parse(row!.metadata_json).type).toBe("tech-context");
	});

	test("omitting type from update() leaves the raw column unchanged (documents the pre-fix drift risk)", async () => {
		const now = new Date().toISOString();
		db.store.add([{
			id: "type-sync-2",
			memory: "Another fact",
			user_id: TYPE_SYNC_USER,
			vector: deterministicVector("Another fact"),
			metadata_json: JSON.stringify({ type: "architecture" }),
			created_at: now,
			updated_at: now,
			hash: "type-sync-hash-2",
			chunk: "",
			superseded_by: "",
			type: "architecture",
		}]);

		// Simulates the pre-fix bug: update() called WITHOUT a type field.
		db.store.update({ id: "type-sync-2" }, {
			metadata_json: JSON.stringify({ type: "tech-context" }),
			updated_at: new Date().toISOString(),
		});

		const rows = db.store.scan({ user_id: TYPE_SYNC_USER, superseded_by: "" });
		const row = rows.find(r => r.id === "type-sync-2");

		expect(row).toBeDefined();
		// The raw column is stale — this is exactly the drift store.ts's
		// ingest() dedup path now avoids by always passing `type: factType`.
		expect(row!.type).toBe("architecture");
		expect(JSON.parse(row!.metadata_json).type).toBe("tech-context");
	});
});
