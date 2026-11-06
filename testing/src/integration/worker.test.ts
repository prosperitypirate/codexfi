/**
 * Integration test for claude/worker.ts runWorker() — the detached process that
 * drains the hook job queue.
 *
 * Runs in-process with a fake LLM (canned extraction JSON) and the mocked local
 * embedder against a fixture Claude Code transcript:
 *
 *   turn job     → extracts the transcript tail, stores memories, advances the
 *                  session's byte offset; a repeat job for the same session
 *                  stores nothing and makes no LLM call
 *   summary job  → session-summary over the whole transcript
 *   init job     → auto-init from project files
 *   lock         → a live foreign worker lock makes runWorker() a no-op
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { enqueue as enqueueNow, listJobs, loadSession, type Job } from "../../../plugin/src/claude/state.js";
import { runWorker } from "../../../plugin/src/claude/worker.js";
import { store as vs } from "../../../plugin/src/db.js";
import { INIT_EXTRACTION_SYSTEM, EXTRACTION_SYSTEM, SUMMARY_SYSTEM } from "../../../plugin/src/prompts.js";
import { list } from "../../../plugin/src/store.js";
import { getTags } from "../../../plugin/src/services/tags.js";
import { llmCalls, resetFakeLlm, setLlmHandler } from "../helpers/fake-llm.js";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import { makeTempDir, resetRuntimeState, TEST_DATA_DIR, writeTranscript } from "../helpers/test-env.js";

// ── Fixture transcript (shape as written by Claude Code) ────────────────────────

const ts = (s: number) => new Date(Date.UTC(2026, 10, 1, 10, 0, s)).toISOString();
const turnOne = [
	{ type: "user", message: { role: "user", content: "The importer chokes on CSV files with a BOM. Can you fix it? My key is <private>sk-secret-123</private>" }, timestamp: ts(0) },
	{ type: "attachment", attachment: { type: "hook_additional_context", content: "[MEMORY]\n- injected by codexfi, must not feed back" }, timestamp: ts(1) },
	{ type: "assistant", message: { role: "assistant", content: [
		{ type: "thinking", thinking: "private chain of thought" },
		{ type: "text", text: "The parser does not strip the UTF-8 byte order mark before reading the header row." },
		{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: "src/importer/csv.ts" } },
	] }, timestamp: ts(2) },
	{ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "edited" }] }, timestamp: ts(3) },
	{ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Fixed: the importer now strips a leading BOM before parsing the header row." }] }, timestamp: ts(4) },
];
const turnTwo = [
	{ type: "user", message: { role: "user", content: "Great. Also make the delimiter configurable, default comma, and document it in the README please." }, timestamp: ts(10) },
	{ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Added an importer.delimiter option (default ',') and documented it in the README configuration section." }] }, timestamp: ts(11) },
];

/**
 * Enqueue a job stamped 10 s in the past. The worker waits until a job is
 * TRANSCRIPT_SETTLE_MS (1.5 s) old before reading the transcript, because
 * Claude Code flushes the final lines asynchronously; back-dating skips that.
 */
function enqueue(job: Omit<Job, "createdAt">): string {
	const name = enqueueNow(job);
	const path = join(TEST_DATA_DIR, "queue", name);
	const stored = JSON.parse(readFileSync(path, "utf8")) as Job;
	writeFileSync(path, JSON.stringify({ ...stored, createdAt: new Date(Date.now() - 10_000).toISOString() }));
	return name;
}

let cwd: string;
let tags: { project: string; user: string };
let transcript: string;

function extractionHandler(facts: Array<{ memory: string; type: string }>) {
	return (system: string) => (system === EXTRACTION_SYSTEM ? JSON.stringify(facts) : "[]");
}
const extractionCalls = () => llmCalls.filter((c) => c.system === EXTRACTION_SYSTEM);

beforeAll(async () => {
	await setupTempDb();
	cwd = makeTempDir("worker-project");
	tags = getTags(cwd);
	transcript = join(cwd, "session.jsonl");
});

afterAll(() => {
	teardownTempDb();
	resetRuntimeState();
});

beforeEach(() => {
	// Sessions survive between tests: the turn-job tests build on each other's offsets.
	resetRuntimeState({ keepSessions: true });
	resetFakeLlm();
});

describe("turn jobs", () => {
	const SESSION = "worker-session-1";
	const job = () => ({ kind: "turn" as const, sessionId: SESSION, transcriptPath: transcript, cwd, projectTag: tags.project, userTag: tags.user });

	test("extract the transcript, store memories and advance the session offset", async () => {
		writeTranscript(transcript, turnOne);
		setLlmHandler(extractionHandler([
			{ memory: "The CSV importer strips a leading UTF-8 BOM before parsing the header row", type: "error-solution" },
			{ memory: "CSV import code lives in src/importer/csv.ts", type: "architecture" },
		]));
		enqueue(job());

		await runWorker();

		expect(listJobs()).toEqual([]);
		expect(extractionCalls()).toHaveLength(1);
		const conversation = extractionCalls()[0]!.user;
		expect(conversation).toContain("[user] The importer chokes on CSV files with a BOM");
		expect(conversation).toContain("(tool) Edit: src/importer/csv.ts");
		expect(conversation).toContain("[REDACTED]"); // <private> stripped before the LLM sees it
		expect(conversation).not.toContain("sk-secret-123");
		expect(conversation).not.toContain("injected by codexfi"); // hook attachments never feed back
		expect(conversation).not.toContain("private chain of thought");

		const stored = await list(tags.project, { limit: 20 });
		expect(stored.map((m) => m.memory).sort()).toEqual([
			"CSV import code lives in src/importer/csv.ts",
			"The CSV importer strips a leading UTF-8 BOM before parsing the header row",
		]);
		expect(stored[0]!.metadata).toMatchObject({ source: "claude-code", session_id: SESSION });

		const state = loadSession(SESSION);
		expect(state.transcriptOffset).toBe(statSync(transcript).size);
		expect(state.turns).toBe(1);
		expect(state.transcriptPath).toBe(transcript);
	});

	test("a second job for the same session finds nothing new: no LLM call, nothing stored", async () => {
		const before = vs.countRows();
		const offset = loadSession(SESSION).transcriptOffset;
		setLlmHandler(extractionHandler([{ memory: "Should never be stored", type: "learned-pattern" }]));
		enqueue(job());
		enqueue(job()); // turn jobs for one session coalesce

		await runWorker();

		expect(extractionCalls()).toHaveLength(0);
		expect(vs.countRows()).toBe(before);
		expect(loadSession(SESSION).transcriptOffset).toBe(offset);
	});

	test("the next turn only extracts the newly appended messages", async () => {
		appendFileSync(transcript, turnTwo.map((r) => JSON.stringify(r)).join("\n") + "\n");
		setLlmHandler(extractionHandler([{ memory: "The CSV importer delimiter is configurable via importer.delimiter (default comma)", type: "project-config" }]));
		enqueue(job());

		await runWorker();

		expect(extractionCalls()).toHaveLength(1);
		const conversation = extractionCalls()[0]!.user;
		expect(conversation).toContain("make the delimiter configurable");
		expect(conversation).not.toContain("BOM");
		expect(loadSession(SESSION).transcriptOffset).toBe(statSync(transcript).size);
		expect(loadSession(SESSION).turns).toBe(2);
	});

	test("tiny exchanges (< MIN_EXCHANGE_CHARS) stay pending (no LLM call, offset kept) until more arrives", async () => {
		const t = join(cwd, "tiny.jsonl");
		writeTranscript(t, [
			{ type: "user", message: { role: "user", content: "hi" } },
			{ type: "assistant", message: { role: "assistant", content: "hello!" } },
		]);
		enqueue({ ...job(), sessionId: "worker-tiny", transcriptPath: t });
		await runWorker();
		expect(llmCalls).toHaveLength(0);
		expect(loadSession("worker-tiny").transcriptOffset).toBe(0);
	});

	test("an LLM failure keeps the offset (retry next turn) instead of dropping the turn", async () => {
		const t = join(cwd, "fail.jsonl");
		writeTranscript(t, turnOne);
		setLlmHandler((system) => {
			if (system === EXTRACTION_SYSTEM) throw new Error("529 overloaded");
			return "[]";
		});
		enqueue({ ...job(), sessionId: "worker-fail", transcriptPath: t });
		await runWorker();
		const afterFail = loadSession("worker-fail");
		expect(afterFail.transcriptOffset).toBe(0);
		expect(afterFail.failures).toBe(1);

		resetFakeLlm();
		setLlmHandler((system) => (system === EXTRACTION_SYSTEM ? JSON.stringify([{ memory: "Importer strips a leading BOM before parsing headers.", type: "error-solution" }]) : "[]"));
		enqueue({ ...job(), sessionId: "worker-fail", transcriptPath: t });
		await runWorker();
		const afterRetry = loadSession("worker-fail");
		expect(afterRetry.transcriptOffset).toBe(statSync(t).size);
		expect(afterRetry.failures).toBe(0);
	});
});

describe("summary jobs", () => {
	test("write one session-summary over the whole transcript, once per new turn", async () => {
		const SESSION = "worker-session-summary";
		const t = join(cwd, "summary.jsonl");
		const long = (n: number) => `${"Detailed discussion of the importer refactor and its test plan. ".repeat(n)}`;
		writeTranscript(t, [
			{ type: "user", message: { role: "user", content: `Let's refactor the importer. ${long(4)}` } },
			{ type: "assistant", message: { role: "assistant", content: long(6) } },
		]);
		setLlmHandler((system) => {
			if (system === SUMMARY_SYSTEM) return JSON.stringify([{ memory: "Refactored the CSV importer and wrote its test plan.", type: "session-summary" }]);
			return "[]";
		});
		const job = { kind: "summary" as const, sessionId: SESSION, transcriptPath: t, cwd, projectTag: tags.project, userTag: tags.user, reason: "session-end:exit" };
		enqueue(job);

		await runWorker();

		// the unextracted tail is flushed first (turn extraction), then summarised
		expect(llmCalls.map((c) => c.system)).toEqual([EXTRACTION_SYSTEM, SUMMARY_SYSTEM]);
		const summaries = (await list(tags.project, { limit: 50 })).filter((m) => m.metadata.type === "session-summary");
		expect(summaries.map((m) => m.memory)).toEqual(["Refactored the CSV importer and wrote its test plan."]);
		expect(summaries[0]!.metadata.reason).toBe("session-end:exit");
		expect(loadSession(SESSION).summarizedTurns).toBe(1);

		// Same session, nothing new since the last summary → no second summary.
		resetFakeLlm();
		enqueue(job);
		await runWorker();
		expect(llmCalls.filter((c) => c.system === SUMMARY_SYSTEM)).toHaveLength(0);
	});
});

describe("init jobs", () => {
	test("auto-init seeds a new project from its files", async () => {
		const proj = makeTempDir("worker-init-project");
		writeFileSync(join(proj, "README.md"), "# Ledgerly\nDouble-entry bookkeeping API written in Go.");
		const projTags = getTags(proj);
		setLlmHandler((system, user) => {
			if (system !== INIT_EXTRACTION_SYSTEM) return "[]";
			expect(user).toContain("=== README.md ===");
			return JSON.stringify([{ memory: "Ledgerly is a double-entry bookkeeping API written in Go", type: "project-brief" }]);
		});
		enqueue({ kind: "init", cwd: proj, projectTag: projTags.project, userTag: projTags.user });

		await runWorker();

		const stored = await list(projTags.project);
		expect(stored.map((m) => m.memory)).toEqual(["Ledgerly is a double-entry bookkeeping API written in Go"]);
		expect(stored[0]!.metadata.source).toBe("auto-init");

		// A project that already has memories is never re-initialised.
		resetFakeLlm();
		enqueue({ kind: "init", cwd: proj, projectTag: projTags.project, userTag: projTags.user });
		await runWorker();
		expect(llmCalls).toHaveLength(0);
	});
});

describe("worker lock", () => {
	test("another live worker holding the lock → runWorker() leaves the queue alone", async () => {
		writeFileSync(join(TEST_DATA_DIR, "worker.lock"), JSON.stringify({ pid: process.ppid, at: Date.now() }));
		enqueue({ kind: "turn", sessionId: "locked", transcriptPath: transcript, cwd, projectTag: tags.project, userTag: tags.user });
		await runWorker();
		expect(listJobs()).toHaveLength(1);
	});

	test("the worker releases its lock when done", async () => {
		await runWorker();
		expect(existsSync(join(TEST_DATA_DIR, "worker.lock"))).toBe(false);
	});
});

describe("transcript settle delay", () => {
	test("a freshly enqueued turn job waits for late transcript writes before reading", async () => {
		const t = join(cwd, "settle.jsonl");
		writeTranscript(t, [{ type: "user", message: { role: "user", content: "Rename the importer module to ingest and update every import path accordingly." } }]);
		setLlmHandler(extractionHandler([]));
		enqueueNow({ kind: "turn", sessionId: "worker-settle", transcriptPath: t, cwd, projectTag: tags.project, userTag: tags.user });
		// Claude Code appends the assistant's final message after the Stop hook fired.
		setTimeout(() => {
			appendFileSync(t, JSON.stringify({ type: "assistant", message: { role: "assistant", content: "Renamed src/importer to src/ingest and fixed all imports." } }) + "\n");
		}, 300);

		const t0 = Date.now();
		await runWorker();
		expect(Date.now() - t0).toBeGreaterThanOrEqual(1_000);
		expect(extractionCalls()).toHaveLength(1);
		expect(extractionCalls()[0]!.user).toContain("Renamed src/importer to src/ingest");
	}, 10_000);
});
