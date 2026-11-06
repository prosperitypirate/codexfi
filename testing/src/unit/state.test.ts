/**
 * Unit tests for claude/state.ts — the on-disk state shared by short-lived hook
 * processes and the background worker (sessions, job queue, worker lock, logs).
 * Everything lives under the sandbox CODEXFI_DATA_DIR.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	acquireWorkerLock,
	enqueue,
	listJobs,
	loadSession,
	logLine,
	pruneSessions,
	readJob,
	releaseWorkerLock,
	removeJob,
	saveSession,
	workerRunning,
} from "../../../plugin/src/claude/state.js";
import { resetRuntimeState, TEST_DATA_DIR } from "../helpers/test-env.js";

const LOCK = join(TEST_DATA_DIR, "worker.lock");

beforeEach(() => resetRuntimeState());
afterEach(() => resetRuntimeState());

// ── Sessions ────────────────────────────────────────────────────────────────────

describe("session state", () => {
	test("unknown session → fresh defaults", () => {
		expect(loadSession("never-seen")).toEqual({ transcriptOffset: 0, injected: [], turns: 0 });
		expect(loadSession(undefined)).toEqual({ transcriptOffset: 0, injected: [], turns: 0 });
	});

	test("save → load round-trip, stamped with updatedAt", () => {
		saveSession("sess-1", { transcriptOffset: 1234, injected: ["a", "b"], turns: 3, cwd: "/repo" });
		const s = loadSession("sess-1");
		expect(s).toMatchObject({ transcriptOffset: 1234, injected: ["a", "b"], turns: 3, cwd: "/repo" });
		expect(typeof s.updatedAt).toBe("string");
		expect(existsSync(join(TEST_DATA_DIR, "sessions", "sess-1.json"))).toBe(true);
	});

	test("writes are atomic (no .tmp files left behind)", () => {
		for (let i = 0; i < 5; i++) saveSession("sess-atomic", { transcriptOffset: i, injected: [], turns: i });
		expect(readdirSync(join(TEST_DATA_DIR, "sessions"))).toEqual(["sess-atomic.json"]);
	});

	test("unsafe session ids are ignored (no path traversal)", () => {
		saveSession("../escape", { transcriptOffset: 9, injected: [], turns: 1 });
		saveSession("a/b", { transcriptOffset: 9, injected: [], turns: 1 });
		expect(existsSync(join(TEST_DATA_DIR, "escape.json"))).toBe(false);
		expect(loadSession("../escape").transcriptOffset).toBe(0);
	});

	test("the injected-id list is capped at the newest 2,000", () => {
		const ids = Array.from({ length: 2_500 }, (_, i) => `id-${i}`);
		saveSession("sess-cap", { transcriptOffset: 0, injected: ids, turns: 0 });
		const s = loadSession("sess-cap");
		expect(s.injected.length).toBe(2_000);
		expect(s.injected[0]).toBe("id-500");
		expect(s.injected.at(-1)).toBe("id-2499");
	});

	test("a corrupt session file falls back to defaults", () => {
		mkdirSync(join(TEST_DATA_DIR, "sessions"), { recursive: true });
		writeFileSync(join(TEST_DATA_DIR, "sessions", "sess-bad.json"), "{oops");
		expect(loadSession("sess-bad").turns).toBe(0);
	});

	test("pruneSessions deletes files untouched for longer than maxAge", () => {
		saveSession("sess-old", { transcriptOffset: 0, injected: [], turns: 0 });
		saveSession("sess-new", { transcriptOffset: 0, injected: [], turns: 0 });
		const old = join(TEST_DATA_DIR, "sessions", "sess-old.json");
		const past = new Date(Date.now() - 30 * 24 * 3600 * 1000);
		utimesSync(old, past, past);
		pruneSessions();
		expect(existsSync(old)).toBe(false);
		expect(existsSync(join(TEST_DATA_DIR, "sessions", "sess-new.json"))).toBe(true);
	});
});

// ── Job queue ───────────────────────────────────────────────────────────────────

describe("job queue", () => {
	const base = { cwd: "/repo", projectTag: "p", userTag: "u" };

	test("enqueue writes a job stamped with createdAt; readJob returns it", () => {
		const name = enqueue({ ...base, kind: "turn", sessionId: "s1", transcriptPath: "/t.jsonl" });
		expect(name).toMatch(/^\d{13}-[0-9a-f]{8}\.json$/);
		const job = readJob(name)!;
		expect(job).toMatchObject({ ...base, kind: "turn", sessionId: "s1", transcriptPath: "/t.jsonl" });
		expect(Date.parse(job.createdAt)).not.toBeNaN();
	});

	test("listJobs returns jobs oldest-first", async () => {
		const names: string[] = [];
		for (const kind of ["init", "turn", "summary"] as const) {
			names.push(enqueue({ ...base, kind }));
			await Bun.sleep(3); // names are ms-timestamp prefixed
		}
		expect(listJobs()).toEqual(names);
		expect(listJobs().map((n) => readJob(n)!.kind)).toEqual(["init", "turn", "summary"]);
	});

	test("removeJob removes one job and tolerates a missing one", () => {
		const a = enqueue({ ...base, kind: "turn" });
		const b = enqueue({ ...base, kind: "turn" });
		removeJob(a);
		removeJob(a); // already gone — no throw
		expect(listJobs()).toEqual([b]);
		expect(readJob(a)).toBeNull();
	});

	test("empty / missing queue → []", () => {
		expect(listJobs()).toEqual([]);
	});
});

// ── Worker lock ─────────────────────────────────────────────────────────────────

/** A pid that is certainly not running: a child that has already exited. */
function deadPid(): number {
	const r = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
	return Number(r.stdout);
}

describe("worker lock", () => {
	test("acquire creates worker.lock with our pid; release removes it", () => {
		expect(acquireWorkerLock()).toBe(true);
		expect(JSON.parse(readFileSync(LOCK, "utf8")).pid).toBe(process.pid);
		// our own lock does not count as "another worker running"
		expect(workerRunning()).toBe(false);
		releaseWorkerLock();
		expect(existsSync(LOCK)).toBe(false);
	});

	test("a stale lock (dead pid) is taken over", () => {
		const pid = deadPid();
		writeFileSync(LOCK, JSON.stringify({ pid, at: Date.now() - 60_000 }));
		expect(workerRunning()).toBe(false);
		expect(acquireWorkerLock()).toBe(true);
		expect(JSON.parse(readFileSync(LOCK, "utf8")).pid).toBe(process.pid);
	});

	test("a lock held by another live process is respected", () => {
		// Our parent process (the shell / bun runner) is alive and is not us.
		writeFileSync(LOCK, JSON.stringify({ pid: process.ppid, at: Date.now() }));
		expect(workerRunning()).toBe(true);
		expect(acquireWorkerLock()).toBe(false);
		// release never deletes someone else's lock
		releaseWorkerLock();
		expect(JSON.parse(readFileSync(LOCK, "utf8")).pid).toBe(process.ppid);
	});

	test("a corrupt lock file is taken over", () => {
		writeFileSync(LOCK, "garbage");
		expect(acquireWorkerLock()).toBe(true);
	});
});

// ── Logging ─────────────────────────────────────────────────────────────────────

describe("logLine", () => {
	const logDir = join(TEST_DATA_DIR, "logs");

	test("appends a timestamped line with pid and JSON data", () => {
		logLine("unit", "hello", { n: 1 });
		logLine("unit", "world");
		const lines = readFileSync(join(logDir, "unit.log"), "utf8").trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(new RegExp(`^\\d{4}-\\d\\d-\\d\\dT.*Z \\[${process.pid}\\] hello \\{"n":1\\}$`));
		expect(lines[1]).toEndWith("] world");
	});

	test("rotates to .1 once the log passes 2 MB", () => {
		mkdirSync(logDir, { recursive: true });
		writeFileSync(join(logDir, "big.log"), "x".repeat(2 * 1024 * 1024 + 10));
		logLine("big", "after rotation");
		expect(statSync(join(logDir, "big.log.1")).size).toBeGreaterThan(2 * 1024 * 1024);
		expect(readFileSync(join(logDir, "big.log"), "utf8")).toContain("after rotation");
	});

	test("never throws, even when the log directory cannot be created", () => {
		// Replace DATA_DIR/logs with a plain file so mkdir/append fail.
		rmSync(logDir, { recursive: true, force: true });
		writeFileSync(logDir, "not a directory");
		try {
			expect(() => logLine("unit", "should be swallowed", { n: 1 })).not.toThrow();
		} finally {
			rmSync(logDir, { force: true });
		}
	});

	test("never throws on unserialisable data", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => logLine("unit", "circular", circular)).not.toThrow();
	});
});

// ── Regression tests from the 1.0 review: stale-lock takeover ──────────────────
import { writeFileSync as wfs } from "node:fs";
import { join as pjoin } from "node:path";
import { acquireWorkerLock as acq, releaseWorkerLock as rel, workerRunning as running } from "../../../plugin/src/claude/state.js";
import { DATA_DIR as DD } from "../../../plugin/src/config.js";

describe("worker lock staleness", () => {
	test("a lock whose heartbeat is older than 10 minutes is stale even if the pid exists", () => {
		rel();
		wfs(pjoin(DD, "worker.lock"), JSON.stringify({ pid: 1, at: Date.now() - 11 * 60 * 1000 }));
		expect(running()).toBe(false);
		expect(acq()).toBe(true);
		rel();
	});

	test("a fresh lock held by a live pid blocks acquisition", () => {
		rel();
		wfs(pjoin(DD, "worker.lock"), JSON.stringify({ pid: 1, at: Date.now() }));
		expect(running()).toBe(true);
		expect(acq()).toBe(false);
		wfs(pjoin(DD, "worker.lock"), JSON.stringify({ pid: 999999, at: 0 }));
		expect(acq()).toBe(true);
		rel();
	});
});
