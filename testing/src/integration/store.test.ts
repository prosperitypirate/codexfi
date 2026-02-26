/**
 * Integration tests for store.ts — CRUD, search, list, delete, dedup.
 *
 * Uses real LanceDB in a temp directory. Bypasses ingest() (which needs
 * a real extraction LLM) by inserting rows directly into the table,
 * then testing searchByVector(), list(), deleteMemory(), getProfile().
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as db from "../../../plugin/src/db.js";
import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";
import { searchByVector, list, deleteMemory, getProfile } from "../../../plugin/src/store.js";
import { deterministicVector } from "../helpers/mock-embedder.js";

let tempDir: string;

beforeAll(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-test-store-"));
	await db.init(tempDir);

	// Seed test data — 5 memories for "test-project", 2 for "other-project"
	const table = db.getTable();
	const now = new Date().toISOString();

	await table.add([
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
		// Add a throwaway memory, then delete it
		const table = db.getTable();
		await table.add([{
			id: "mem-delete-test",
			memory: "To be deleted",
			user_id: "test-project",
			vector: new Array(EMBEDDING_DIMS).fill(0),
			metadata_json: "{}",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
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

	test("rejects invalid ID", async () => {
		await expect(deleteMemory("'; DROP TABLE --")).rejects.toThrow("Invalid memory_id");
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
