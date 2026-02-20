import type { Memory, Project, Stats, SearchResult, Costs } from "./types";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8020";

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${BACKEND}${path}`, { ...options, cache: "no-store" } as any);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getStats(): Promise<Stats> {
  return fetchJson<Stats>("/stats");
}

export async function getProjects(): Promise<Project[]> {
  const data = await fetchJson<{ projects: Project[] }>("/projects");
  return data.projects;
}

export async function getMemories(userId: string, limit = 100): Promise<Memory[]> {
  const data = await fetchJson<{ results: Memory[] }>(
    `/memories?user_id=${encodeURIComponent(userId)}&limit=${limit}`
  );
  return data.results;
}

export async function deleteMemory(id: string): Promise<void> {
  await fetchJson(`/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function searchMemories(
  query: string,
  userId: string,
  limit = 10
): Promise<SearchResult[]> {
  const data = await fetchJson<{ results: SearchResult[] }>("/memories/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, user_id: userId, limit }),
  });
  return data.results;
}

export async function getHealth(): Promise<{ status: string; ready: boolean }> {
  return fetchJson("/health");
}

export async function getCosts(): Promise<Costs> {
  return fetchJson<Costs>("/costs");
}
