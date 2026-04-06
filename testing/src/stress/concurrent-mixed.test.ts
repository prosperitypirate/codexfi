/**
 * stress/concurrent-mixed.test.ts — Simultaneous readers + writers test.
 *
 * The real-world scenario: multiple OpenCode agents writing memories
 * while the dashboard reads. Verifies:
 *   - Zero data loss from writers
 *   - Readers get results (no blocking or errors)
 *   - No SQLITE_BUSY errors (busy_timeout handles queuing)
 *   - PRAGMA integrity_check passes
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { open } from "../../../plugin/src/store/sqlite.js";
import { add } from "../../../plugin/src/store/crud.js";

const SEED_RECORDS = 200;
const WRITERS = 15;
const READERS = 15;
const OPS_PER_WORKER = 20;
const EXPECTED_WRITES = WRITERS * OPS_PER_WORKER;

const WORKER_SCRIPT = join(import.meta.dir, "worker.ts");
let tempDir: string;
let dbPath: string;

beforeAll(() => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-stress-mixed-"));
	dbPath = join(tempDir, "store.db");

	// Pre-seed so readers have something to find from the start
	open(dbPath);

	const records = Array.from({ length: SEED_RECORDS }, (_, i) => {
		const v = new Float32Array(1024);
		for (let j = 0; j < 1024; j++) v[j] = Math.sin(i * 1000 + j) * 0.5;
		const now = new Date().toISOString();
		return {
			id: `seed-${i}`,
			memory: `Seed record ${i} for mixed concurrency testing`,
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

describe("concurrent mixed read/write", () => {
	test(`${WRITERS} writers + ${READERS} readers simultaneously`, async () => {
		// Spawn writers and readers at the same time
		const procs: Array<{ proc: ReturnType<typeof Bun.spawn>; role: "writer" | "reader" }> = [];

		for (let i = 0; i < WRITERS; i++) {
			const proc = Bun.spawn(
				["bun", "run", WORKER_SCRIPT, dbPath, "write", `w${i}`, String(OPS_PER_WORKER)],
				{ stdout: "pipe", stderr: "pipe" },
			);
			procs.push({ proc, role: "writer" });
		}

		for (let i = 0; i < READERS; i++) {
			const proc = Bun.spawn(
				["bun", "run", WORKER_SCRIPT, dbPath, "read", `r${i}`, String(OPS_PER_WORKER)],
				{ stdout: "pipe", stderr: "pipe" },
			);
			procs.push({ proc, role: "reader" });
		}

		// Wait for all and collect results
		let totalWrites = 0;
		let totalReads = 0;
		let totalErrors = 0;

		for (const { proc, role } of procs) {
			const exitCode = await proc.exited;
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();

			if (exitCode !== 0) {
				console.error(`${role} failed:`, stderr);
			}
			expect(exitCode).toBe(0);

			try {
				const result = JSON.parse(stdout.trim());
				totalWrites += result.writes;
				totalReads += result.reads;
				totalErrors += result.errors;
			} catch {
				console.error(`Failed to parse ${role} output:`, stdout);
			}
		}

		// Writers: all writes succeeded
		expect(totalWrites).toBe(EXPECTED_WRITES);

		// Readers: all searches returned results (seeded data always available)
		expect(totalReads).toBe(READERS * OPS_PER_WORKER);

		// Zero errors across all workers
		expect(totalErrors).toBe(0);

		// Open DB and verify final state
		const db = new Database(dbPath, { readonly: true });

		// Total = seed + newly written
		const row = db.prepare("SELECT COUNT(*) as cnt FROM memories").get() as { cnt: number };
		expect(row.cnt).toBe(SEED_RECORDS + EXPECTED_WRITES);

		// All writer IDs unique
		const writerRows = db.prepare("SELECT id FROM memories WHERE id LIKE 'stress-w%'").all() as { id: string }[];
		const uniqueWriterIds = new Set(writerRows.map((r) => r.id));
		expect(uniqueWriterIds.size).toBe(EXPECTED_WRITES);

		// Integrity check
		const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
		expect(integrity.integrity_check).toBe("ok");

		db.close();
	}, 60_000);
});
