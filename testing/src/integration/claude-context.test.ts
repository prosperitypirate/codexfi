/**
 * Integration tests for claude/context.ts — the two context channels:
 *
 *   buildSessionContext()  SessionStart structured [MEMORY] block
 *                          (+ Memory Bank mode: only sessions newer than the bank)
 *   buildPromptContext()   UserPromptSubmit "Relevant to Current Task"
 *                          (skips memories already injected this session)
 *
 * Real store in a temp SQLite DB; embeddings from the mocked local model
 * (bag-of-words, see helpers/mock-embedder.ts). No LLM involved.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildPromptContext, buildSessionContext } from "../../../plugin/src/claude/context.js";
import { store as vs } from "../../../plugin/src/db.js";
import { activeThresholds, currentEmbedModelId } from "../../../plugin/src/embedder.js";
import { PLUGIN_CONFIG } from "../../../plugin/src/plugin-config.js";
import { bowVector } from "../helpers/mock-embedder.js";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import { makeTempDir } from "../helpers/test-env.js";

let n = 0;
/** Insert one memory directly (no LLM), embedded like embed() would. Returns its id. */
function seed(userId: string, memory: string, type: string, createdAt = new Date().toISOString()): string {
	const id = `ctx-${++n}-${randomUUID().slice(0, 8)}`;
	vs.add([{
		id,
		memory,
		user_id: userId,
		vector: bowVector(memory),
		metadata_json: JSON.stringify({ type }),
		created_at: createdAt,
		updated_at: createdAt,
		hash: id,
		chunk: "",
		superseded_by: "",
		type,
		embed_model: currentEmbedModelId(),
	}]);
	return id;
}

const hoursAgo = (h: number, from = Date.now()) => new Date(from - h * 3600_000).toISOString();

beforeAll(async () => {
	await setupTempDb();
});

afterAll(() => {
	teardownTempDb();
});

// ── buildSessionContext ─────────────────────────────────────────────────────────

describe("buildSessionContext (no memory bank)", () => {
	const P = "ctx_full_project";
	const U = "ctx_full_user";
	const ids: Record<string, string> = {};
	let cwd: string;

	beforeAll(() => {
		cwd = makeTempDir("proj-full");
		ids.brief = seed(P, "Acme Billing is a multi-tenant invoicing SaaS", "project-brief");
		ids.arch = seed(P, "Requests flow through a Fastify gateway into per-tenant workers", "architecture");
		ids.tech = seed(P, "TypeScript on Bun with SQLite in WAL mode", "tech-context");
		ids.progress = seed(P, "Invoice PDF export is done; dunning emails are next", "progress");
		ids.s1 = seed(P, "Session: added PDF export and fixed rounding bugs", "session-summary", hoursAgo(2));
		ids.s2 = seed(P, "Session: scaffolded the tenant worker pool", "session-summary", hoursAgo(30));
		ids.lp = seed(P, "Atomic learned pattern that has no structural renderer", "learned-pattern");
		ids.pref = seed(U, "Prefers small focused pull requests", "preference");
	});

	test("renders the structured sections, recent sessions and user preferences", async () => {
		const ctx = await buildSessionContext(P, U, cwd);
		expect(ctx.memoryBank).toBeNull();
		expect(ctx.text.startsWith("[MEMORY]\n")).toBe(true);
		for (const header of ["## Project Brief", "## Architecture", "## Tech Context", "## Progress & Status", "## Recent Sessions", "## User Preferences"]) {
			expect(ctx.text).toContain(header);
		}
		expect(ctx.text).toContain("- Acme Billing is a multi-tenant invoicing SaaS");
		expect(ctx.text).toContain("- Prefers small focused pull requests");
		// newest session first
		expect(ctx.text.indexOf("added PDF export")).toBeLessThan(ctx.text.indexOf("scaffolded the tenant worker pool"));
	});

	test("atomic types without a structural renderer are not part of the baseline", async () => {
		const ctx = await buildSessionContext(P, U, cwd);
		expect(ctx.text).not.toContain("Atomic learned pattern");
		expect(ctx.injectedIds).not.toContain(ids.lp);
	});

	test("injectedIds covers every rendered memory (so prompts don't repeat them)", async () => {
		const ctx = await buildSessionContext(P, U, cwd);
		expect([...ctx.injectedIds].sort()).toEqual(
			[ids.brief, ids.arch, ids.tech, ids.progress, ids.s1, ids.s2, ids.pref].sort(),
		);
		// Counts every project memory (incl. the atomic learned-pattern), so a project
		// with only atomic memories never re-queues auto-init.
		expect(ctx.projectMemoryCount).toBe(7);
	});

	test("a brand-new project with no user prefs → empty text, count 0", async () => {
		const ctx = await buildSessionContext("ctx_empty_project", "ctx_empty_user", makeTempDir("proj-empty"));
		expect(ctx.text).toBe("");
		expect(ctx.injectedIds).toEqual([]);
		expect(ctx.projectMemoryCount).toBe(0);
	});
});

describe("buildSessionContext (memory bank mode)", () => {
	const P = "ctx_bank_project";
	const U = "ctx_bank_user";
	const bankSavedAt = Date.now() - 2 * 24 * 3600_000; // bank last saved two days ago
	const ids: Record<string, string> = {};
	let cwd: string;
	const savedMode = PLUGIN_CONFIG.memoryBank;

	beforeAll(() => {
		cwd = makeTempDir("proj-bank");
		mkdirSync(join(cwd, "memory-bank"), { recursive: true });
		for (const f of ["projectbrief.md", "activeContext.md"]) {
			const p = join(cwd, "memory-bank", f);
			writeFileSync(p, `# ${f}\n`);
			utimesSync(p, new Date(bankSavedAt), new Date(bankSavedAt));
		}
		ids.brief = seed(P, "Bank project brief that the curated bank already covers", "project-brief");
		ids.tech = seed(P, "Bank project tech context also covered by the bank", "tech-context");
		ids.before = seed(P, "Session long before the last save bank", "session-summary", hoursAgo(3, bankSavedAt));
		ids.slack = seed(P, "Session just before the save within the slack window", "session-summary", hoursAgo(0.5, bankSavedAt));
		ids.after = seed(P, "Session after the last save bank", "session-summary", hoursAgo(-1, bankSavedAt));
		ids.pref = seed(U, "Likes terse commit messages", "preference");
	});

	afterEach(() => {
		PLUGIN_CONFIG.memoryBank = savedMode;
	});

	test("detects the bank and annotates the header", async () => {
		const ctx = await buildSessionContext(P, U, cwd);
		expect(ctx.memoryBank?.dir).toBe(join(cwd, "memory-bank"));
		expect(ctx.text).toContain("supplements this project's memory-bank/");
	});

	test("skips the structured sections the bank already carries", async () => {
		const ctx = await buildSessionContext(P, U, cwd);
		expect(ctx.text).not.toContain("## Project Brief");
		expect(ctx.text).not.toContain("## Tech Context");
		expect(ctx.text).not.toContain("Bank project brief");
	});

	test("keeps only sessions newer than the bank's last save (with 1h slack)", async () => {
		const ctx = await buildSessionContext(P, U, cwd);
		expect(ctx.text).toContain("Session after the last save bank");
		expect(ctx.text).toContain("Session just before the save within the slack window");
		expect(ctx.text).not.toContain("Session long before the last save bank");
		expect([...ctx.injectedIds].sort()).toEqual([ids.after, ids.slack, ids.pref].sort());
	});

	test("user preferences are still injected; projectMemoryCount counts everything", async () => {
		const ctx = await buildSessionContext(P, U, cwd);
		expect(ctx.text).toContain("- Likes terse commit messages");
		expect(ctx.projectMemoryCount).toBe(5);
	});

	test('memoryBank: "off" ignores the bank and renders everything', async () => {
		PLUGIN_CONFIG.memoryBank = "off";
		const ctx = await buildSessionContext(P, U, cwd);
		expect(ctx.memoryBank).toBeNull();
		expect(ctx.text).toContain("## Project Brief");
		expect(ctx.text).toContain("Session long before the last save bank");
		expect(ctx.text).not.toContain("supplements this project's memory-bank/");
	});
});

// ── buildPromptContext ──────────────────────────────────────────────────────────

describe("buildPromptContext", () => {
	const P = "ctx_prompt_project";
	const U = "ctx_prompt_user";
	const ids: Record<string, string> = {};

	beforeAll(() => {
		ids.zod = seed(P, "The api gateway validates request bodies with zod schemas", "learned-pattern");
		ids.ci = seed(P, "Releases are cut by pushing a version tag to trigger the release workflow", "learned-pattern");
		ids.tabs = seed(U, "User wants the api gateway to validate request bodies with zod", "preference");
	});

	beforeEach(() => {
		// The display floor must not depend on a stray override from another file.
		PLUGIN_CONFIG.displaySimilarityThreshold = undefined;
		PLUGIN_CONFIG.similarityThreshold = undefined;
	});

	test("surfaces relevant project + user memories under Relevant to Current Task", async () => {
		const ctx = await buildPromptContext("how does the api gateway validate request bodies with zod", P, U);
		expect(ctx.text).toContain("## Relevant to Current Task");
		expect(ctx.text).toContain("The api gateway validates request bodies with zod schemas");
		expect(ctx.text).toContain("User wants the api gateway to validate request bodies with zod");
		expect(ctx.text).not.toContain("release workflow");
		expect(ctx.injectedIds).toContain(ids.zod);
		expect(ctx.injectedIds).not.toContain(ids.ci);
	});

	test("memories already injected this session are not repeated", async () => {
		const ctx = await buildPromptContext(
			"how does the api gateway validate request bodies with zod",
			P,
			U,
			new Set([ids.zod, ids.tabs]),
		);
		expect(ctx.text).not.toContain("The api gateway validates request bodies");
		expect(ctx.text).not.toContain("User wants the api gateway");
		expect(ctx.injectedIds).not.toContain(ids.zod);
		expect(ctx.injectedIds).not.toContain(ids.tabs);
	});

	test("injectedIds only lists memories actually displayed (score ≥ display threshold)", async () => {
		const ctx = await buildPromptContext("validate request bodies", P, U);
		const display = activeThresholds().display;
		expect(ctx.text.includes("The api gateway validates")).toBe(ctx.injectedIds.includes(ids.zod));
		expect(display).toBeGreaterThan(0);
	});

	test("an unrelated prompt yields nothing", async () => {
		const ctx = await buildPromptContext("quantum chromodynamics lattice simulation", P, U);
		expect(ctx.text).toBe("");
		expect(ctx.injectedIds).toEqual([]);
	});

	test("list-style prompts add type-matched memories in a separate capped section", async () => {
		const E = "ctx_enum_project";
		for (let i = 0; i < 12; i++) seed(E, `Error fix number ${i}: restart the flaky daemon ${i}`, "error-solution");
		const ctx = await buildPromptContext("list all the error fixes we know", E, "ctx_enum_user");
		expect(ctx.text).toContain("## Also on Record");
		const extras = ctx.text.split("## Also on Record")[1]!.split("\n").filter((l) => l.startsWith("- [error-solution"));
		expect(extras.length).toBeGreaterThan(0);
		expect(extras.length).toBeLessThanOrEqual(8);
		expect(ctx.injectedIds.length).toBeGreaterThanOrEqual(extras.length);
	});
});
