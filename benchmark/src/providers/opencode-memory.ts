/**
 * Provider adapter for the opencode-memory self-hosted backend.
 *
 * API surface used:
 *   POST   /memories              – ingest conversation messages (LLM extracts facts)
 *   POST   /memories/search       – semantic search
 *   GET    /memories?user_id=&limit= – list all for cleanup
 *   DELETE /memories/{id}         – delete single memory
 */

import type {
  Provider,
  UnifiedSession,
  IngestResult,
  IngestProgressCallback,
  SearchResult,
} from "../types.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";

export class OpencodeMemoryProvider implements Provider {
  readonly name = "opencode-memory";
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async initialize(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/health`).catch(() => null);
    if (!res?.ok) {
      throw new Error(
        `Backend not reachable at ${this.baseUrl}. Is the memory server running?`
      );
    }
    log.success(`Backend reachable at ${this.baseUrl}`);
  }

  /**
   * Ingest all sessions into the backend.
   * Each session is sent as a list of messages — the backend LLM extractor
   * extracts typed memories automatically (exactly how the plugin works in prod).
   */
  async ingest(sessions: UnifiedSession[], runTag: string, onProgress?: IngestProgressCallback): Promise<IngestResult> {
    let memoriesAdded = 0;
    let memoriesUpdated = 0;
    const sessionIds: string[] = [];
    let done = 0;

    for (const session of sessions) {
      log.dim(`  Ingesting ${session.sessionId} (${session.messages.length} messages)`);

      const body = {
        messages: session.messages,
        user_id: runTag,
        metadata: { session_id: session.sessionId, ...session.metadata },
      };

      const res = await fetch(`${this.baseUrl}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ingest failed for ${session.sessionId}: ${res.status} ${text}`);
      }

      const data = (await res.json()) as { results: Array<{ event: string }> };
      let sessionAdded = 0, sessionUpdated = 0;
      for (const r of data.results) {
        if (r.event === "ADD") { memoriesAdded++; sessionAdded++; }
        else if (r.event === "UPDATE") { memoriesUpdated++; sessionUpdated++; }
      }
      sessionIds.push(session.sessionId);
      done++;
      onProgress?.(session.sessionId, sessionAdded, sessionUpdated, done);

      // Small delay to avoid hammering the LLM extractor
      await sleep(500);
    }

    return { memoriesAdded, memoriesUpdated, sessionIds };
  }

  /**
   * Semantic search using the backend's vector search.
   *
   * recency_weight is applied per question type:
   *   session-continuity → 0.5  (temporal queries need recency boost)
   *   all others         → 0.0  (pure semantic; superseding already handles knowledge-update)
   */
  async search(query: string, runTag: string, limit = 8, questionType?: string): Promise<SearchResult[]> {
    const RECENCY_WEIGHTS: Record<string, number> = {
      "session-continuity": 0.5,
    };
    const recency_weight = RECENCY_WEIGHTS[questionType ?? ""] ?? 0.0;

    const res = await fetch(`${this.baseUrl}/memories/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, user_id: runTag, limit, threshold: 0.2, recency_weight }),
    });

    if (!res.ok) {
      throw new Error(`Search failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        memory: string;
        chunk?: string;
        score: number;
        metadata?: Record<string, unknown>;
        date?: string;
      }>;
    };

    return (data.results ?? []).map((r) => ({
      id: r.id,
      memory: r.memory,
      chunk: r.chunk ?? "",
      score: r.score,
      metadata: r.metadata,
      date: r.date ?? (r.metadata?.date as string | undefined),
    }));
  }

  /**
   * Delete all memories for a run tag (cleanup after benchmark).
   */
  async clear(runTag: string): Promise<void> {
    // include_superseded=true ensures memories retired by relational versioning
    // during the run are also returned and deleted — otherwise they are orphaned.
    const res = await fetch(
      `${this.baseUrl}/memories?user_id=${encodeURIComponent(runTag)}&limit=1000&include_superseded=true`
    );

    if (!res.ok) {
      log.warn(`Could not list memories for cleanup: ${res.status}`);
      return;
    }

    const data = (await res.json()) as { results: Array<{ id: string }> };
    const ids = data.results.map((r) => r.id);

    if (ids.length === 0) {
      log.dim("  Nothing to clean up");
      return;
    }

    log.dim(`  Deleting ${ids.length} memories...`);
    let deleted = 0;
    for (const id of ids) {
      const del = await fetch(`${this.baseUrl}/memories/${id}`, { method: "DELETE" });
      if (del.ok) {
        deleted++;
        // Emit at 25%, 50%, 75%, and 100% to avoid flooding the feed
        const pct = deleted / ids.length;
        if (pct === 1 || deleted === 1 || Math.floor((deleted - 1) / ids.length * 4) < Math.floor(pct * 4)) {
          emit({ type: "cleanup_progress", deleted, total: ids.length });
        }
      }
    }
    log.success(`Cleaned up ${deleted}/${ids.length} memories for run tag ${runTag}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
