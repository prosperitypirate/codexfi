/**
 * Integration tests for db.ts — pure TS vector store initialization and refresh.
 *
 * getTable() / getDb() no longer exist. db.ts is now a thin
 * wrapper over vector-store.ts. These tests verify init(), refresh(), and that
 * the underlying store functions (add, countRows, deleteById) work correctly
 * through the adapter.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import { refresh, store } from "../../../plugin/src/db.js";
import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";

let tempDir: string;

beforeAll(async () => {
	tempDir = await setupTempDb();
});

afterAll(() => {
	teardownTempDb();
});

describe("db.init", () => {
	test("store is accessible after init", () => {
		expect(store).toBeDefined();
		expect(typeof store.add).toBe("function");
		expect(typeof store.search).toBe("function");
		expect(typeof store.scan).toBe("function");
	});

	test("store is empty after reset", () => {
		expect(store.countRows()).toBe(0);
	});
});

describe("store via db adapter", () => {
	test("accepts a valid memory row via store.add()", () => {
		const before = store.countRows();
		const now = new Date().toISOString();
		store.add([{
			id: "test-schema-1",
			memory: "Test memory content",
			user_id: "test-user",
			vector: new Array(EMBEDDING_DIMS).fill(0.1),
			metadata_json: JSON.stringify({ type: "tech-context" }),
			created_at: now,
			updated_at: now,
			hash: "abc123",
			chunk: "some context chunk",
			superseded_by: "",
			type: "tech-context",
		}]);

		expect(store.countRows()).toBe(before + 1);
	});

	test("store.countRows() reflects added row", () => {
		expect(store.getById("test-schema-1")).toBeDefined();
	});

	test("store.deleteById() removes the row", () => {
		const before = store.countRows();
		store.deleteById("test-schema-1");
		expect(store.countRows()).toBe(before - 1);
		expect(store.getById("test-schema-1")).toBeUndefined();
	});

	test("vector dimension mismatch does not crash — stored as-is", () => {
		// Pure TS store does not validate dimensions — it stores whatever is given.
		// Dimension validation happens at embed time, not store time.
		const now = new Date().toISOString();
		expect(() => {
			store.add([{
				id: "test-schema-bad-dim",
				memory: "bad vector",
				user_id: "test-user",
				vector: [0.1, 0.2, 0.3], // Only 3 dims
				metadata_json: "{}",
				created_at: now,
				updated_at: now,
				hash: "",
				chunk: "",
				superseded_by: "",
				type: "",
			}]);
		}).not.toThrow();
		// Clean up
		store.deleteById("test-schema-bad-dim");
	});
});

describe("refresh", () => {
	test("refresh() completes without error", async () => {
		await expect(refresh()).resolves.toBeUndefined();
	});

	test("store is still accessible after refresh", () => {
		expect(typeof store.countRows()).toBe("number");
		expect(typeof store.search).toBe("function");
	});
});
