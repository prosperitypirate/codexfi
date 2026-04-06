/**
 * stress/concurrent-reads.test.ts — Multi-process read safety test.
 *
 * Pre-seeds 500 records, then spawns N readers doing vector searches
 * simultaneously. Verifies:
 *   - All searches return results (no empty arrays)
 *   - No errors under concurrent read load
 *   - PRAGMA integrity_check passes
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { open } from "../../../plugin/src/store/sqlite.js";
import { add } from "../../../plugin/src/store/crud.js";

const SEED_RECORDS = 500;
const READERS = 20;
const SEARCHES_PER_READER = 20;

const WORKER_SCRIPT = join(import.meta.dir, "worker.ts");
let tempDir: string;
let dbPath: string;

beforeAll(() => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-stress-reads-"));
	dbPath = join(tempDir, "store.db");

	// Pre-seed the database with records so readers have data to find
	open(dbPath);

	const records = Array.from({ length: SEED_RECORDS }, (_, i) => {
		const v = new Float32Array(1024);
		for (let j = 0; j < 1024; j++) v[j] = Math.sin(i * 1000 + j) * 0.5;
		const now = new Date().toISOString();
		return {
			id: `seed-${i}`,
			memory: `Seed record ${i} for concurrent read testing`,
			user_id: "stress_seed",
			vector: v,
			metadata_json: "{}",
			created_at: now,
			updated_at: now,
			hash: `hash-seed-${i}`,
			chunk: "",
			superseded_by: "",
			type: "stress-test",
		};
	});

	add(records);
});

afterAll(() => {
	if (tempDir) {
		try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
	}
});

describe("concurrent reads", () => {
	test(`${READERS} readers × ${SEARCHES_PER_READER} searches against ${SEED_RECORDS} records`, async () => {
		// Spawn all readers simultaneously
		const readers = Array.from({ length: READERS }, (_, i) => {
			const proc = Bun.spawn(
				["bun", "run", WORKER_SCRIPT, dbPath, "read", String(i), String(SEARCHES_PER_READER)],
				{ stdout: "pipe", stderr: "pipe" },
			);
			return proc;
		});

		// Wait for all to finish and collect results
		let totalReads = 0;
		let totalErrors = 0;

		for (const proc of readers) {
			const exitCode = await proc.exited;
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();

			if (exitCode !== 0) {
				console.error("Reader failed:", stderr);
			}
			expect(exitCode).toBe(0);

			try {
				const result = JSON.parse(stdout.trim());
				totalReads += result.reads;
				totalErrors += result.errors;
			} catch {
				console.error("Failed to parse reader output:", stdout);
			}
		}

		// All searches returned results
		const expectedReads = READERS * SEARCHES_PER_READER;
		expect(totalReads).toBe(expectedReads);
		expect(totalErrors).toBe(0);

		// Database integrity intact after concurrent reads
		const db = new Database(dbPath, { readonly: true });
		const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
		expect(integrity.integrity_check).toBe("ok");

		// Record count unchanged (reads shouldn't modify data)
		const row = db.prepare("SELECT COUNT(*) as cnt FROM memories").get() as { cnt: number };
		expect(row.cnt).toBe(SEED_RECORDS);

		db.close();
	}, 30_000);
});
