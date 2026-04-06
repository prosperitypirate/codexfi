/**
 * stress/concurrent-writes.test.ts — Multi-process write safety test.
 *
 * Spawns N child processes, each inserting M records into the SAME
 * SQLite database simultaneously. Verifies zero data loss:
 *   - Exactly N×M records exist after all workers finish
 *   - All record IDs are unique
 *   - PRAGMA integrity_check passes
 *   - No duplicate IDs
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";

const WORKERS = 20;
const RECORDS_PER_WORKER = 20;
const EXPECTED_TOTAL = WORKERS * RECORDS_PER_WORKER;

const WORKER_SCRIPT = join(import.meta.dir, "worker.ts");
let tempDir: string;
let dbPath: string;

beforeAll(() => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-stress-writes-"));
	dbPath = join(tempDir, "store.db");
});

afterAll(() => {
	if (tempDir) {
		try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
	}
});

describe("concurrent writes", () => {
	test(`${WORKERS} workers × ${RECORDS_PER_WORKER} writes = ${EXPECTED_TOTAL} records, zero loss`, async () => {
		// Spawn all workers simultaneously
		const workers = Array.from({ length: WORKERS }, (_, i) => {
			const proc = Bun.spawn(
				["bun", "run", WORKER_SCRIPT, dbPath, "write", String(i), String(RECORDS_PER_WORKER)],
				{ stdout: "pipe", stderr: "pipe" },
			);
			return proc;
		});

		// Wait for all to finish and collect results
		let totalWrites = 0;
		let totalErrors = 0;

		for (const proc of workers) {
			const exitCode = await proc.exited;
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();

			if (exitCode !== 0) {
				console.error("Worker failed:", stderr);
			}
			expect(exitCode).toBe(0);

			try {
				const result = JSON.parse(stdout.trim());
				totalWrites += result.writes;
				totalErrors += result.errors;
			} catch {
				console.error("Failed to parse worker output:", stdout);
			}
		}

		// All workers reported success
		expect(totalWrites).toBe(EXPECTED_TOTAL);
		expect(totalErrors).toBe(0);

		// Open the DB and verify record count
		const db = new Database(dbPath, { readonly: true });

		const row = db.prepare("SELECT COUNT(*) as cnt FROM memories").get() as { cnt: number };
		expect(row.cnt).toBe(EXPECTED_TOTAL);

		// Verify all IDs are unique
		const ids = db.prepare("SELECT id FROM memories").all() as { id: string }[];
		const uniqueIds = new Set(ids.map((r) => r.id));
		expect(uniqueIds.size).toBe(EXPECTED_TOTAL);

		// Integrity check
		const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
		expect(integrity.integrity_check).toBe("ok");

		db.close();
	}, 30_000);
});
