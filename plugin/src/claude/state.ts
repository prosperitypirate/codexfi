/**
 * Small on-disk state shared between short-lived hook processes and the
 * background worker. Everything lives under DATA_DIR (default ~/.codexfi):
 *
 *   sessions/<session_id>.json   per-session state (transcript cursor, injected ids)
 *   queue/<ts>-<rand>.json       pending background jobs
 *   worker.lock                  pid of the running worker (if any)
 *   logs/worker.log              worker log (size-capped)
 *
 * Writes are atomic (tmp file + rename) so concurrent hooks never read torn JSON.
 */

import { randomBytes } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { DATA_DIR } from "../config.js";

const SAFE_SEGMENT = /^[A-Za-z0-9_.-]{1,128}$/;

function dir(name: string): string {
	const d = join(DATA_DIR, name);
	mkdirSync(d, { recursive: true });
	return d;
}

function writeJsonAtomic(path: string, value: unknown): void {
	const tmp = `${path}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
	writeFileSync(tmp, JSON.stringify(value));
	renameSync(tmp, path);
}

function readJson<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

// ── Session state ───────────────────────────────────────────────────────────────

export interface SessionState {
	/** Byte offset into the transcript already extracted. */
	transcriptOffset: number;
	/** Memory ids injected into this session's context (to avoid repeats). */
	injected: string[];
	/** Number of turns extracted so far. */
	turns: number;
	/** `turns` value when the last session summary was written. */
	summarizedTurns?: number;
	cwd?: string;
	transcriptPath?: string;
	updatedAt?: string;
}

function sessionPath(sessionId: string): string | null {
	if (!SAFE_SEGMENT.test(sessionId)) return null;
	return join(dir("sessions"), `${sessionId}.json`);
}

export function loadSession(sessionId: string | undefined): SessionState {
	const fresh: SessionState = { transcriptOffset: 0, injected: [], turns: 0 };
	if (!sessionId) return fresh;
	const p = sessionPath(sessionId);
	if (!p) return fresh;
	return { ...fresh, ...(readJson<SessionState>(p) ?? {}) };
}

export function saveSession(sessionId: string | undefined, state: SessionState): void {
	if (!sessionId) return;
	const p = sessionPath(sessionId);
	if (!p) return;
	// Cap the injected-id list so a marathon session can't grow it unbounded.
	const injected = state.injected.length > 2_000 ? state.injected.slice(-2_000) : state.injected;
	writeJsonAtomic(p, { ...state, injected, updatedAt: new Date().toISOString() });
}

/** Delete session files untouched for `maxAgeMs` (default 14 days). */
export function pruneSessions(maxAgeMs = 14 * 24 * 60 * 60 * 1000): void {
	try {
		const d = dir("sessions");
		const cutoff = Date.now() - maxAgeMs;
		for (const f of readdirSync(d)) {
			const p = join(d, f);
			try {
				if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
			} catch {
				// ignore
			}
		}
	} catch {
		// ignore
	}
}

// ── Job queue ───────────────────────────────────────────────────────────────────

export type JobKind = "turn" | "summary" | "init" | "warmup";

export interface Job {
	kind: JobKind;
	sessionId?: string;
	transcriptPath?: string;
	cwd: string;
	projectTag: string;
	userTag: string;
	createdAt: string;
	/** For summary jobs: why it was requested (session-end, pre-compact, …). */
	reason?: string;
}

export function enqueue(job: Omit<Job, "createdAt">): string {
	const name = `${Date.now()}-${randomBytes(4).toString("hex")}.json`;
	writeJsonAtomic(join(dir("queue"), name), { ...job, createdAt: new Date().toISOString() });
	return name;
}

/** Pending job files, oldest first. */
export function listJobs(): string[] {
	try {
		return readdirSync(dir("queue")).filter((f) => f.endsWith(".json")).sort();
	} catch {
		return [];
	}
}

export function readJob(name: string): Job | null {
	return readJson<Job>(join(dir("queue"), name));
}

export function removeJob(name: string): void {
	try {
		unlinkSync(join(dir("queue"), name));
	} catch {
		// already gone
	}
}

// ── Worker lock ─────────────────────────────────────────────────────────────────

function lockPath(): string {
	return join(dir("."), "worker.lock");
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** True when another live worker holds the lock. */
export function workerRunning(): boolean {
	const lock = readJson<{ pid: number }>(lockPath());
	return !!lock && lock.pid !== process.pid && isAlive(lock.pid);
}

/**
 * Try to become the worker. Uses an exclusive create so two workers started at
 * the same instant can't both win; a stale lock (dead pid) is taken over.
 */
export function acquireWorkerLock(): boolean {
	const p = lockPath();
	try {
		writeFileSync(p, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" });
		return true;
	} catch {
		const lock = readJson<{ pid: number }>(p);
		if (lock && isAlive(lock.pid) && lock.pid !== process.pid) return false;
		try {
			unlinkSync(p);
			writeFileSync(p, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: "wx" });
			return true;
		} catch {
			return false;
		}
	}
}

export function releaseWorkerLock(): void {
	const lock = readJson<{ pid: number }>(lockPath());
	if (lock?.pid === process.pid) {
		try {
			unlinkSync(lockPath());
		} catch {
			// ignore
		}
	}
}

// ── Logging ─────────────────────────────────────────────────────────────────────

const LOG_CAP_BYTES = 2 * 1024 * 1024;

/** Append one line to logs/<name>.log; rotates to .1 past 2 MB. Never throws. */
export function logLine(name: string, message: string, data?: Record<string, unknown>): void {
	try {
		const p = join(dir("logs"), `${name}.log`);
		if (existsSync(p) && statSync(p).size > LOG_CAP_BYTES) renameSync(p, `${p}.1`);
		const extra = data ? ` ${JSON.stringify(data)}` : "";
		appendFileSync(p, `${new Date().toISOString()} [${process.pid}] ${message}${extra}\n`);
	} catch {
		// logging must never break a hook
	}
}
