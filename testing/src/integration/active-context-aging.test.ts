/**
 * Integration test for active-context singleton aging (design doc 010, Phase 1).
 *
 * Only the latest active-context memory survives per project — same lifecycle
 * as `progress`. Drives the real store path (addMemory → storeFact →
 * applyAgingRules → ageActiveContext) with the mocked local embedder; the fake
 * LLM is never consulted because active-context skips contradiction detection.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";

import { STRUCTURAL_TYPES, VERSIONING_SKIP_TYPES } from "../../../plugin/src/config.js";
import { addMemory, list } from "../../../plugin/src/store.js";
import { llmCalls, resetFakeLlm } from "../helpers/fake-llm.js";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";

beforeAll(async () => {
	await setupTempDb();
});

afterAll(() => {
	teardownTempDb();
});

beforeEach(() => resetFakeLlm());

const activeContext = async (projectTag: string) =>
	(await list(projectTag, { limit: 100 })).filter((r) => r.metadata.type === "active-context");

describe("active-context singleton aging", () => {
	test("only the latest active-context memory survives after 3 inserts", async () => {
		const projectTag = "test-active-ctx-aging";
		await addMemory("Working on the login form, auth not wired yet", projectTag, { type: "active-context" });
		await addMemory("Login form done, wiring OAuth refresh token endpoint", projectTag, { type: "active-context" });
		const latest = await addMemory("OAuth refresh token working; next: add offline scope to Google consent", projectTag, { type: "active-context" });

		const remaining = await activeContext(projectTag);
		expect(remaining).toHaveLength(1);
		expect(remaining[0]!.id).toBe(latest.id);
		expect(remaining[0]!.memory).toBe("OAuth refresh token working; next: add offline scope to Google consent");
		// versioning-skip type → no contradiction LLM call
		expect(llmCalls).toHaveLength(0);
	});

	test("aging is per project — other projects keep their own active context", async () => {
		await addMemory("Project A: refactoring the parser", "aging-project-a", { type: "active-context" });
		await addMemory("Project B: writing the migration guide", "aging-project-b", { type: "active-context" });
		await addMemory("Project A: parser refactor done, now benchmarking", "aging-project-a", { type: "active-context" });

		expect((await activeContext("aging-project-a")).map((r) => r.memory)).toEqual(["Project A: parser refactor done, now benchmarking"]);
		expect((await activeContext("aging-project-b")).map((r) => r.memory)).toEqual(["Project B: writing the migration guide"]);
	});

	test("other memory types are untouched by active-context aging", async () => {
		const projectTag = "aging-mixed-project";
		await addMemory("Uses Postgres 16 with pgvector", projectTag, { type: "tech-context" });
		await addMemory("Currently tuning the HNSW index parameters", projectTag, { type: "active-context" });
		await addMemory("Now load-testing the search endpoint", projectTag, { type: "active-context" });
		const all = await list(projectTag, { limit: 100 });
		expect(all.filter((r) => r.metadata.type === "tech-context")).toHaveLength(1);
		expect(all.filter((r) => r.metadata.type === "active-context")).toHaveLength(1);
	});

	test("active-context is in VERSIONING_SKIP_TYPES (skips contradiction detection)", () => {
		expect(VERSIONING_SKIP_TYPES.has("active-context")).toBe(true);
	});

	test("architecture-pattern is in STRUCTURAL_TYPES (uses wider dedup threshold)", () => {
		expect(STRUCTURAL_TYPES.has("architecture-pattern")).toBe(true);
	});
});
