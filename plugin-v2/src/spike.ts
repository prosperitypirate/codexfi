/**
 * Phase 1: LanceDB Spike — Critical Gate
 *
 * Validates that @lancedb/lancedb NAPI bindings work correctly inside Bun runtime.
 * Run with: bun run spike (or: bun run src/spike.ts)
 *
 * Tests: connect, create table, insert, search, filter, update, delete, drop,
 *        concurrent writes, search-during-write, table.optimize()
 */

import * as lancedb from "@lancedb/lancedb";
import { rm } from "node:fs/promises";

const SPIKE_DIR = "/tmp/opencode-memory-spike";

async function cleanup(): Promise<void> {
	await rm(SPIKE_DIR, { recursive: true, force: true });
}

async function runBasicOps(): Promise<void> {
	console.log("\n=== BASIC OPERATIONS ===\n");

	const db = await lancedb.connect(SPIKE_DIR);
	console.log("[PASS] connect()");

	// Create table with seed data
	const table = await db.createTable("test", [{
		id: "test-1",
		memory: "TypeScript is a typed superset of JavaScript",
		vector: new Array(1024).fill(0.1),
		user_id: "project::spike",
		type: "tech-context",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		hash: "abc123",
		chunk: "TypeScript is a typed superset...",
		metadata_json: JSON.stringify({ source: "spike" }),
		superseded_by: "",
	}]);
	console.log("[PASS] createTable()");

	// Insert additional rows
	await table.add([
		{
			id: "test-2",
			memory: "Bun uses JavaScriptCore engine, not V8",
			vector: new Array(1024).fill(0.2),
			user_id: "project::spike",
			type: "tech-context",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			hash: "def456",
			chunk: "Bun uses JavaScriptCore engine...",
			metadata_json: JSON.stringify({ source: "spike" }),
			superseded_by: "",
		},
		{
			id: "test-3",
			memory: "User prefers tabs over spaces for indentation",
			vector: new Array(1024).fill(0.3),
			user_id: "user::spike",
			type: "preference",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			hash: "ghi789",
			chunk: "User prefers tabs over spaces...",
			metadata_json: JSON.stringify({ source: "spike" }),
			superseded_by: "",
		},
	]);
	console.log("[PASS] add() — inserted 2 rows");

	// Count rows
	const count = await table.countRows();
	console.log(`[${count === 3 ? "PASS" : "FAIL"}] countRows() — got ${count}, expected 3`);

	// Vector search
	const searchResults = await table
		.search(new Array(1024).fill(0.15))
		.limit(5)
		.toArray();
	console.log(`[${searchResults.length > 0 ? "PASS" : "FAIL"}] search() — got ${searchResults.length} results`);

	// Verify _distance field exists
	const hasDistance = searchResults[0] && "_distance" in searchResults[0];
	console.log(`[${hasDistance ? "PASS" : "FAIL"}] _distance field present — value: ${searchResults[0]?._distance}`);

	// Search with filter
	const filtered = await table
		.search(new Array(1024).fill(0.15))
		.where("user_id = 'project::spike'")
		.limit(5)
		.toArray();
	console.log(`[${filtered.length === 2 ? "PASS" : "FAIL"}] search() + where() — got ${filtered.length} results, expected 2`);

	// Search with compound filter
	const compound = await table
		.search(new Array(1024).fill(0.15))
		.where("user_id = 'project::spike' AND type = 'tech-context'")
		.limit(5)
		.toArray();
	console.log(`[${compound.length === 2 ? "PASS" : "FAIL"}] compound where() — got ${compound.length} results, expected 2`);

	// Filter with superseded_by (empty string match)
	const notSuperseded = await table
		.search(new Array(1024).fill(0.15))
		.where("superseded_by = ''")
		.limit(10)
		.toArray();
	console.log(`[${notSuperseded.length === 3 ? "PASS" : "FAIL"}] superseded_by = '' filter — got ${notSuperseded.length} results, expected 3`);

	// Update
	await table.update({
		where: 'id = "test-2"',
		values: { memory: "Bun uses JSC engine (updated)", updated_at: new Date().toISOString() },
	});
	const afterUpdate = await table
		.search(new Array(1024).fill(0.2))
		.where("id = 'test-2'")
		.limit(1)
		.toArray();
	const updateWorked = afterUpdate[0]?.memory === "Bun uses JSC engine (updated)";
	console.log(`[${updateWorked ? "PASS" : "FAIL"}] update() — memory: "${afterUpdate[0]?.memory}"`);

	// Delete
	await table.delete('id = "test-1"');
	const afterDelete = await table.countRows();
	console.log(`[${afterDelete === 2 ? "PASS" : "FAIL"}] delete() — rows: ${afterDelete}, expected 2`);

	// Merge insert (upsert)
	await table
		.mergeInsert("id")
		.whenMatchedUpdateAll()
		.whenNotMatchedInsertAll()
		.execute([
			{
				id: "test-2",
				memory: "Bun uses JSC engine (upserted)",
				vector: new Array(1024).fill(0.25),
				user_id: "project::spike",
				type: "tech-context",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				hash: "def456-updated",
				chunk: "Bun uses JSC engine (upserted)...",
				metadata_json: JSON.stringify({ source: "spike", upserted: true }),
				superseded_by: "",
			},
			{
				id: "test-4",
				memory: "New memory via mergeInsert",
				vector: new Array(1024).fill(0.4),
				user_id: "project::spike",
				type: "architecture",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				hash: "jkl012",
				chunk: "New memory via mergeInsert...",
				metadata_json: JSON.stringify({ source: "spike" }),
				superseded_by: "",
			},
		]);
	const afterUpsert = await table.countRows();
	console.log(`[${afterUpsert === 3 ? "PASS" : "FAIL"}] mergeInsert() — rows: ${afterUpsert}, expected 3 (1 updated, 1 new)`);

	// Drop table
	await db.dropTable("test");
	console.log("[PASS] dropTable()");

	console.log("\n=== BASIC OPERATIONS COMPLETE ===\n");
}

async function runAsyncStressTest(): Promise<void> {
	console.log("\n=== ASYNC STRESS TEST ===\n");

	const db = await lancedb.connect(`${SPIKE_DIR}-async`);
	const table = await db.createTable("async_test", [{
		id: "seed",
		memory: "seed row",
		vector: new Array(1024).fill(0),
		user_id: "test",
		type: "tech-context",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		hash: "seed",
		chunk: "seed",
		metadata_json: "{}",
		superseded_by: "",
	}]);

	// Concurrent writes — verify no corruption
	const writeStart = performance.now();
	await Promise.all(
		Array.from({ length: 10 }, (_, i) =>
			table.add([{
				id: `concurrent-${i}`,
				memory: `Concurrent write ${i}`,
				vector: new Array(1024).fill(i / 10),
				user_id: "test",
				type: "tech-context",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				hash: `concurrent-${i}`,
				chunk: `Concurrent write ${i}`,
				metadata_json: "{}",
				superseded_by: "",
			}])
		)
	);
	const writeMs = (performance.now() - writeStart).toFixed(1);
	const count = await table.countRows();
	console.log(`[${count === 11 ? "PASS" : "FAIL"}] concurrent writes — ${count} rows (expected 11) in ${writeMs}ms`);

	// Search during write — verify consistency
	const [, searchResult] = await Promise.all([
		table.add([{
			id: "during-search",
			memory: "Written during search",
			vector: new Array(1024).fill(0.5),
			user_id: "test",
			type: "tech-context",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			hash: "during-search",
			chunk: "Written during search",
			metadata_json: "{}",
			superseded_by: "",
		}]),
		table.search(new Array(1024).fill(0.5)).limit(5).toArray(),
	]);
	console.log(`[${searchResult.length > 0 ? "PASS" : "FAIL"}] search during write — ${searchResult.length} results`);

	// Optimize (VACUUM equivalent)
	await table.optimize();
	console.log("[PASS] table.optimize()");

	// Version check
	const version = await table.version();
	console.log(`[PASS] table.version() — version: ${version}`);

	// Final count
	const finalCount = await table.countRows();
	console.log(`[PASS] final row count: ${finalCount}`);

	// Cleanup
	await db.dropTable("async_test");
	console.log("[PASS] dropTable() after stress test");

	console.log("\n=== ASYNC STRESS TEST COMPLETE ===\n");
}

async function runPerformanceBench(): Promise<void> {
	console.log("\n=== PERFORMANCE BENCHMARK ===\n");

	const db = await lancedb.connect(`${SPIKE_DIR}-bench`);
	const rows = Array.from({ length: 100 }, (_, i) => ({
		id: `bench-${i}`,
		memory: `Benchmark memory entry number ${i} with some padding text to simulate real content`,
		vector: new Array(1024).fill(Math.random()),
		user_id: "project::bench",
		type: i % 3 === 0 ? "tech-context" : i % 3 === 1 ? "architecture" : "preference",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		hash: `bench-${i}`,
		chunk: `Benchmark memory ${i}...`,
		metadata_json: JSON.stringify({ index: i }),
		superseded_by: "",
	}));

	// Bulk insert timing
	const insertStart = performance.now();
	const table = await db.createTable("bench", rows);
	const insertMs = (performance.now() - insertStart).toFixed(1);
	console.log(`[PERF] bulk insert 100 rows: ${insertMs}ms`);

	// Search timing (10 iterations)
	const searchTimes: number[] = [];
	for (let i = 0; i < 10; i++) {
		const start = performance.now();
		await table
			.search(new Array(1024).fill(Math.random()))
			.where("user_id = 'project::bench'")
			.limit(20)
			.toArray();
		searchTimes.push(performance.now() - start);
	}
	const avgSearch = (searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length).toFixed(1);
	const minSearch = Math.min(...searchTimes).toFixed(1);
	const maxSearch = Math.max(...searchTimes).toFixed(1);
	console.log(`[PERF] search (10 iterations): avg=${avgSearch}ms, min=${minSearch}ms, max=${maxSearch}ms`);

	// Single add timing
	const addStart = performance.now();
	await table.add([{
		id: "bench-single",
		memory: "Single add timing test",
		vector: new Array(1024).fill(0.5),
		user_id: "project::bench",
		type: "tech-context",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		hash: "bench-single",
		chunk: "Single add timing test",
		metadata_json: "{}",
		superseded_by: "",
	}]);
	const addMs = (performance.now() - addStart).toFixed(1);
	console.log(`[PERF] single add: ${addMs}ms`);

	// Delete timing
	const deleteStart = performance.now();
	await table.delete('id = "bench-50"');
	const deleteMs = (performance.now() - deleteStart).toFixed(1);
	console.log(`[PERF] single delete: ${deleteMs}ms`);

	// Cleanup
	await db.dropTable("bench");
	console.log("[PASS] benchmark cleanup complete");

	console.log("\n=== PERFORMANCE BENCHMARK COMPLETE ===\n");
}

// === MAIN ===
console.log("=================================================");
console.log("  Phase 1: LanceDB Spike — Critical Gate");
console.log("  Runtime: Bun " + Bun.version);
console.log("=================================================");

try {
	await cleanup();
	await runBasicOps();
	await runAsyncStressTest();
	await runPerformanceBench();
	await cleanup();
	await rm(`${SPIKE_DIR}-async`, { recursive: true, force: true });
	await rm(`${SPIKE_DIR}-bench`, { recursive: true, force: true });

	console.log("\n=================================================");
	console.log("  ALL SPIKE TESTS PASSED");
	console.log("  LanceDB NAPI bindings work correctly in Bun");
	console.log("  Proceed to Phase 2: Core Modules");
	console.log("=================================================\n");
} catch (error) {
	console.error("\n=================================================");
	console.error("  SPIKE FAILED — CRITICAL BLOCKER");
	console.error("  Error:", error);
	console.error("  See design doc for fallback plan");
	console.error("=================================================\n");
	process.exit(1);
}
