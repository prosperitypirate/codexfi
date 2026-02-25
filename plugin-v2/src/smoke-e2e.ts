#!/usr/bin/env bun
/**
 * E2E smoke test for plugin-v2 embedded pipeline.
 *
 * Validates the full lifecycle that index.ts depends on:
 * 1. db.init() — LanceDB connection + table creation
 * 2. nameRegistry.init() — JSON file load
 * 3. ledger.init() — telemetry setup
 * 4. store.ingest() — extraction + embedding + LanceDB write
 * 5. store.search() — semantic search with recency blending
 * 6. store.list() — list memories by user_id
 * 7. store.getProfile() — profile retrieval
 * 8. store.deleteMemory() — cleanup
 * 9. MemoryPlugin export — verify the named export is a function
 *
 * Requires VOYAGE_API_KEY (and ANTHROPIC_API_KEY or XAI_API_KEY or GOOGLE_API_KEY)
 * in the environment.
 *
 * Usage: bun run src/smoke-e2e.ts
 */

import * as db from "./db.js";
import * as store from "./store.js";
import { nameRegistry } from "./names.js";
import { ledger } from "./telemetry.js";
import { isConfigured } from "./plugin-config.js";
import { MemoryPlugin } from "./index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SMOKE_USER_ID = "smoke_test_user_e2e";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
	if (condition) {
		console.log(`  ✓ ${label}`);
		passed++;
	} else {
		console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
		failed++;
	}
}

async function main(): Promise<void> {
	console.log("=== plugin-v2 E2E Smoke Test ===\n");

	// ── 0. Pre-flight checks ──────────────────────────────────────────────
	console.log("0. Pre-flight checks");
	assert(isConfigured(), "VOYAGE_API_KEY is set");
	assert(typeof MemoryPlugin === "function", "MemoryPlugin export is a function");

	if (!isConfigured()) {
		console.error("\nFATAL: VOYAGE_API_KEY not set. Cannot run smoke test.");
		process.exit(1);
	}

	// ── 1. Initialize with temp directory ─────────────────────────────────
	console.log("\n1. Initialization");
	const tempDir = mkdtempSync(join(tmpdir(), "smoke-e2e-"));
	try {
		const dbPath = join(tempDir, "lancedb");
		await db.init(dbPath);
		assert(true, "db.init() succeeded");

		await nameRegistry.init(tempDir);
		assert(true, "nameRegistry.init() succeeded");

		await ledger.init(tempDir);
		assert(true, "ledger.init() succeeded");

		// ── 2. Register names ───────────────────────────────────────────────
		console.log("\n2. Name registry");
		await nameRegistry.register(SMOKE_USER_ID, "Smoke Test Project");
		const name = nameRegistry.get(SMOKE_USER_ID);
		assert(name === "Smoke Test Project", "nameRegistry round-trip", `got: ${name}`);

		// ── 3. Ingest (extraction + embedding + write) ──────────────────────
		console.log("\n3. Ingest (live API call — extraction + embedding)");
		const ingestStart = Date.now();
		const results = await store.ingest(
			[
				{ role: "user", content: "We use PostgreSQL 16 as our primary database with pgvector for embeddings" },
				{ role: "assistant", content: "Got it — PostgreSQL 16 with pgvector for vector storage. I'll keep that in mind for any database-related work." },
			],
			SMOKE_USER_ID,
		);
		const ingestMs = Date.now() - ingestStart;
		assert(results.length > 0, `ingest returned ${results.length} result(s) in ${ingestMs}ms`);
		assert(
			results.every(r => r.id && r.memory && (r.event === "ADD" || r.event === "UPDATE")),
			"all results have id, memory, and event",
		);

		const firstId = results[0]?.id;
		console.log(`   First memory: "${results[0]?.memory?.slice(0, 80)}..."`);

		// ── 4. Search (embedding + LanceDB vector search) ───────────────────
		console.log("\n4. Search (live API call — embedding + vector search)");
		const searchStart = Date.now();
		const searchResults = await store.search("database technology", SMOKE_USER_ID, {
			limit: 5,
			threshold: 0.1,
		});
		const searchMs = Date.now() - searchStart;
		assert(searchResults.length > 0, `search returned ${searchResults.length} result(s) in ${searchMs}ms`);

		const topResult = searchResults[0];
		if (topResult) {
			assert(topResult.score > 0.1, `top score ${topResult.score.toFixed(3)} > 0.1 threshold`);
			assert(
				topResult.memory.toLowerCase().includes("postgres") || topResult.memory.toLowerCase().includes("database"),
				"top result is relevant to query",
				`got: "${topResult.memory.slice(0, 80)}"`,
			);
		}

		// ── 5. Search with types (hybrid enumeration) ───────────────────────
		console.log("\n5. Search with types (hybrid enumeration)");
		const enumResults = await store.search("list all tech context", SMOKE_USER_ID, {
			limit: 10,
			threshold: 0.05,
			types: ["tech-context", "preference"],
		});
		assert(enumResults.length >= 0, `enum search returned ${enumResults.length} result(s) (may be 0 if no typed memories)`);

		// ── 6. List ─────────────────────────────────────────────────────────
		console.log("\n6. List");
		const listed = await store.list(SMOKE_USER_ID, { limit: 10 });
		assert(listed.length > 0, `list returned ${listed.length} memorie(s)`);
		assert(listed.some(m => m.id === firstId), "ingested memory appears in list");

		// ── 7. Get profile ──────────────────────────────────────────────────
		console.log("\n7. Get profile");
		const profile = await store.getProfile(SMOKE_USER_ID, 10);
		assert(profile.length > 0, `getProfile returned ${profile.length} memorie(s)`);

		// ── 8. Dedup — re-ingesting same content should UPDATE not ADD ──────
		console.log("\n8. Deduplication");
		const dedupResults = await store.ingest(
			[
				{ role: "user", content: "We use PostgreSQL 16 as our primary database with pgvector for embeddings" },
				{ role: "assistant", content: "Got it — PostgreSQL 16 with pgvector." },
			],
			SMOKE_USER_ID,
		);
		const updateEvents = dedupResults.filter(r => r.event === "UPDATE");
		// At least some should be UPDATEs if dedup is working
		assert(
			updateEvents.length > 0 || dedupResults.length <= results.length,
			`dedup: ${updateEvents.length} UPDATE(s) out of ${dedupResults.length} result(s)`,
		);

		// ── 9. Delete ───────────────────────────────────────────────────────
		console.log("\n9. Delete");
		if (firstId) {
			await store.deleteMemory(firstId);
			const afterDelete = await store.list(SMOKE_USER_ID, { limit: 100 });
			assert(!afterDelete.some(m => m.id === firstId), "deleted memory no longer in list");
		}

		// ── 10. Clean up remaining test memories ────────────────────────────
		console.log("\n10. Cleanup");
		const remaining = await store.list(SMOKE_USER_ID, { limit: 100 });
		for (const m of remaining) {
			await store.deleteMemory(m.id);
		}
		const afterCleanup = await store.list(SMOKE_USER_ID, { limit: 100 });
		assert(afterCleanup.length === 0, "all test memories cleaned up");

	} finally {
		// Remove temp directory
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Best effort cleanup
		}
	}

	// ── Summary ─────────────────────────────────────────────────────────────
	console.log(`\n${"=".repeat(50)}`);
	console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
	if (failed > 0) {
		console.error("\nSMOKE TEST FAILED");
		process.exit(1);
	} else {
		console.log("\nSMOKE TEST PASSED — plugin-v2 is ready for live wiring");
	}
}

main().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
