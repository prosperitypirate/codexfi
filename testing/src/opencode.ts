/**
 * opencode.ts — wrapper around `opencode run` for automated testing
 *
 * Key discovery: when the OpenCode desktop app is running, it sets
 * OPENCODE_SERVER_PASSWORD / OPENCODE_SERVER_USERNAME / OPENCODE_CLIENT
 * in the environment. The CLI inherits these and its internal in-process server
 * requires Basic Auth — but run-mode sends no auth headers (PR #13221, not yet
 * released in v1.2.10). Fix: unset those three env vars before spawning.
 */

import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const OPENCODE_BIN = "opencode"; // installed via `bun install -g opencode-ai`
const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

/** Sanitised env: strips desktop-app vars that break internal auth in run mode */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env["OPENCODE_SERVER_PASSWORD"];
  delete env["OPENCODE_SERVER_USERNAME"];
  delete env["OPENCODE_CLIENT"];
  delete env["__CFBundleIdentifier"];
  // Keep XDG_STATE_HOME — it's set by desktop but doesn't affect the CLI DB path
  return env;
}

export interface RunEvent {
  type: "step_start" | "step_finish" | "text" | "tool_use" | "error" | "reasoning";
  timestamp: number;
  sessionID: string;
  part?: {
    type: string;
    text?: string;
    tool?: string;
    state?: { input?: unknown; output?: string; status?: string; error?: string };
    reason?: string;
    cost?: number;
    tokens?: { total: number; input: number; output: number };
  };
  error?: unknown;
}

export interface RunResult {
  sessionID: string | null;
  text: string;         // concatenated agent text response
  events: RunEvent[];
  exitCode: number;
  stderr: string;
  durationMs: number;
}

export interface RunOptions {
  model?: string;
  variant?: string;
  agent?: string;
  /** Continue an existing session by ID */
  sessionID?: string;
  /** Write a README.md to the test dir before running (simulates existing project) */
  readme?: string;
  /** Additional files to write: { filename: content } */
  files?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Create an isolated temp directory for a test scenario.
 * Returns the absolute path.
 */
export function createTestDir(scenarioName: string): string {
  const dir = `/private/tmp/oc-test-${scenarioName}-${randomUUID().slice(0, 8)}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create N isolated temp directories for a multi-project scenario.
 * Each directory gets a unique path (and thus a unique project memory namespace).
 * Used by cross-synthesis tests that need facts from separate projects.
 */
export function createTestDirs(scenarioName: string, count: number): string[] {
  const uid = randomUUID().slice(0, 8);
  return Array.from({ length: count }, (_, i) => {
    const dir = `/private/tmp/oc-test-${scenarioName}-${uid}-p${i + 1}`;
    mkdirSync(dir, { recursive: true });
    return dir;
  });
}

/**
 * Run `opencode run <message>` in a given directory.
 * Returns structured output including all JSON events and the final text response.
 */
export async function runOpencode(
  message: string,
  dir: string,
  opts: RunOptions = {}
): Promise<RunResult> {
  const {
    model = DEFAULT_MODEL,
    variant,
    agent = "build",
    sessionID,
    readme,
    files,
    timeoutMs = 120_000,
  } = opts;

  // Write any requested files before running
  if (readme) writeFileSync(join(dir, "README.md"), readme, "utf-8");
  if (files) {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content, "utf-8");
    }
  }

  const args = [
    OPENCODE_BIN,
    "run",
    message,
    "--dir", dir,
    "-m", model,
    "--agent", agent,
    "--format", "json",
  ];

  if (variant) args.push("--variant", variant);
  if (sessionID) args.push("--session", sessionID);

  const start = Date.now();
  const proc = Bun.spawn(args, {
    env: cleanEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });

  // Race the process against a timeout
  const timeoutHandle = setTimeout(() => {
    proc.kill();
  }, timeoutMs);

  const [stdoutBuf, stderrBuf] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  await proc.exited;
  clearTimeout(timeoutHandle);

  const durationMs = Date.now() - start;
  const exitCode = proc.exitCode ?? -1;

  // Parse JSON event lines
  const events: RunEvent[] = [];
  for (const line of stdoutBuf.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as RunEvent);
    } catch {
      // ignore non-JSON lines (can appear in default format mode)
    }
  }

  // Concatenate all text parts
  const text = events
    .filter((e) => e.type === "text" && e.part?.text)
    .map((e) => e.part!.text!)
    .join("");

  const detectedSessionID =
    events.length > 0 ? events[0].sessionID : null;

  return {
    sessionID: detectedSessionID,
    text,
    events,
    exitCode,
    stderr: stderrBuf,
    durationMs,
  };
}
