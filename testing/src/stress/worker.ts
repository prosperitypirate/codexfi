/**
 * stress/worker.ts — Child process entry point for stress tests.
 *
 * Each child process opens the SAME SQLite database, performs the
 * requested operation (write / read / mixed), and exits.
 *
 * Usage (invoked by parent test, not directly):
 *   bun run worker.ts <dbPath> <mode> <workerId> <count>
 *
 * Modes:
 *   write  — insert <count> records with unique IDs
 *   read   — search <count> times with random vectors
 *   mixed  — alternate between write and read
 */

import { open } from "../../../plugin/src/store/sqlite.js";
import { add, countRows } from "../../../plugin/src/store/crud.js";
import { search } from "../../../plugin/src/store/search.js";

const [dbPath, mode, workerId, countStr] = process.argv.slice(2);
if (!dbPath || !mode || !workerId || !countStr) {
	console.error("Usage: worker.ts <dbPath> <mode> <workerId> <count>");
	process.exit(1);
}

const count = parseInt(countStr, 10);

// Open the shared database (same file all workers hit)
open(dbPath);

const DIMS = 1024;

function makeVector(seed: number): Float32Array {
	const v = new Float32Array(DIMS);
	for (let i = 0; i < DIMS; i++) {
		v[i] = Math.sin(seed * 1000 + i) * 0.5;
	}
	return v;
}

function makeRecord(workerId: string, index: number) {
	const now = new Date().toISOString();
	return {
		id: `stress-${workerId}-${index}`,
		memory: `Stress test record from worker ${workerId} index ${index}`,
		user_id: `stress_worker_${workerId}`,
		vector: makeVector(parseInt(workerId, 10) * 10000 + index),
		metadata_json: "{}",
		created_at: now,
		updated_at: now,
		hash: `hash-${workerId}-${index}`,
		chunk: "",
		superseded_by: "",
		type: "stress-test",
	};
}

const results = { writes: 0, reads: 0, errors: 0 };

try {
	if (mode === "write") {
		for (let i = 0; i < count; i++) {
			add([makeRecord(workerId, i)]);
			results.writes++;
		}
	} else if (mode === "read") {
		for (let i = 0; i < count; i++) {
			const qv = makeVector(i);
			const hits = search(qv, { limit: 3 });
			if (hits.length > 0) results.reads++;
			else results.errors++;
		}
	} else if (mode === "mixed") {
		for (let i = 0; i < count; i++) {
			if (i % 2 === 0) {
				add([makeRecord(workerId, i)]);
				results.writes++;
			} else {
				const qv = makeVector(i);
				const hits = search(qv, { limit: 3 });
				if (hits.length > 0) results.reads++;
				else results.errors++;
			}
		}
	}
} catch (e) {
	results.errors++;
	console.error(`Worker ${workerId} error: ${e}`);
}

// Output JSON so parent can parse results
console.log(JSON.stringify(results));
