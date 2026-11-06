/**
 * Background worker — drains the job queue written by hooks.
 *
 * Hooks must return in milliseconds, but extraction is an LLM call (seconds).
 * So Stop / PreCompact / SessionEnd only enqueue a job and spawn this worker as
 * a detached process. Exactly one worker runs at a time (worker.lock); it
 * processes jobs oldest-first and exits when the queue is empty.
 *
 * Turn jobs for the same session coalesce naturally: the first one reads the
 * transcript from the session's saved byte offset to EOF, so later queued jobs
 * for that session find nothing new and finish instantly.
 */

import { MAX_CONTENT_CHARS, MIN_EXCHANGE_CHARS } from "../config.js";
import * as store from "../store.js";
import { embedBatch } from "../embedder.js";
import { stripPrivateContent } from "../services/privacy.js";
import { runAutoInit } from "./auto-init.js";
import { ensureInit } from "./runtime.js";
import {
	acquireWorkerLock,
	claimJob,
	listJobs,
	loadSession,
	logLine,
	releaseWorkerLock,
	saveSession,
	touchWorkerLock,
	workerRunning,
	type Job,
} from "./state.js";
import { readTranscriptFrom, renderConversation, windowMessages, type TranscriptMessage } from "./transcript.js";

const today = () => new Date().toISOString().slice(0, 10);

function sanitize(messages: TranscriptMessage[]): Array<{ role: string; content: string }> {
	return messages.map((m) => ({ role: m.role, content: stripPrivateContent(m.content) }));
}

/** After this many consecutive failed extraction attempts for a session, skip the stuck span. */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Extract everything appended to the session's transcript since its saved offset.
 *
 * - The offset only advances after every window was stored, so an LLM outage
 *   (offline, rate limit, logged out) retries on the next turn instead of
 *   silently dropping the turn. Completed windows are remembered (`doneWindows`)
 *   so a retry never re-extracts them.
 * - A very short exchange ("use pnpm" / "ok") is left pending and extracted
 *   together with the next turn — unless `flush` (session end / compaction).
 */
async function processTurn(job: Job, opts: { flush?: boolean } = {}): Promise<number> {
	if (!job.transcriptPath || !job.sessionId) return 0;
	const sessionId = job.sessionId;
	const state = loadSession(sessionId);
	const chunk = readTranscriptFrom(job.transcriptPath, state.transcriptOffset);
	if (chunk.messages.length === 0) {
		if (chunk.nextOffset !== state.transcriptOffset) {
			saveSession(sessionId, { ...state, transcriptOffset: chunk.nextOffset, doneWindows: 0 });
		}
		return 0;
	}

	const conversationChars = renderConversation(chunk.messages).length;
	if (conversationChars < MIN_EXCHANGE_CHARS && !opts.flush) return 0;

	let stored = 0;
	const windows = conversationChars >= MIN_EXCHANGE_CHARS ? windowMessages(chunk.messages, MAX_CONTENT_CHARS) : [];
	const alreadyDone = chunk.reset ? 0 : (state.doneWindows ?? 0);
	for (let i = alreadyDone; i < windows.length; i++) {
		try {
			const results = await store.ingest(sanitize(windows[i]!), job.projectTag, {
				metadata: { source: "claude-code", session_id: sessionId, date: today() },
			});
			stored += results.length;
			const progress = loadSession(sessionId);
			saveSession(sessionId, { ...progress, doneWindows: i + 1 });
		} catch (e) {
			const latest = loadSession(sessionId);
			const failures = (latest.failures ?? 0) + 1;
			const giveUp = failures >= MAX_CONSECUTIVE_FAILURES;
			logLine("worker", giveUp ? "extraction failed repeatedly — skipping this span" : "extraction failed — will retry next turn", {
				session: sessionId,
				failures,
				error: e instanceof Error ? e.message : String(e),
			});
			saveSession(sessionId, giveUp
				? { ...latest, transcriptOffset: chunk.nextOffset, doneWindows: 0, failures: 0 }
				: { ...latest, failures });
			return stored;
		}
	}

	// Re-load before saving: a hook may have appended injected ids meanwhile.
	const latest = loadSession(sessionId);
	saveSession(sessionId, {
		...latest,
		transcriptOffset: chunk.nextOffset,
		doneWindows: 0,
		failures: 0,
		turns: latest.turns + 1,
		cwd: job.cwd,
		transcriptPath: job.transcriptPath,
	});
	return stored;
}

/** Keep the first user message (intent) + as much of the tail as fits. */
function summaryWindow(messages: TranscriptMessage[], maxChars: number): TranscriptMessage[] {
	const first = messages.find((m) => m.role === "user");
	const tail: TranscriptMessage[] = [];
	let size = first ? first.content.length : 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m === first) break;
		if (size + m.content.length > maxChars) break;
		tail.unshift(m);
		size += m.content.length;
	}
	return first ? [first, ...tail] : tail;
}

async function processSummary(job: Job): Promise<number> {
	if (!job.transcriptPath || !job.sessionId) return 0;
	const state = loadSession(job.sessionId);
	if (state.turns === 0 || (state.summarizedTurns ?? -1) >= state.turns) return 0;

	const all = readTranscriptFrom(job.transcriptPath, 0).messages;
	if (renderConversation(all).length < MIN_EXCHANGE_CHARS * 5) return 0;

	const results = await store.ingest(sanitize(summaryWindow(all, MAX_CONTENT_CHARS)), job.projectTag, {
		mode: "summary",
		metadata: { source: "claude-code", session_id: job.sessionId, date: today(), reason: job.reason ?? "" },
	});
	const latest = loadSession(job.sessionId);
	saveSession(job.sessionId, { ...latest, summarizedTurns: latest.turns });
	return results.length;
}

/** Claude Code writes the transcript asynchronously; give the final lines a moment to land. */
const TRANSCRIPT_SETTLE_MS = 1_500;

async function settle(job: Job): Promise<void> {
	const age = Date.now() - Date.parse(job.createdAt);
	if (Number.isFinite(age) && age < TRANSCRIPT_SETTLE_MS) {
		await new Promise((r) => setTimeout(r, TRANSCRIPT_SETTLE_MS - age));
	}
}

async function processJob(job: Job): Promise<number> {
	switch (job.kind) {
		case "turn":
			await settle(job);
			return processTurn(job);
		case "summary":
			// Flush any unextracted tail first so the summary isn't the only record.
			await settle(job);
			await processTurn(job, { flush: true });
			return processSummary(job);
		case "warmup":
			// Loading the embedder downloads the model weights on first use.
			await embedBatch(["codexfi warmup"], "query");
			return 0;
		case "init": {
			const existing = await store.list(job.projectTag, { limit: 1 });
			if (existing.length > 0) return 0;
			return runAutoInit(job.cwd, job.projectTag);
		}
	}
}

/** Drain the queue. Returns when no jobs remain (or another worker owns the lock). */
export async function runWorker(): Promise<void> {
	if (!acquireWorkerLock()) return;
	try {
		await ensureInit();
		// Migrate vectors from an older embedding model first, so dedup and
		// contradiction checks during this run see the whole store.
		try {
			const migrated = await store.reembedStale(2_000);
			if (migrated > 0) logLine("worker", "re-embedded rows from an older embedding model", { migrated });
		} catch (e) {
			logLine("worker", "re-embed failed", { error: e instanceof Error ? e.message : String(e) });
		}
		for (;;) {
			const jobs = listJobs();
			if (jobs.length === 0) break;
			for (const name of jobs) {
				const job = claimJob(name);
				if (!job) continue;
				touchWorkerLock();
				const t0 = Date.now();
				try {
					const n = await processJob(job);
					logLine("worker", `${job.kind} done`, { stored: n, ms: Date.now() - t0, session: job.sessionId });
				} catch (e) {
					logLine("worker", `${job.kind} failed`, { error: e instanceof Error ? e.message : String(e) });
				}
			}
		}
	} finally {
		releaseWorkerLock();
	}
	// A hook may have enqueued between our last check and releasing the lock.
	if (listJobs().length > 0 && !workerRunning()) await runWorker();
}
