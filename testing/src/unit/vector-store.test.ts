/**
 * Unit tests for the SQLite vector store — cosine similarity, CRUD, filters,
 * round-trip vector encoding, and lifecycle (init/reload).
 *
 * Isolation: each test uses _setStorePathForTests() to redirect to a fresh
 * temp directory, so tests never interfere with each other or with the real
 * ~/.codexfi/store.db.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as vs from "../../../plugin/src/store/index.js";
import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";
import { deterministicVector } from "../helpers/mock-embedder.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal AddRecord suitable for inserting into the vector store.
 *
 * Defaults:
 *   - `userId`       → "u1"
 *   - `superseded_by` → "" (active, not superseded)
 *   - `vector`       → deterministicVector(text) — repeatable 1024-dim float array
 *   - `type`         → "tech-context"
 *   - `hash`         → id  (good enough for uniqueness in tests)
 */
function makeRecord(id: string, text: string, userId = "u1", superseded_by = ""): vs.AddRecord {
	const now = new Date().toISOString();
	return {
		id,
		memory: text,
		user_id: userId,
		vector: deterministicVector(text),
		metadata_json: JSON.stringify({ type: "tech-context" }),
		created_at: now,
		updated_at: now,
		hash: id,
		chunk: "",
		superseded_by,
		type: "tech-context",
	};
}

// ── Per-test isolation ────────────────────────────────────────────────────────

// Redirect to a fresh temp dir before every test so writes never
// touch the real ~/.codexfi/store.db.
let tempDir: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-vs-unit-"));
	vs._setStorePathForTests(tempDir);
});

afterEach(() => {
	vs._resetForTests();
	try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ── cosineDistance (via search) ───────────────────────────────────────────────

describe("cosine similarity", () => {
	test("identical vectors produce distance ≈ 0 (score ≈ 1)", () => {
		const rec = makeRecord("id-cos-1", "authentication JWT cookies");
		vs.add([rec]);

		const results = vs.search(rec.vector, { limit: 1 });
		expect(results.length).toBe(1);
		expect(results[0]!._distance).toBeCloseTo(0, 4);
	});

	test("orthogonal unit vectors produce distance ≈ 1", () => {
		// Build two orthogonal vectors — each points along a single basis axis.
		// Cosine distance = 1 - dot(a,b)/(|a||b|) = 1 - 0/1 = 1.
		const a = new Array(EMBEDDING_DIMS).fill(0);
		const b = new Array(EMBEDDING_DIMS).fill(0);
		a[0] = 1; // unit vector along dim 0
		b[1] = 1; // unit vector along dim 1 — orthogonal to a

		const now = new Date().toISOString();
		vs.add([{
			id: "ortho-a",
			memory: "a",
			user_id: "u1",
			vector: a,
			metadata_json: "{}",
			created_at: now,
			updated_at: now,
			hash: "a",
			chunk: "",
			superseded_by: "",
			type: "",
		}]);

		const results = vs.search(b, { limit: 1 });
		// dot(a,b) = 0, so distance = 1 exactly
		expect(results[0]!._distance).toBeCloseTo(1, 6);
	});

	test("zero-vector query returns distance 1 for all records", () => {
		vs.add([makeRecord("id-zero", "any text")]);
		const zeroVec = new Array(EMBEDDING_DIMS).fill(0);
		const results = vs.search(zeroVec, { limit: 1 });
		expect(results[0]!._distance).toBe(1);
	});

	test("results are sorted by distance ascending", () => {
		const queryText = "authentication cookies";
		vs.add([
			makeRecord("close", queryText),
			makeRecord("far", "database schema migrations goose"),
		]);

		const results = vs.search(deterministicVector(queryText), { limit: 10 });
		for (let i = 1; i < results.length; i++) {
			expect(results[i]!._distance).toBeGreaterThanOrEqual(results[i - 1]!._distance);
		}
	});
});

// ── add / countRows / deleteById ──────────────────────────────────────────────

describe("add / countRows / deleteById", () => {
	test("store starts empty after _setStorePathForTests()", () => {
		expect(vs.countRows()).toBe(0);
	});

	test("add() increments countRows", () => {
		vs.add([makeRecord("r1", "one"), makeRecord("r2", "two")]);
		expect(vs.countRows()).toBe(2);
	});

	test("deleteById() decrements countRows", () => {
		vs.add([makeRecord("del-me", "to delete")]);
		vs.deleteById("del-me");
		expect(vs.countRows()).toBe(0);
	});

	test("deleteById() on unknown id is a no-op", () => {
		vs.add([makeRecord("stable", "stable record")]);
		vs.deleteById("does-not-exist");
		expect(vs.countRows()).toBe(1);
	});

	test("getById() returns the correct record", () => {
		vs.add([makeRecord("find-me", "find this text")]);
		const rec = vs.getById("find-me");
		expect(rec).toBeDefined();
		expect(rec!.memory).toBe("find this text");
	});

	test("getById() returns undefined for missing id", () => {
		expect(vs.getById("missing")).toBeUndefined();
	});
});

// ── update ────────────────────────────────────────────────────────────────────

describe("update", () => {
	test("updates memory and updated_at fields", () => {
		vs.add([makeRecord("upd-1", "original text")]);
		const newTime = new Date(Date.now() + 1000).toISOString();
		vs.update({ id: "upd-1" }, { memory: "updated text", updated_at: newTime });

		const rec = vs.getById("upd-1");
		expect(rec!.memory).toBe("updated text");
		expect(rec!.updated_at).toBe(newTime);
	});

	test("update on missing id is a no-op", () => {
		expect(() => vs.update({ id: "ghost" }, { memory: "x" })).not.toThrow();
		expect(vs.countRows()).toBe(0);
	});

	test("marks superseded_by on a record", () => {
		vs.add([makeRecord("old", "old memory"), makeRecord("new", "new memory")]);
		vs.update({ id: "old" }, { superseded_by: "new" });

		const rec = vs.getById("old");
		expect(rec!.superseded_by).toBe("new");
	});
});

// ── search filters ────────────────────────────────────────────────────────────

describe("search filters", () => {
	beforeEach(() => {
		vs.add([
			makeRecord("active-1", "active memory one", "user-a", ""),
			makeRecord("active-2", "active memory two", "user-a", ""),
			makeRecord("superseded-1", "old memory superseded", "user-a", "active-1"),
			makeRecord("other-user", "other user memory", "user-b", ""),
		]);
	});

	test("filter user_id excludes other users", () => {
		const results = vs.search(deterministicVector("memory"), {
			filter: { user_id: "user-a" },
			limit: 100,
		});
		for (const r of results) {
			expect(r.user_id).toBe("user-a");
		}
	});

	test("filter superseded_by: '' excludes superseded records", () => {
		const results = vs.search(deterministicVector("memory"), {
			filter: { user_id: "user-a", superseded_by: "" },
			limit: 100,
		});
		const ids = results.map(r => r.id);
		expect(ids).not.toContain("superseded-1");
		expect(ids).toContain("active-1");
		expect(ids).toContain("active-2");
	});

	test("filter superseded_by: '' does NOT exclude active records", () => {
		const results = vs.search(deterministicVector("active memory one"), {
			filter: { superseded_by: "" },
			limit: 100,
		});
		// Must find active records — this is the critical regression guard
		expect(results.length).toBeGreaterThan(0);
		const ids = results.map(r => r.id);
		expect(ids).toContain("active-1");
	});

	test("no filter returns all records including superseded", () => {
		const results = vs.search(deterministicVector("memory"), { limit: 100 });
		const ids = results.map(r => r.id);
		expect(ids).toContain("superseded-1");
	});

	test("excludeId removes specific record from results", () => {
		const results = vs.search(deterministicVector("active memory one"), {
			filter: { user_id: "user-a", excludeId: "active-1" },
			limit: 100,
		});
		const ids = results.map(r => r.id);
		expect(ids).not.toContain("active-1");
	});

	test("limit is respected", () => {
		const results = vs.search(deterministicVector("memory"), { limit: 2 });
		expect(results.length).toBeLessThanOrEqual(2);
	});
});

// ── scan filters ──────────────────────────────────────────────────────────────

describe("scan filters", () => {
	beforeEach(() => {
		vs.add([
			makeRecord("s-active-1", "active one", "user-a", ""),
			makeRecord("s-active-2", "active two", "user-a", ""),
			makeRecord("s-super-1", "superseded", "user-a", "s-active-1"),
			makeRecord("s-other", "other user", "user-b", ""),
		]);
	});

	test("scan with user_id only returns that user's records", () => {
		const results = vs.scan({ user_id: "user-a" });
		for (const r of results) {
			expect(r.user_id).toBe("user-a");
		}
	});

	test("scan with superseded_by: '' excludes superseded records", () => {
		const results = vs.scan({ user_id: "user-a", superseded_by: "" });
		const ids = results.map(r => r.id);
		expect(ids).not.toContain("s-super-1");
		expect(ids).toContain("s-active-1");
		expect(ids).toContain("s-active-2");
	});

	test("scan without superseded_by filter returns all records for user", () => {
		const results = vs.scan({ user_id: "user-a" });
		const ids = results.map(r => r.id);
		expect(ids).toContain("s-super-1");
	});

	test("scan limit is respected", () => {
		const results = vs.scan({ user_id: "user-a" }, { limit: 1 });
		expect(results.length).toBe(1);
	});
});

// ── Persistence & round-trip ─────────────────────────────────────────────────

describe("persistence (SQLite round-trip)", () => {
	test("data persists after _resetForTests + re-open", () => {
		vs.add([
			makeRecord("persist-1", "persisted memory one"),
			makeRecord("persist-2", "persisted memory two"),
		]);
		expect(vs.countRows()).toBe(2);

		// Reset and re-open the SAME database
		vs._resetForTests();
		vs._setStorePathForTests(tempDir);
		expect(vs.countRows()).toBe(2);
	});

	test("_resetForTests() clears access to data", () => {
		vs.add([makeRecord("reset-me", "should be inaccessible")]);
		expect(vs.countRows()).toBe(1);
		vs._resetForTests();
		// After reset, DB is closed — operations should throw
		expect(() => vs.countRows()).toThrow();
	});

	test("vectors survive Float32Array → BLOB → Float32Array conversion", () => {
		const originalVector = deterministicVector("vector round trip test");
		const rec = makeRecord("vec-test", "vector round trip test");
		vs.add([rec]);

		const loaded = vs.getById("vec-test");
		expect(loaded).toBeDefined();
		// Float32Array conversion: values should be close (within float32 precision)
		const origF32 = new Float32Array(originalVector);
		for (let i = 0; i < 5; i++) {
			expect(loaded!.vector[i]).toBeCloseTo(origF32[i]!, 5);
		}
	});

	test("superseded_by field is preserved", () => {
		vs.add([
			makeRecord("mem-a", "memory a", "u1", ""),
			makeRecord("mem-b", "memory b", "u1", "mem-a"),
		]);

		expect(vs.getById("mem-b")!.superseded_by).toBe("mem-a");
		expect(vs.getById("mem-a")!.superseded_by).toBe("");
	});

	test("init() is idempotent — calling twice does not duplicate records", () => {
		vs.add([makeRecord("idem-1", "idempotent init test")]);
		const countBefore = vs.countRows();
		vs.init(); // second call should be a no-op (initialised flag is set)
		expect(vs.countRows()).toBe(countBefore);
	});
});
