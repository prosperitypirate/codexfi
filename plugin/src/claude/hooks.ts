/**
 * Claude Code hook handlers — `codexfi hook <event>` reads the hook payload on
 * stdin and (for the two read hooks) prints a JSON `additionalContext` reply.
 *
 *   session-start       structured [MEMORY] baseline (startup / clear / compact; not resume)
 *   user-prompt-submit  per-turn "Relevant to Current Task" (only memories not yet shown)
 *   stop                enqueue extraction of the finished turn → detached worker
 *   pre-compact         enqueue a session summary before context is compacted
 *   session-end         enqueue a session summary (1.5 s budget → always detach)
 *
 * Every handler fails silent: a memory system must never block or break a turn.
 * Heavy modules (store, embedder) are imported lazily so the write hooks return
 * in milliseconds.
 */

import { PLUGIN_CONFIG } from "../plugin-config.js";
import { getTags } from "../services/tags.js";
import { isDisabled } from "./runtime.js";
import { enqueue, loadSession, logLine, pruneSessions, saveSession } from "./state.js";
import { spawnWorker } from "./spawn.js";

export interface HookInput {
	session_id?: string;
	transcript_path?: string;
	cwd?: string;
	hook_event_name?: string;
	prompt?: string;
	source?: string;
	reason?: string;
	trigger?: string;
	agent_id?: string;
	agent_type?: string;
}

export type HookEvent = "session-start" | "user-prompt-submit" | "stop" | "pre-compact" | "session-end";

const EVENT_NAMES: Record<HookEvent, string> = {
	"session-start": "SessionStart",
	"user-prompt-submit": "UserPromptSubmit",
	stop: "Stop",
	"pre-compact": "PreCompact",
	"session-end": "SessionEnd",
};

async function readStdin(): Promise<string> {
	if (process.stdin.isTTY) return "";
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

function emitContext(event: HookEvent, text: string): void {
	if (!text.trim()) return;
	process.stdout.write(
		JSON.stringify({ hookSpecificOutput: { hookEventName: EVENT_NAMES[event], additionalContext: text } }),
	);
}

const MEMORY_KEYWORD_PATTERN = new RegExp(`\\b(${PLUGIN_CONFIG.keywordPatterns.join("|")})\\b`, "i");

/** True when the user (outside code blocks) asks to remember something. */
export function detectMemoryKeyword(text: string): boolean {
	const withoutCode = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
	return MEMORY_KEYWORD_PATTERN.test(withoutCode);
}

/** Leave room for REMEMBER_NOTE under Claude Code's 10k cap. */
const HOOK_LIMIT_WITH_NOTE = 9_000;

const REMEMBER_NOTE =
	"Note from codexfi: the user asked for something to be remembered. The codexfi `memory_add` tool stores it " +
	"permanently (scope \"project\" for this repo, \"user\" for cross-project preferences); turns are also " +
	"extracted automatically in the background.";

// ── Handlers ────────────────────────────────────────────────────────────────────

async function onSessionStart(input: HookInput, cwd: string): Promise<void> {
	// Resumed sessions replay their earlier context from the transcript — injecting
	// again would duplicate it and bust the prompt cache.
	if (input.source === "resume") return;

	const { ensureInit, tagsFor, fitToLimit, survivingIds } = await import("./runtime.js");
	const { buildSessionContext } = await import("./context.js");
	await ensureInit();
	const tags = tagsFor(cwd);

	const ctx = await buildSessionContext(tags.project, tags.user, cwd);

	const fitted = fitToLimit(ctx.text);
	// Fresh context window (startup / clear / compact): only what survived trimming
	// counts as shown.
	const state = loadSession(input.session_id);
	saveSession(input.session_id, { ...state, injected: survivingIds(fitted, ctx.injectedItems), cwd, transcriptPath: input.transcript_path });

	const { isEmbedderReady } = await import("../embedder.js");
	if (!isEmbedderReady()) {
		enqueue({ kind: "warmup", cwd, projectTag: tags.project, userTag: tags.user, sessionId: input.session_id });
		spawnWorker();
	}
	if (ctx.projectMemoryCount === 0 && PLUGIN_CONFIG.autoInit && input.source !== "compact") {
		enqueue({ kind: "init", cwd, projectTag: tags.project, userTag: tags.user, sessionId: input.session_id });
		spawnWorker();
	}
	pruneSessions();
	emitContext("session-start", fitted);
}

async function onUserPromptSubmit(input: HookInput): Promise<void> {
	const prompt = (input.prompt ?? "").trim();
	if (prompt.length < 3) return;

	const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
	const { isEmbedderReady } = await import("../embedder.js");
	if (!isEmbedderReady()) {
		// First run: never download model weights inside the prompt hook.
		const tags = getTags(cwd);
		enqueue({ kind: "warmup", cwd, projectTag: tags.project, userTag: tags.user, sessionId: input.session_id });
		spawnWorker();
		if (detectMemoryKeyword(prompt)) emitContext("user-prompt-submit", REMEMBER_NOTE);
		return;
	}
	const { ensureInit, tagsFor, fitToLimit, survivingIds } = await import("./runtime.js");
	const { buildPromptContext } = await import("./context.js");
	await ensureInit();
	const tags = tagsFor(cwd);

	const state = loadSession(input.session_id);
	const ctx = await buildPromptContext(prompt, tags.project, tags.user, new Set(state.injected));
	const fitted = fitToLimit(ctx.text, HOOK_LIMIT_WITH_NOTE);
	const shown = survivingIds(fitted, ctx.injectedItems);
	if (shown.length > 0) {
		// Re-load: the worker may have advanced the transcript offset meanwhile.
		const latest = loadSession(input.session_id);
		saveSession(input.session_id, { ...latest, injected: [...latest.injected, ...shown] });
	}

	let text = fitted;
	if (detectMemoryKeyword(prompt)) text = text ? `${text}\n\n${REMEMBER_NOTE}` : REMEMBER_NOTE;
	emitContext("user-prompt-submit", text);
}

function enqueueFromHook(kind: "turn" | "summary", input: HookInput, cwd: string, reason?: string): void {
	if (!input.transcript_path || !input.session_id) return;
	const tags = getTags(cwd);
	enqueue({
		kind,
		sessionId: input.session_id,
		transcriptPath: input.transcript_path,
		cwd,
		projectTag: tags.project,
		userTag: tags.user,
		reason,
	});
	spawnWorker();
}

// ── Entry ───────────────────────────────────────────────────────────────────────

/** Run one hook event. Never throws; always resolves. */
export async function runHook(event: HookEvent, rawInput?: string): Promise<void> {
	const started = Date.now();
	let input: HookInput = {};
	try {
		input = JSON.parse(rawInput ?? (await readStdin()) ?? "{}") as HookInput;
	} catch {
		input = {};
	}
	// Key memory by the project root, not the shell's current subdirectory, so a
	// `cd src/` mid-session doesn't split the project into two memory scopes.
	const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
	if (isDisabled(cwd)) return;
	// Subagent hook traffic is exploration noise — memory serves the main thread.
	if (input.agent_id) return;

	try {
		switch (event) {
			case "session-start":
				await onSessionStart(input, cwd);
				break;
			case "user-prompt-submit":
				await onUserPromptSubmit(input);
				break;
			case "stop":
				enqueueFromHook("turn", input, cwd);
				break;
			case "pre-compact":
				enqueueFromHook("summary", input, cwd, `pre-compact:${input.trigger ?? ""}`);
				break;
			case "session-end":
				enqueueFromHook("summary", input, cwd, `session-end:${input.reason ?? ""}`);
				break;
		}
	} catch (e) {
		logLine("hook", `${event} failed`, { error: e instanceof Error ? e.message : String(e) });
	} finally {
		logLine("hook", `${event}`, { ms: Date.now() - started, session: input.session_id, source: input.source });
	}
}
