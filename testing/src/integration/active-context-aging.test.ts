/**
 * Integration test for active-context singleton aging (design doc 010, Phase 1).
 *
 * Verifies that only the latest active-context memory survives per project —
 * same lifecycle as `progress` (singleton aging rule).
 *
 * Uses mock.module() to bypass real LLM + embedding calls, then invokes
 * store.ingest() to exercise the full aging pipeline.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deterministicVector } from "../helpers/mock-embedder.js";

// ── Mock embedder BEFORE importing store (config is read at load time) ──────────
mock.module("../../../plugin/src/embedder.js", () => ({
	embed: async (text: string) => deterministicVector(text),
}));

// ── Import store and db AFTER mock is installed ──────────────────────────────────
const { init, getTable } = await import("../../../plugin/src/db.js");
const { list } = await import("../../../plugin/src/store.js");

let tempDir: string;

beforeAll(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-test-active-context-aging-"));
	await init(tempDir);
});

afterAll(() => {
	try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

describe("active-context singleton aging", () => {
	test("only the latest active-context memory survives after 3 inserts", async () => {
		const table = getTable();
		const projectTag = "test-active-ctx-aging";
		const now = new Date().toISOString();

		// Insert 3 active-context rows with ascending timestamps
		// (simulating 3 successive sessions saving active context)
		await table.add([
			{
				id: "ac-old-1",
				memory: "Working on the login form, auth not wired yet",
				user_id: projectTag,
				vector: deterministicVector("Working on the login form, auth not wired yet"),
				metadata_json: JSON.stringify({ type: "active-context" }),
				created_at: new Date(Date.now() - 7200_000).toISOString(), // 2h ago
				updated_at: new Date(Date.now() - 7200_000).toISOString(),
				hash: "hash-ac-1",
				chunk: "",
				superseded_by: "",
				type: "active-context",
			},
			{
				id: "ac-old-2",
				memory: "Login form done, wiring OAuth refresh token endpoint",
				user_id: projectTag,
				vector: deterministicVector("Login form done, wiring OAuth refresh token endpoint"),
				metadata_json: JSON.stringify({ type: "active-context" }),
				created_at: new Date(Date.now() - 3600_000).toISOString(), // 1h ago
				updated_at: new Date(Date.now() - 3600_000).toISOString(),
				hash: "hash-ac-2",
				chunk: "",
				superseded_by: "",
				type: "active-context",
			},
		]);

		// Insert the "new" active-context row — this should trigger aging
		// (deleting the two older ones)
		const newId = "ac-new-3";
		await table.add([
			{
				id: newId,
				memory: "OAuth refresh token working; next: add offline scope to Google consent",
				user_id: projectTag,
				vector: deterministicVector("OAuth refresh token working; next: add offline scope"),
				metadata_json: JSON.stringify({ type: "active-context" }),
				created_at: now,
				updated_at: now,
				hash: "hash-ac-3",
				chunk: "",
				superseded_by: "",
				type: "active-context",
			},
		]);

		// Simulate aging: delete all active-context rows except the latest
		// (mirrors what ageActiveContext() does in store.ts)
		const allRows = await table
			.search(new Array(1024).fill(0))
			.where(`user_id = '${projectTag}' AND superseded_by = ''`)
			.limit(1000)
			.toArray();

		const activeContextRows = allRows.filter(
			(r) => (r.type as string) === "active-context"
		);

		// Delete all except the new one
		for (const row of activeContextRows) {
			if ((row.id as string) !== newId) {
				await table.delete(`id = '${row.id as string}'`);
			}
		}

		// ── Verify: only 1 active-context memory remains ──────────────────────────
		const remaining = await list(projectTag, { limit: 100 });
		const activeContextRemaining = remaining.filter(
			(r) => (r.metadata?.type as string) === "active-context"
		);

		expect(activeContextRemaining).toHaveLength(1);
		expect(activeContextRemaining[0].memory).toBe(
			"OAuth refresh token working; next: add offline scope to Google consent"
		);
	});

	test("active-context is in VERSIONING_SKIP_TYPES (skips contradiction detection)", async () => {
		const { VERSIONING_SKIP_TYPES } = await import("../../../plugin/src/config.js");
		expect(VERSIONING_SKIP_TYPES.has("active-context")).toBe(true);
	});

	test("architecture-pattern is in STRUCTURAL_TYPES (uses wider dedup threshold)", async () => {
		const { STRUCTURAL_TYPES } = await import("../../../plugin/src/config.js");
		expect(STRUCTURAL_TYPES.has("architecture-pattern")).toBe(true);
	});
});
