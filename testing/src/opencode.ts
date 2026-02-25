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
import type { Subprocess } from "bun";

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
 * Run a message against OpenCode using a persistent server per directory.
 *
 * Uses `opencode serve` instead of `opencode run` so the plugin process stays
 * alive long enough for async event handlers (auto-save extraction) to complete.
 * The server is started once per directory and reused for subsequent calls —
 * callers should call `shutdownServer(dir)` when done (or it's cleaned up on
 * process exit).
 *
 * Returns the same RunResult shape — callers don't need to change.
 */

/** How long to sleep after the LAST message in a scenario to let auto-save finish. */
export const AUTO_SAVE_WAIT_MS = 15_000;

// Per-directory server cache — avoids starting a new server per runOpencode call
const serverCache = new Map<string, ServerHandle>();

async function getOrCreateServer(dir: string): Promise<ServerHandle> {
  let handle = serverCache.get(dir);
  if (handle) return handle;
  handle = await startServer(dir, { timeoutMs: 30_000 });
  serverCache.set(dir, handle);
  return handle;
}

/** Shut down the cached server for a directory. Call after the scenario finishes. */
export async function shutdownServer(dir: string): Promise<void> {
  const handle = serverCache.get(dir);
  if (handle) {
    await stopServer(handle);
    serverCache.delete(dir);
  }
}

export async function runOpencode(
  message: string,
  dir: string,
  opts: RunOptions = {}
): Promise<RunResult> {
  const {
    model = DEFAULT_MODEL,
    agent = "build",
    sessionID: existingSessionID,
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

  const start = Date.now();

  try {
    const server = await getOrCreateServer(dir);

    const sessionID = existingSessionID ?? await createSession(server, message.slice(0, 60));

    const result = await sendServerMessage(server, sessionID, message, {
      model,
      agent,
      timeoutMs,
    });

    return {
      sessionID: result.sessionID,
      text: result.text,
      events: [],    // server mode doesn't produce JSON events
      exitCode: 0,
      stderr: "",
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      sessionID: null,
      text: "",
      events: [],
      exitCode: 1,
      stderr: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ── Persistent server mode ────────────────────────────────────────────────────
// Uses `opencode serve` to keep the plugin process alive across multiple
// messages.  This allows testing turns 2+ within the same session (the
// sessionCaches Map persists between requests).

export interface ServerHandle {
  url: string;
  port: number;
  proc: Subprocess;
  dir: string;
}

/**
 * Start `opencode serve` as a background process.
 * Waits for the health endpoint to respond before returning.
 */
export async function startServer(
  dir: string,
  opts: { port?: number; timeoutMs?: number } = {}
): Promise<ServerHandle> {
  const port = opts.port ?? 10_000 + Math.floor(Math.random() * 50_000);
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const proc = Bun.spawn(
    [OPENCODE_BIN, "serve", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      env: { ...cleanEnv(), OPENCODE_DISABLE_AUTOUPDATE: "true" },
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;

  // Poll health endpoint until server is ready
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/global/health`);
      if (res.ok) {
        return { url, port, proc, dir };
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(500);
  }

  proc.kill();
  throw new Error(`opencode serve failed to start within ${timeoutMs}ms on port ${port}`);
}

/** Stop a running server */
export async function stopServer(handle: ServerHandle): Promise<void> {
  try {
    handle.proc.kill();
    await handle.proc.exited;
  } catch {
    // already dead
  }
}

export interface ServerMessageResult {
  sessionID: string;
  text: string;
  durationMs: number;
}

/**
 * Create a new session on a running server.
 * Returns the session ID.
 */
export async function createSession(
  server: ServerHandle,
  title?: string
): Promise<string> {
  const body: Record<string, unknown> = {};
  if (title) body.title = title;

  const res = await fetch(`${server.url}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`createSession ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Send a message to an existing session on a running server.
 * Uses POST /session/:id/message which waits for the full response.
 */
export async function sendServerMessage(
  server: ServerHandle,
  sessionID: string,
  message: string,
  opts: { model?: string; agent?: string; timeoutMs?: number } = {}
): Promise<ServerMessageResult> {
  const { model = DEFAULT_MODEL, agent = "build", timeoutMs = 120_000 } = opts;

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // model is "provider/modelName" — split into object form for the API
    const [providerID, ...modelParts] = model.split("/");
    const modelID = modelParts.join("/");

    const res = await fetch(`${server.url}/session/${sessionID}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: message }],
        model: { providerID, modelID },
        agent,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error(`sendServerMessage ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      info: { id: string; sessionID: string };
      parts: Array<{ type: string; text?: string }>;
    };

    const text = data.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("");

    return {
      sessionID,
      text,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/** Delete a session on the server */
export async function deleteSession(
  server: ServerHandle,
  sessionID: string
): Promise<void> {
  await fetch(`${server.url}/session/${sessionID}`, { method: "DELETE" }).catch(() => {});
}
