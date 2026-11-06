/**
 * LLM backend — the single place codexfi talks to a language model.
 *
 * Two backends, both Claude:
 *
 *   "claude-cli"     (default) — shells out to the user's own `claude` CLI in
 *                    headless mode (`claude -p`). Uses whatever auth Claude Code
 *                    already has (Pro/Max subscription or the user's API key), so
 *                    codexfi needs ZERO extra keys. The call is stripped to the
 *                    bone: replaced system prompt, no tools, no settings/plugins,
 *                    no MCP, no session persistence → ~600 input tokens overhead.
 *
 *   "anthropic-api"  — direct Messages API call with an Anthropic API key
 *                    (codexfi.jsonc `anthropicApiKey` or ANTHROPIC_API_KEY env).
 *                    Faster and parallelisable; useful for CI and benchmarks.
 *
 * Recursion safety (belt and braces): the child runs with `--safe-mode` and
 * `--setting-sources ""` (no plugins/hooks load) AND env CODEXFI_DISABLE=1,
 * which makes every codexfi entrypoint exit immediately.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import {
	ANTHROPIC_API_KEY,
	ANTHROPIC_BASE_URL,
	ANTHROPIC_PRICE_INPUT_PER_M,
	ANTHROPIC_PRICE_OUTPUT_PER_M,
	LLM_BACKEND,
	LLM_MAX_TOKENS,
	LLM_MODEL,
	LLM_TEMPERATURE,
	LLM_TIMEOUT_MS,
	type LlmBackend,
} from "./config.js";
import { withRetry, EXTRACT_RETRY } from "./retry.js";
import { ledger, activityLog } from "./telemetry.js";

export interface LlmUsage {
	inputTokens: number;
	outputTokens: number;
	/** Notional USD cost as reported by Claude Code (subscription users are not billed per call). */
	costUsd: number;
	durationMs: number;
	model: string;
}

export interface LlmResult {
	text: string;
	usage: LlmUsage;
}

export interface LlmCallOptions {
	/** Operation label for telemetry (extraction, contradiction, summary, condense, …). */
	operation?: string;
	/** Override the configured model for this call. */
	model?: string;
	/** Override the configured backend for this call. */
	backend?: LlmBackend;
	maxTokens?: number;
	timeoutMs?: number;
}

// ── claude CLI discovery ────────────────────────────────────────────────────────

let cachedClaudeBin: string | null | undefined;

/**
 * Locate the `claude` executable. Order:
 *   1. CODEXFI_CLAUDE_BIN (explicit override)
 *   2. CLAUDE_CODE_EXECPATH — set by Claude Code for hook processes; it is the
 *      exact binary running the session (the VS Code extension's bundled CLI is
 *      NOT on PATH, so this is the only reliable way to find it there)
 *   3. PATH, then well-known install locations.
 * Returns null when Claude Code is not installed.
 */
export function findClaudeBinary(): string | null {
	if (cachedClaudeBin !== undefined) return cachedClaudeBin;

	for (const fromEnv of [process.env.CODEXFI_CLAUDE_BIN, process.env.CLAUDE_CODE_EXECPATH]) {
		if (fromEnv && existsSync(fromEnv)) return (cachedClaudeBin = fromEnv);
	}

	const exe = process.platform === "win32" ? "claude.exe" : "claude";
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		const candidate = join(dir, exe);
		if (existsSync(candidate)) return (cachedClaudeBin = candidate);
	}

	const home = homedir();
	for (const candidate of [
		join(home, ".local", "bin", exe),
		join(home, ".claude", "local", exe),
		"/opt/homebrew/bin/claude",
		"/usr/local/bin/claude",
	]) {
		if (existsSync(candidate)) return (cachedClaudeBin = candidate);
	}
	return (cachedClaudeBin = null);
}

/** Test hook — reset the cached binary lookup. */
export function _resetClaudeBinaryCache(): void {
	cachedClaudeBin = undefined;
}

/**
 * Resolve which backend to use right now. An explicit config/env choice wins;
 * "auto" prefers the user's Claude Code login (zero setup) and falls back to an
 * API key when the CLI is missing.
 */
export function resolveBackend(preferred: LlmBackend = LLM_BACKEND): Exclude<LlmBackend, "auto"> | null {
	if (preferred === "claude-cli") return "claude-cli";
	if (preferred === "anthropic-api") return "anthropic-api";
	if (findClaudeBinary()) return "claude-cli";
	if (ANTHROPIC_API_KEY) return "anthropic-api";
	return null;
}

/** True when some LLM backend is usable — used by `codexfi status`. */
export function isLlmAvailable(): boolean {
	return resolveBackend() !== null;
}

// ── claude CLI backend ──────────────────────────────────────────────────────────

/** Neutral working directory for the child so no project CLAUDE.md / .claude settings load. */
function childCwd(): string {
	const dir = join(tmpdir(), "codexfi-llm");
	try {
		mkdirSync(dir, { recursive: true });
	} catch {
		// tmpdir always exists; fall back to it
		return tmpdir();
	}
	return dir;
}

/**
 * Build the argv for a minimal-overhead headless call. Exported for tests.
 *
 * --safe-mode skips plugins, hooks, CLAUDE.md, skills, MCP and auto-memory while
 * keeping the normal login (unlike --bare, which only accepts an API key). With
 * a replaced system prompt and no tools the call costs ~600 input tokens.
 */
export function buildClaudeArgs(system: string, model: string): string[] {
	return [
		"-p",
		"--safe-mode",
		"--model", model,
		"--output-format", "json",
		"--system-prompt", system,
		"--tools", "",
		"--setting-sources", "",
		"--strict-mcp-config",
		"--no-session-persistence",
		"--disable-slash-commands",
	];
}

function childEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env, CODEXFI_DISABLE: "1" };
	if (process.env.CODEXFI_CLI_STRIP_API_KEY === "1") delete env.ANTHROPIC_API_KEY;
	return env;
}

async function callClaudeCli(system: string, user: string, opts: LlmCallOptions): Promise<LlmResult> {
	const bin = findClaudeBinary();
	if (!bin) throw new Error("claude CLI not found (set CODEXFI_CLAUDE_BIN or install Claude Code)");

	const model = opts.model ?? LLM_MODEL;
	const args = buildClaudeArgs(system, model);
	const timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
	const started = Date.now();

	const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
		(resolve, reject) => {
			const child = spawn(bin, args, {
				cwd: childCwd(),
				// Inherit the parent's auth exactly as Claude Code itself resolves it.
				// CODEXFI_CLI_STRIP_API_KEY=1 (benchmarks) forces the subscription login
				// even when ANTHROPIC_API_KEY is set for other purposes in this process.
				env: childEnv(),
				stdio: ["pipe", "pipe", "pipe"],
			});
			let out = "";
			let err = "";
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			child.stdout.on("data", (d) => (out += d));
			child.stderr.on("data", (d) => (err += d));
			child.on("error", (e) => {
				clearTimeout(timer);
				reject(e);
			});
			child.on("close", (c) => {
				clearTimeout(timer);
				resolve({ stdout: out, stderr: err, code: c });
			});
			child.stdin.end(user);
		},
	);

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error(`claude CLI returned non-JSON (exit ${code}): ${(stderr || stdout).slice(0, 300)}`);
	}
	if (parsed.is_error || code !== 0) {
		throw new Error(`claude CLI error (exit ${code}): ${String(parsed.result ?? stderr).slice(0, 300)}`);
	}

	const usage = (parsed.usage ?? {}) as Record<string, number>;
	const modelUsage = (parsed.modelUsage ?? {}) as Record<string, unknown>;
	const inputTokens =
		(usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
	return {
		text: String(parsed.result ?? "").trim(),
		usage: {
			inputTokens,
			outputTokens: usage.output_tokens ?? 0,
			costUsd: Number(parsed.total_cost_usd ?? 0),
			durationMs: Date.now() - started,
			model: Object.keys(modelUsage)[0] ?? model,
		},
	};
}

// ── Anthropic API backend ───────────────────────────────────────────────────────

/** Map CLI aliases to API model ids. */
function apiModelId(model: string): string {
	const aliases: Record<string, string> = {
		haiku: "claude-haiku-4-5",
		sonnet: "claude-sonnet-4-6",
		opus: "claude-opus-4-6",
	};
	return aliases[model] ?? model;
}

async function callAnthropicApi(system: string, user: string, opts: LlmCallOptions): Promise<LlmResult> {
	if (!ANTHROPIC_API_KEY) throw new Error("No Anthropic API key configured");
	const model = apiModelId(opts.model ?? LLM_MODEL);
	const started = Date.now();

	const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
		method: "POST",
		headers: {
			"x-api-key": ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
			"Content-Type": "application/json",
		},
		signal: AbortSignal.timeout(opts.timeoutMs ?? LLM_TIMEOUT_MS),
		body: JSON.stringify({
			model,
			max_tokens: opts.maxTokens ?? LLM_MAX_TOKENS,
			temperature: LLM_TEMPERATURE,
			system,
			messages: [{ role: "user", content: user }],
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 300)}`);
	}

	const data = (await response.json()) as {
		content?: Array<{ type: string; text?: string }>;
		usage?: { input_tokens?: number; output_tokens?: number };
	};
	const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
	const inputTokens = data.usage?.input_tokens ?? 0;
	const outputTokens = data.usage?.output_tokens ?? 0;
	return {
		text: text.trim(),
		usage: {
			inputTokens,
			outputTokens,
			costUsd:
				(inputTokens * ANTHROPIC_PRICE_INPUT_PER_M + outputTokens * ANTHROPIC_PRICE_OUTPUT_PER_M) / 1_000_000,
			durationMs: Date.now() - started,
			model,
		},
	};
}

// ── Public entrypoint ───────────────────────────────────────────────────────────

/**
 * Run one system+user completion and return the raw text.
 *
 * Never throws: on total failure it returns "[]" so JSON-array callers degrade to
 * "nothing extracted this turn" — a memory system must never break a session.
 * Use callLlmStrict() when the caller needs to see the error (CLI, tests).
 */
export async function callLlm(system: string, user: string, opts: LlmCallOptions = {}): Promise<string> {
	try {
		return (await callLlmStrict(system, user, opts)).text;
	} catch (error) {
		console.warn(`[codexfi] LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
		return "[]";
	}
}

/** Like callLlm() but throws on failure and returns usage. */
export async function callLlmStrict(system: string, user: string, opts: LlmCallOptions = {}): Promise<LlmResult> {
	const backend = resolveBackend(opts.backend ?? LLM_BACKEND);
	if (!backend) {
		throw new Error(
			"No LLM backend available — install Claude Code (recommended) or set anthropicApiKey in ~/.codexfi/codexfi.jsonc",
		);
	}
	const fn = backend === "claude-cli" ? callClaudeCli : callAnthropicApi;
	const result = await withRetry(() => fn(system, user, opts), `LLM ${backend}`, EXTRACT_RETRY);

	try {
		const op = opts.operation ?? "extraction";
		await ledger.recordLlm(backend, result.usage.model, result.usage.inputTokens, result.usage.outputTokens, result.usage.costUsd);
		activityLog.recordLlm(backend, result.usage.model, op, result.usage.inputTokens, result.usage.outputTokens, result.usage.costUsd);
	} catch {
		// telemetry must never block
	}
	return result;
}
