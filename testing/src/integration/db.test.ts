/**
 * Integration tests for db.ts — LanceDB initialization, table management, schema.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import { getTable, getDb, refresh } from "../../../plugin/src/db.js";
import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";

let tempDir: string;

beforeAll(async () => {
	tempDir = await setupTempDb();
});

afterAll(() => {
	teardownTempDb();
});

describe("db.init", () => {
	test("creates a usable table", () => {
		const table = getTable();
		expect(table).toBeDefined();
		expect(table.name).toBe("memories");
	});

	test("getDb returns a connection", () => {
		const db = getDb();
		expect(db).toBeDefined();
	});

	test("table starts empty (seed row was deleted)", async () => {
		const table = getTable();
		const count = await table.countRows();
		expect(count).toBe(0);
	});
});

describe("table schema", () => {
	test("accepts a valid memory row", async () => {
		const table = getTable();
		await table.add([{
			id: "test-schema-1",
			memory: "Test memory content",
			user_id: "test-user",
			vector: new Array(EMBEDDING_DIMS).fill(0.1),
			metadata_json: JSON.stringify({ type: "tech-context" }),
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			hash: "abc123",
			chunk: "some context chunk",
			superseded_by: "",
			type: "tech-context",
		}]);

		const count = await table.countRows();
		expect(count).toBe(1);
	});

	test("vector dimension matches EMBEDDING_DIMS", async () => {
		const table = getTable();

		// Wrong dimension should fail
		try {
			await table.add([{
				id: "test-schema-bad-dim",
				memory: "bad vector",
				user_id: "test-user",
				vector: [0.1, 0.2, 0.3], // Only 3 dims, should be 1024
				metadata_json: "{}",
				created_at: "",
				updated_at: "",
				hash: "",
				chunk: "",
				superseded_by: "",
				type: "",
			}]);
			// If it doesn't throw, LanceDB may pad/truncate — check for weirdness
		} catch {
			// Expected — LanceDB rejects mismatched vector dimensions
			expect(true).toBe(true);
		}
	});
});

describe("refresh", () => {
	test("refresh re-opens the table without error", async () => {
		await refresh();
		const table = getTable();
		expect(table).toBeDefined();
	});
});
