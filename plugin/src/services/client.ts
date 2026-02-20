import { CONFIG, MEMORY_BASE_URL } from "../config.js";
import { log } from "./logger.js";
import type {
  ConversationIngestResponse,
  ConversationMessage,
  MemoryType,
} from "../types/index.js";

const TIMEOUT_MS = 30000;
const MAX_CONVERSATION_CHARS = 100_000;

// ── Server response types ─────────────────────────────────────────────────────

interface MemoryRecord {
  id: string;
  memory: string;
  chunk?: string;
  score?: number;
  hash?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

interface MemoryAddResult {
  id: string;
  memory: string;
  event: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function memoryFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${MEMORY_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Memory API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ── Client ────────────────────────────────────────────────────────────────────

export class MemoryClient {
  private formatConversationMessage(message: ConversationMessage): string {
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content
            .map((part) =>
              part.type === "text"
                ? part.text
                : `[image] ${part.imageUrl.url}`
            )
            .join("\n");

    const trimmed = content.trim();
    if (trimmed.length === 0) return `[${message.role}]`;
    return `[${message.role}] ${trimmed}`;
  }

  private formatConversationTranscript(messages: ConversationMessage[]): string {
    return messages
      .map((msg, idx) => `${idx + 1}. ${this.formatConversationMessage(msg)}`)
      .join("\n");
  }

  // Search memories — containerTag maps to user_id in the server
  async searchMemories(query: string, containerTag: string) {
    log("searchMemories: start", { containerTag });
    try {
      const data = await withTimeout(
        memoryFetch("/memories/search", {
          method: "POST",
          body: JSON.stringify({
            query,
            user_id: containerTag,
            limit: CONFIG.maxMemories,
            threshold: CONFIG.similarityThreshold,
          }),
        }),
        TIMEOUT_MS
      ) as { results?: MemoryRecord[] };

      const results = (data.results ?? []).map((m) => ({
        id: m.id,
        memory: m.memory,
        chunk: m.chunk ?? "",
        similarity: m.score ?? 1,
        metadata: m.metadata,
      }));

      log("searchMemories: success", { count: results.length });
      return { success: true as const, results };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("searchMemories: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, results: [] };
    }
  }

  // Profile: list all memories for a user and surface them as profile facts.
  async getProfile(containerTag: string, _query?: string) {
    log("getProfile: start", { containerTag });
    try {
      const data = await withTimeout(
        memoryFetch(`/memories?user_id=${encodeURIComponent(containerTag)}&limit=${CONFIG.maxProfileItems}`),
        TIMEOUT_MS
      ) as { results?: MemoryRecord[] };

      const facts = (data.results ?? []).map((m) => m.memory).filter(Boolean);
      log("getProfile: success", { count: facts.length });

      return {
        success: true as const,
        profile: {
          static: facts,
          dynamic: [] as string[],
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("getProfile: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, profile: null };
    }
  }

  // Add a memory — content is plain text, wrapped as a user message for extraction
  async addMemory(
    content: string,
    containerTag: string,
    metadata?: { type?: MemoryType; tool?: string; [key: string]: unknown }
  ) {
    log("addMemory: start", { containerTag, contentLength: content.length });
    try {
      const data = await withTimeout(
        memoryFetch("/memories", {
          method: "POST",
          body: JSON.stringify({
            messages: [{ role: "user", content }],
            user_id: containerTag,
            metadata: metadata ?? {},
          }),
        }),
        TIMEOUT_MS
      ) as { results?: MemoryAddResult[] };

      const first = (data.results ?? []).find(
        (r) => r.event === "ADD" || r.event === "UPDATE"
      ) ?? data.results?.[0];

      const id = first?.id ?? `mem-${Date.now()}`;
      log("addMemory: success", { id });
      return { success: true as const, id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("addMemory: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, id: "" };
    }
  }

  // Delete a single memory by ID
  async deleteMemory(memoryId: string) {
    log("deleteMemory: start", { memoryId });
    try {
      await withTimeout(
        memoryFetch(`/memories/${encodeURIComponent(memoryId)}`, {
          method: "DELETE",
        }),
        TIMEOUT_MS
      );
      log("deleteMemory: success", { memoryId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("deleteMemory: error", { memoryId, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  // List recent memories for a container tag
  async listMemories(containerTag: string, limit = 20) {
    log("listMemories: start", { containerTag, limit });
    try {
      const data = await withTimeout(
        memoryFetch(
          `/memories?user_id=${encodeURIComponent(containerTag)}&limit=${limit}`
        ),
        TIMEOUT_MS
      ) as { results?: MemoryRecord[] };

      const memories = (data.results ?? []).map((m) => ({
        id: m.id,
        summary: m.memory,
        createdAt: m.created_at ?? new Date().toISOString(),
        metadata: m.metadata,
      }));

      log("listMemories: success", { count: memories.length });
      return { success: true as const, memories };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("listMemories: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, memories: [] };
    }
  }

  // Ingest a full conversation (used by compaction hook)
  async ingestConversation(
    conversationId: string,
    messages: ConversationMessage[],
    containerTags: string[],
    metadata?: Record<string, string | number | boolean>
  ) {
    log("ingestConversation: start", {
      conversationId,
      messageCount: messages.length,
      containerTags,
    });

    if (messages.length === 0) {
      return { success: false as const, error: "No messages to ingest" };
    }

    const uniqueTags = [...new Set(containerTags)].filter((t) => t.length > 0);
    if (uniqueTags.length === 0) {
      return { success: false as const, error: "At least one containerTag is required" };
    }

    // Format as a transcript and truncate if needed
    const transcript = this.formatConversationTranscript(messages);
    const rawContent = `[Conversation ${conversationId}]\n${transcript}`;
    const content =
      rawContent.length > MAX_CONVERSATION_CHARS
        ? `${rawContent.slice(0, MAX_CONVERSATION_CHARS)}\n...[truncated]`
        : rawContent;

    const ingestMetadata: { type: MemoryType; conversationId: string; messageCount: number; [key: string]: unknown } = {
      type: "conversation" as const,
      conversationId,
      messageCount: messages.length,
      ...metadata,
    };

    const savedIds: string[] = [];
    let firstError: string | null = null;

    for (const tag of uniqueTags) {
      const result = await this.addMemory(content, tag, ingestMetadata);
      if (result.success && result.id) {
        savedIds.push(result.id);
      } else if (!firstError) {
        firstError = result.error || "Failed to store conversation";
      }
    }

    if (savedIds.length === 0) {
      log("ingestConversation: error", { conversationId, error: firstError });
      return {
        success: false as const,
        error: firstError || "Failed to ingest conversation",
      };
    }

    const status = savedIds.length === uniqueTags.length ? "stored" : "partial";
    const response: ConversationIngestResponse = {
      id: savedIds[0]!,
      conversationId,
      status,
    };

    log("ingestConversation: success", {
      conversationId,
      status,
      storedCount: savedIds.length,
      requestedCount: uniqueTags.length,
    });

    return {
      success: true as const,
      ...response,
      storedMemoryIds: savedIds,
    };
  }

  // Send a messages array directly to the server for extraction — used by auto-save
  async addMemoryFromMessages(
    messages: Array<{ role: string; content: string }>,
    containerTag: string,
    metadata?: Record<string, unknown>
  ) {
    log("addMemoryFromMessages: start", { containerTag, messageCount: messages.length });
    try {
      const data = await withTimeout(
        memoryFetch("/memories", {
          method: "POST",
          body: JSON.stringify({
            messages,
            user_id: containerTag,
            metadata: metadata ?? {},
          }),
        }),
        TIMEOUT_MS
      ) as { results?: MemoryAddResult[] };

      const count = (data.results ?? []).length;
      log("addMemoryFromMessages: success", { count });
      return { success: true as const, count };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("addMemoryFromMessages: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, count: 0 };
    }
  }

  // Send raw project file content for silent background init extraction
  async addMemoryFromProjectFiles(fileContent: string, containerTag: string) {
    log("addMemoryFromProjectFiles: start", { containerTag, contentLength: fileContent.length });
    try {
      const data = await withTimeout(
        memoryFetch("/memories", {
          method: "POST",
          body: JSON.stringify({
            messages: [{ role: "user", content: fileContent }],
            user_id: containerTag,
            metadata: {},
            init_mode: true,
          }),
        }),
        TIMEOUT_MS
      ) as { results?: MemoryAddResult[] };

      const count = (data.results ?? []).length;
      log("addMemoryFromProjectFiles: success", { count });
      return { success: true as const, count };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("addMemoryFromProjectFiles: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, count: 0 };
    }
  }

  // Register human-readable display names for project and user scopes.
  // Called once on plugin init so the web UI can show folder names instead of hashes.
  async registerNames(projectTag: string, projectName: string, userTag: string, userName: string) {
    log("registerNames: start", { projectTag, projectName, userTag, userName });
    try {
      await Promise.all([
        withTimeout(
          memoryFetch("/names", {
            method: "POST",
            body: JSON.stringify({ user_id: projectTag, name: projectName }),
          }),
          TIMEOUT_MS
        ),
        withTimeout(
          memoryFetch("/names", {
            method: "POST",
            body: JSON.stringify({ user_id: userTag, name: userName }),
          }),
          TIMEOUT_MS
        ),
      ]);
      log("registerNames: success");
    } catch (error) {
      // Non-fatal — UI just shows the hash if this fails
      log("registerNames: error (non-fatal)", { error: String(error) });
    }
  }

  // Send messages to the server in summary mode — produces a single session-summary memory
  async addMemoryFromMessagesAsSummary(
    messages: Array<{ role: string; content: string }>,
    containerTag: string
  ) {
    log("addMemoryFromMessagesAsSummary: start", { containerTag, messageCount: messages.length });
    try {
      const data = await withTimeout(
        memoryFetch("/memories", {
          method: "POST",
          body: JSON.stringify({
            messages,
            user_id: containerTag,
            metadata: { type: "session-summary" },
            summary_mode: true,
          }),
        }),
        TIMEOUT_MS
      ) as { results?: MemoryAddResult[] };

      const count = (data.results ?? []).length;
      log("addMemoryFromMessagesAsSummary: success", { count });
      return { success: true as const, count };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("addMemoryFromMessagesAsSummary: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, count: 0 };
    }
  }
}

export const memoryClient = new MemoryClient();
