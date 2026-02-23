/**
 * memory-api.ts — typed client for the opencode-memory backend (localhost:8020)
 *
 * Mirrors the calls made by the plugin's memoryClient for verification in tests.
 */

import { createHash } from "crypto";
import { execSync } from "child_process";

const BACKEND = process.env["MEMORY_BACKEND_URL"] ?? "http://localhost:8020";
const PREFIX  = "opencode";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/** Compute the user tag the plugin would use (mirrors plugin/src/services/tags.ts) */
function getUserTag(): string {
  try {
    const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
    if (email) return `${PREFIX}_user_${sha256(email)}`;
  } catch {}
  const fallback = process.env["USER"] ?? process.env["USERNAME"] ?? "anonymous";
  return `${PREFIX}_user_${sha256(fallback)}`;
}

const USER_TAG = getUserTag();

export type MemoryType =
  | "project-brief"
  | "architecture"
  | "tech-context"
  | "product-context"
  | "progress"
  | "project-config"
  | "error-solution"
  | "preference"
  | "learned-pattern"
  | "session-summary"
  | "conversation";

export interface Memory {
  id: string;
  memory: string;
  user_id: string;
  metadata: { type?: MemoryType };
  created_at: string;
  updated_at: string;
  /** Set by relational versioning when a newer memory supersedes this one */
  superseded_by?: string | null;
}

/** Compute the project tag for a given directory path (matches plugin's getTags logic) */
export function projectTagForDir(dir: string): string {
  const hash = createHash("sha256").update(dir).digest("hex").slice(0, 16);
  return `opencode_project_${hash}`;
}

/** Fetch all memories for a project directory */
export async function getMemoriesForDir(dir: string): Promise<Memory[]> {
  const projectTag = projectTagForDir(dir);
  return getMemoriesForTag(projectTag);
}

/** Fetch all memories for a project tag */
export async function getMemoriesForTag(projectTag: string): Promise<Memory[]> {
  // The plugin stores project memories with user_id = projectTag (not the user tag).
  // The server uses user_id as the container key for filtering.
  const url = `${BACKEND}/memories?user_id=${encodeURIComponent(projectTag)}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Memory API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { results: Memory[] };
  return data.results ?? [];
}

/** Count memories of a specific type for a directory */
export async function countByType(dir: string, type: MemoryType): Promise<number> {
  const memories = await getMemoriesForDir(dir);
  return memories.filter((m) => m.metadata?.type === type).length;
}

/** Wait until the backend has at least `minCount` memories for a directory */
export async function waitForMemories(
  dir: string,
  minCount: number,
  timeoutMs = 30_000
): Promise<Memory[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const memories = await getMemoriesForDir(dir);
    if (memories.length >= minCount) return memories;
    await Bun.sleep(1000);
  }
  return getMemoriesForDir(dir);
}

/**
 * Directly add a memory to the backend, bypassing the plugin/agent.
 * Used for deterministic test seeding — the backend extracts facts from
 * the messages array via LLM, embeds them, and stores them.
 */
export async function addMemoryDirect(
  dir: string,
  content: string,
  type?: MemoryType
): Promise<{ id: string; memory: string; event: string }[]> {
  const projectTag = projectTagForDir(dir);
  const body: Record<string, unknown> = {
    messages: [{ role: "user", content }],
    user_id: projectTag,
  };
  if (type) body.metadata = { type };

  const res = await fetch(`${BACKEND}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`addMemoryDirect ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    results: { id: string; memory: string; event: string }[];
  };
  return data.results ?? [];
}

/** Directly search memories via the backend semantic search endpoint */
export async function searchMemories(
  dir: string,
  query: string,
  limit = 10,
  threshold = 0.3
): Promise<{ id: string; memory: string; score: number; metadata: Record<string, unknown> }[]> {
  const projectTag = projectTagForDir(dir);
  const res = await fetch(`${BACKEND}/memories/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      user_id: projectTag,
      limit,
      threshold,
    }),
  });
  if (!res.ok) throw new Error(`searchMemories ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    results: { id: string; memory: string; score: number; metadata: Record<string, unknown> }[];
  };
  return data.results ?? [];
}

/** Health check */
export async function isBackendReady(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND}/health`);
    const data = (await res.json()) as { ready?: boolean };
    return data.ready === true;
  } catch {
    return false;
  }
}

/**
 * Delete all memories for a test directory from the backend.
 * Called after each scenario to keep the memory store clean.
 * Returns the number of memories deleted.
 */
export async function cleanupTestDir(dir: string): Promise<number> {
  const projectTag = projectTagForDir(dir);
  return cleanupTag(projectTag);
}

/** Delete all memories for multiple test directories */
export async function cleanupTestDirs(dirs: string[]): Promise<number> {
  let total = 0;
  for (const dir of dirs) {
    total += await cleanupTestDir(dir);
  }
  return total;
}

/** Delete all memories for a given project tag */
async function cleanupTag(projectTag: string): Promise<number> {
  try {
    const url = `${BACKEND}/memories?user_id=${encodeURIComponent(projectTag)}&limit=200&include_superseded=true`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = (await res.json()) as { results: Memory[] };
    const memories = data.results ?? [];

    let deleted = 0;
    for (const m of memories) {
      try {
        const delRes = await fetch(
          `${BACKEND}/memories/${m.id}?user_id=${encodeURIComponent(projectTag)}`,
          { method: "DELETE" }
        );
        if (delRes.ok) deleted++;
      } catch {
        // best-effort cleanup — ignore individual failures
      }
    }
    return deleted;
  } catch {
    return 0;
  }
}
