/**
 * Integration tests for claude/hooks.ts runHook() — the Claude Code hook
 * handlers, driven in-process with JSON payloads exactly as Claude Code sends
 * them on stdin. stdout (the hook reply channel) is captured.
 *
 * CODEXFI_NO_WORKER=1 (preload) keeps spawnWorker() from forking; jobs are
 * inspected straight from the queue.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";

import { detectMemoryKeyword, runHook, type HookEvent } from "../../../plugin/src/claude/hooks.js";
import { listJobs, loadSession, readJob, saveSession } from "../../../plugin/src/claude/state.js";
import { store as vs } from "../../../plugin/src/db.js";
import { currentEmbedModelId } from "../../../plugin/src/embedder.js";
import { getTags } from "../../../plugin/src/services/tags.js";
import { bowVector } from "../helpers/mock-embedder.js";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import {
	captureStdout,
	makeTempDir,
	markEmbedderMissing,
	markEmbedderReady,
	resetRuntimeState,
} from "../helpers/test-env.js";

interface HookReply {
	hookSpecificOutput: { hookEventName: string; additionalContext: string };
}

async function hook(event: HookEvent, payload: Record<string, unknown>): Promise<{ raw: string; reply: HookReply | null }> {
	const { stdout } = await captureStdout(() => runHook(event, JSON.stringify(payload)));
	return { raw: stdout, reply: stdout ? (JSON.parse(stdout) as HookReply) : null };
}

const jobs = () => listJobs().map((n) => readJob(n)!);

let cwd: string;
let tags: { user: string; project: string };
let seq = 0;

function seed(userId: string, memory: string, type: string): string {
	const id = `hook-${++seq}`;
	const now = new Date().toISOString();
	vs.add([{
		id, memory, user_id: userId, vector: bowVector(memory),
		metadata_json: JSON.stringify({ type }), created_at: now, updated_at: now,
		hash: id, chunk: "", superseded_by: "", type, embed_model: currentEmbedModelId(),
	}]);
	return id;
}

beforeAll(async () => {
	await setupTempDb();
	await markEmbedderReady();
	cwd = makeTempDir("hook-project");
	tags = getTags(cwd);
});

afterAll(async () => {
	await markEmbedderMissing();
	teardownTempDb();
});

beforeEach(() => resetRuntimeState());
afterEach(() => {
	delete process.env.CODEXFI_DISABLE;
	resetRuntimeState();
});

// ── stop / pre-compact / session-end (write hooks) ──────────────────────────────

describe("write hooks", () => {
	const payload = () => ({ session_id: "sess-stop", transcript_path: join(cwd, "t.jsonl"), cwd, hook_event_name: "Stop" });

	test("stop enqueues one turn job and prints nothing", async () => {
		const { raw } = await hook("stop", payload());
		expect(raw).toBe("");
		const queued = jobs();
		expect(queued).toHaveLength(1);
		expect(queued[0]).toMatchObject({
			kind: "turn",
			sessionId: "sess-stop",
			transcriptPath: join(cwd, "t.jsonl"),
			cwd,
			projectTag: tags.project,
			userTag: tags.user,
		});
	});

	test("pre-compact and session-end enqueue summary jobs with a reason", async () => {
		await hook("pre-compact", { ...payload(), trigger: "auto" });
		await hook("session-end", { ...payload(), reason: "logout" });
		const queued = jobs();
		expect(queued.map((j) => j.kind)).toEqual(["summary", "summary"]);
		expect(queued.map((j) => j.reason).sort()).toEqual(["pre-compact:auto", "session-end:logout"]);
	});

	test("without session_id or transcript_path nothing is enqueued", async () => {
		await hook("stop", { cwd });
		await hook("stop", { session_id: "s", cwd });
		expect(jobs()).toEqual([]);
	});

	test("subagent traffic (agent_id present) is ignored", async () => {
		await hook("stop", { ...payload(), agent_id: "agent-123", agent_type: "Explore" });
		expect(jobs()).toEqual([]);
	});

	test("CODEXFI_DISABLE=1 → complete no-op", async () => {
		process.env.CODEXFI_DISABLE = "1";
		const { raw } = await hook("stop", payload());
		expect(raw).toBe("");
		expect(jobs()).toEqual([]);
	});

	test("malformed stdin never throws", async () => {
		const { stdout } = await captureStdout(() => runHook("stop", "{not json"));
		expect(stdout).toBe("");
	});
});

// ── session-start ───────────────────────────────────────────────────────────────

describe("session-start", () => {
	test('source "resume" emits nothing and touches nothing', async () => {
		seed(tags.project, "Resume-test project brief: a CLI for invoices", "project-brief");
		const { raw } = await hook("session-start", { session_id: "sess-resume", source: "resume", cwd });
		expect(raw).toBe("");
		expect(jobs()).toEqual([]);
		expect(loadSession("sess-resume").injected).toEqual([]);
	});

	test("startup injects the [MEMORY] baseline and records injected ids", async () => {
		const briefId = seed(tags.project, "Startup-test project brief: a billing API", "project-brief");
		const { reply } = await hook("session-start", { session_id: "sess-start", source: "startup", cwd, transcript_path: "/t.jsonl" });
		expect(reply!.hookSpecificOutput.hookEventName).toBe("SessionStart");
		expect(reply!.hookSpecificOutput.additionalContext).toContain("[MEMORY]");
		expect(reply!.hookSpecificOutput.additionalContext).toContain("Startup-test project brief: a billing API");
		const state = loadSession("sess-start");
		expect(state.injected).toContain(briefId);
		expect(state.transcriptPath).toBe("/t.jsonl");
		// project already has memories → no auto-init job
		expect(jobs().filter((j) => j.kind === "init")).toEqual([]);
	});

	test("a project with no memories enqueues auto-init (but not after compact)", async () => {
		const fresh = makeTempDir("hook-fresh-project");
		await hook("session-start", { session_id: "sess-new", source: "startup", cwd: fresh });
		expect(jobs().map((j) => j.kind)).toEqual(["init"]);
		expect(jobs()[0]!.cwd).toBe(fresh);

		resetRuntimeState();
		await hook("session-start", { session_id: "sess-new", source: "compact", cwd: fresh });
		expect(jobs()).toEqual([]);
	});

	test("missing model weights → a warmup job is queued for the worker", async () => {
		await markEmbedderMissing();
		try {
			await hook("session-start", { session_id: "sess-warm", source: "startup", cwd });
			expect(jobs().map((j) => j.kind)).toContain("warmup");
		} finally {
			await markEmbedderReady();
		}
	});

	test("output stays under Claude Code's 10,000-char hook limit", async () => {
		const big = makeTempDir("hook-big-project");
		const bigTags = getTags(big);
		for (let i = 0; i < 40; i++) seed(bigTags.project, `Architecture fact ${i}: ${"detail ".repeat(60)}`, "architecture");
		const { reply } = await hook("session-start", { session_id: "sess-big", source: "startup", cwd: big });
		expect(reply!.hookSpecificOutput.additionalContext.length).toBeLessThan(10_000);
	});
});

// ── user-prompt-submit ──────────────────────────────────────────────────────────

describe("user-prompt-submit", () => {
	test("injects relevant memories once per session", async () => {
		const id = seed(tags.project, "The importer parses CSV files with papaparse in streaming mode", "learned-pattern");
		const payload = { session_id: "sess-ups", cwd, prompt: "how does the importer parse CSV files with papaparse" };

		const first = await hook("user-prompt-submit", payload);
		expect(first.reply!.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
		expect(first.reply!.hookSpecificOutput.additionalContext).toContain("papaparse in streaming mode");
		expect(loadSession("sess-ups").injected).toContain(id);

		const second = await hook("user-prompt-submit", payload);
		expect(second.raw).not.toContain("papaparse in streaming mode");
	});

	test("memories injected at session start are not repeated per prompt", async () => {
		const id = seed(tags.project, "Webhooks are verified with an HMAC signature header", "learned-pattern");
		saveSession("sess-pre", { transcriptOffset: 0, injected: [id], turns: 0 });
		const { raw } = await hook("user-prompt-submit", { session_id: "sess-pre", cwd, prompt: "how are webhooks verified with the HMAC signature header" });
		expect(raw).not.toContain("HMAC signature header");
	});

	test('a "remember" request appends the memory_add note', async () => {
		const { reply } = await hook("user-prompt-submit", { session_id: "sess-rem", cwd, prompt: "please remember that we deploy on Fridays only" });
		expect(reply!.hookSpecificOutput.additionalContext).toContain("Note from codexfi");
		expect(reply!.hookSpecificOutput.additionalContext).toContain("memory_add");
	});

	test("the remember note is sent even before the model is downloaded", async () => {
		await markEmbedderMissing();
		try {
			const { reply } = await hook("user-prompt-submit", { session_id: "sess-rem2", cwd, prompt: "remember: staging uses port 8443" });
			expect(reply!.hookSpecificOutput.additionalContext).toContain("Note from codexfi");
			expect(jobs().map((j) => j.kind)).toContain("warmup");
		} finally {
			await markEmbedderReady();
		}
	});

	test("unrelated prompt without keywords → no output", async () => {
		const { raw } = await hook("user-prompt-submit", { session_id: "sess-quiet", cwd, prompt: "zzqx wobble fnord" });
		expect(raw).toBe("");
	});

	test("prompts shorter than 3 chars are ignored", async () => {
		const { raw } = await hook("user-prompt-submit", { session_id: "sess-short", cwd, prompt: "ok" });
		expect(raw).toBe("");
	});

	test("CODEXFI_DISABLE=1 → no output even for a remember request", async () => {
		process.env.CODEXFI_DISABLE = "1";
		const { raw } = await hook("user-prompt-submit", { session_id: "sess-off", cwd, prompt: "remember this forever" });
		expect(raw).toBe("");
	});
});

// ── detectMemoryKeyword ─────────────────────────────────────────────────────────

describe("detectMemoryKeyword", () => {
	test("matches remember-style requests", () => {
		for (const p of ["Remember that tabs win", "please keep in mind the API is v2", "don't forget the migration", "make a note: use pnpm"]) {
			expect(detectMemoryKeyword(p)).toBe(true);
		}
	});

	test("ignores keywords inside code", () => {
		expect(detectMemoryKeyword("rename `remember()` to `recall()`")).toBe(false);
		expect(detectMemoryKeyword("```\nfunction remember() {}\n```\nwhat does this do?")).toBe(false);
	});

	test("ordinary prompts don't match", () => {
		expect(detectMemoryKeyword("fix the failing test in parser.ts")).toBe(false);
	});
});
