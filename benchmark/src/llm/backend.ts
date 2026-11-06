/**
 * Pluggable LLM backend for the ANSWER, JUDGE, retrieval-relevance and
 * memory-bank build phases.
 *
 *   BENCH_LLM_BACKEND=api         (default) Anthropic/OpenAI via ai-sdk — historical behaviour
 *   BENCH_LLM_BACKEND=claude-cli  shell out to `claude -p` (uses the local Claude subscription)
 *
 * The engine's own extraction/embedding calls (plugin/) are NOT routed through
 * here — they keep using the engine config.
 */

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { Config } from "../utils/config.js";
import { log } from "../utils/logger.js";

export type LlmBackend = "api" | "claude-cli";

export interface LlmRequest {
  model: string;
  prompt: string;
  system?: string;
  /** Honoured by the api backend. The claude CLI errors (instead of truncating)
   *  when a cap is hit, so the cli backend only applies it when `hardCap` is set. */
  maxOutputTokens: number;
  /** Apply maxOutputTokens as a hard CLAUDE_CODE_MAX_OUTPUT_TOKENS cap on the cli backend. */
  hardCap?: boolean;
  /** Per-call timeout for the cli backend (ms). */
  timeoutMs?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
}

export interface LlmResponse {
  text: string;
  durationMs: number;
  usage?: LlmUsage;
  attempts: number;
}

/** Default cwd for the claude CLI child — outside the repo so its .claude hooks never fire. */
const DEFAULT_CLI_CWD = join(tmpdir(), "codexfi-bench-cwd");

export function cliCwd(): string {
  return process.env.BENCH_CLI_CWD ?? DEFAULT_CLI_CWD;
}

export function resolveBackend(): LlmBackend {
  const v = (process.env.BENCH_LLM_BACKEND ?? "api").trim();
  if (v === "api" || v === "claude-cli") return v;
  throw new Error(`Invalid BENCH_LLM_BACKEND="${v}" — expected "api" or "claude-cli"`);
}

export async function complete(req: LlmRequest, config: Config): Promise<LlmResponse> {
  return config.llmBackend === "claude-cli" ? completeCli(req) : completeApi(req, config);
}

// ── api backend (ai-sdk) ──────────────────────────────────────────────────────

function createModel(model: string, config: Config) {
  if (config.anthropicApiKey && model.includes("claude")) {
    return createAnthropic({ apiKey: config.anthropicApiKey })(model);
  }
  if (config.openaiApiKey) {
    return createOpenAI({ apiKey: config.openaiApiKey })(model);
  }
  throw new Error(`No valid API provider configured for model ${model} (BENCH_LLM_BACKEND=api)`);
}

async function completeApi(req: LlmRequest, config: Config): Promise<LlmResponse> {
  const start = Date.now();
  const { text, usage } = await generateText({
    model: createModel(req.model, config),
    ...(req.system ? { system: req.system } : {}),
    prompt: req.prompt,
    maxOutputTokens: req.maxOutputTokens,
    temperature: 0,
  });
  return {
    text,
    durationMs: Date.now() - start,
    usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
    attempts: 1,
  };
}

// ── claude-cli backend ────────────────────────────────────────────────────────

const RETRYABLE_RE = /rate.?limit|429|529|overloaded|usage limit|too many requests|timed? ?out|ECONNRESET|socket|network|503|502|500 internal/i;

interface CliJson {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

class CliError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); }
}

async function completeCli(req: LlmRequest): Promise<LlmResponse> {
  const maxAttempts = parseInt(process.env.BENCH_CLI_MAX_RETRIES ?? "5", 10);
  const start = Date.now();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = await runCliOnce(req);
      return { ...out, durationMs: Date.now() - start, attempts: attempt };
    } catch (err) {
      lastErr = err;
      const retryable = !(err instanceof CliError) || err.retryable;
      if (!retryable || attempt === maxAttempts) break;
      const delay = Math.min(120_000, 5_000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 2_000);
      log.warn(`claude-cli attempt ${attempt}/${maxAttempts} failed (${shortMsg(err)}) — retrying in ${Math.round(delay / 1000)}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`claude-cli failed: ${shortMsg(lastErr)}`);
}

function shortMsg(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > 300 ? m.slice(0, 300) + "…" : m;
}

async function runCliOnce(req: LlmRequest): Promise<{ text: string; usage?: LlmUsage }> {
  const cwd = cliCwd();
  mkdirSync(cwd, { recursive: true });

  // System prompt goes through a file: contexts can exceed the argv size limit.
  const sysFile = join(cwd, `.sys-${process.pid}-${randomBytes(6).toString("hex")}.txt`);
  writeFileSync(sysFile, req.system ?? "You are a helpful assistant.");

  const args = [
    "claude", "-p",
    "--safe-mode",
    "--model", req.model,
    "--output-format", "json",
    "--system-prompt-file", sysFile,
    "--tools", "",
    "--no-session-persistence",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
  ];

  // Never let the bench's API key leak into the child: the CLI would bill the
  // API account instead of using the subscription.
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  env.CODEXFI_DISABLE = "1";
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  env.MAX_THINKING_TOKENS = "0"; // match the api backend (no extended thinking)
  if (req.hardCap) env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(req.maxOutputTokens);
  else delete env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;

  const timeoutMs = req.timeoutMs ?? parseInt(process.env.BENCH_CLI_TIMEOUT_MS ?? "300000", 10);

  try {
    const proc = Bun.spawn(args, {
      cwd,
      env,
      stdin: new TextEncoder().encode(req.prompt),
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);

    let parsed: CliJson | undefined;
    try { parsed = JSON.parse(stdout.trim()) as CliJson; } catch { /* handled below */ }

    if (proc.signalCode) {
      throw new CliError(`timed out after ${timeoutMs}ms (signal ${proc.signalCode})`, true);
    }
    if (code !== 0 || !parsed || parsed.is_error || typeof parsed.result !== "string") {
      const detail = (parsed?.result ?? stderr ?? stdout ?? "").toString().trim() || `exit ${code}`;
      // Unknown failures are retried too, except clear configuration errors.
      const fatal = /unknown option|invalid model|not.*(found|available).*model|authenticat|login/i.test(detail)
        && !RETRYABLE_RE.test(detail);
      throw new CliError(`exit ${code}: ${detail}`, !fatal);
    }

    const u = parsed.usage ?? {};
    return {
      text: parsed.result,
      usage: {
        inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens,
        cacheCreationTokens: u.cache_creation_input_tokens,
        costUsd: parsed.total_cost_usd,
      },
    };
  } finally {
    try { unlinkSync(sysFile); } catch { /* ignore */ }
  }
}
