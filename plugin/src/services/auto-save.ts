import type { Message, Part } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { memoryClient } from "./client.js";
import { log } from "./logger.js";
import { CONFIG } from "../config.js";

const MIN_EXCHANGE_CHARS = 100;
const MAX_MESSAGES = 8;
const COOLDOWN_MS = 15_000;

export interface CachedMessage {
  info: Message;
  parts: Part[];
}

// Module-level cache updated by experimental.chat.messages.transform before every LLM call.
// Shared across all plugin instances (module scope = singleton).
// NOTE: this cache only includes messages UP TO (not including) the latest LLM response,
// because the transform fires BEFORE the LLM call. The final assistant response is captured
// separately via message.part.updated events (see updateAssistantTextBuffer below) and
// injected into the cache right before auto-save runs.
let cachedMessages: CachedMessage[] = [];

export function updateMessageCache(messages: CachedMessage[]): void {
  cachedMessages = messages;
  log("auto-save: message cache updated", { count: messages.length });
}

// Buffer holding the latest accumulated text for in-flight assistant messages.
// Key: "sessionID:messageID" → latest full text of the text part.
// Updated by message.part.updated events; consumed (and cleared) when message.updated
// fires with finish=stop, right before onSessionIdle is called.
const assistantTextBuffer = new Map<string, string>();

/**
 * Called for every message.part.updated event that carries a non-synthetic text part.
 * Overwrites with the latest accumulated text (part.text is the full text so far, not a delta).
 */
export function updateAssistantTextBuffer(sessionID: string, messageID: string, text: string): void {
  const key = `${sessionID}:${messageID}`;
  assistantTextBuffer.set(key, text);
  // Evict oldest entries if buffer grows too large (shouldn't happen in practice)
  if (assistantTextBuffer.size > 200) {
    const oldest = assistantTextBuffer.keys().next().value;
    if (oldest) assistantTextBuffer.delete(oldest);
  }
}

/**
 * Retrieve and remove the buffered text for a specific assistant message.
 * Called just before onSessionIdle so the final response is available in the cache.
 */
export function popAssistantText(sessionID: string, messageID: string): string | undefined {
  const key = `${sessionID}:${messageID}`;
  const text = assistantTextBuffer.get(key);
  assistantTextBuffer.delete(key);
  return text;
}

/**
 * Inject the final assistant message into the cache using text captured from streaming events.
 * No-op if the message is already in the cache (idempotent).
 */
export function injectFinalAssistantMessage(message: CachedMessage): void {
  const last = cachedMessages[cachedMessages.length - 1];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (last && (last.info as any).id === (message.info as any).id) return; // Already present
  cachedMessages = [...cachedMessages, message];
  log("auto-save: injected final assistant message into cache", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    id: (message.info as any).id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    partTypes: message.parts.map((p: any) => p.type),
    newCacheSize: cachedMessages.length,
  });
}

const lastExtracted = new Map<string, number>();

// Track turn counts per session for periodic session summaries.
const turnCountPerSession = new Map<string, number>();

export function createAutoSaveHook(
  tags: { user: string; project: string },
  client?: PluginInput["client"]
) {
  return {
    async onSessionIdle(sessionID: string): Promise<void> {
      const now = Date.now();
      const last = lastExtracted.get(sessionID) ?? 0;

      if (now - last < COOLDOWN_MS) {
        log("auto-save: skipped (cooldown)", { sessionID, project: tags.project, msSinceLast: now - last });
        return;
      }

      lastExtracted.set(sessionID, now);
      if (lastExtracted.size > 500) {
        const oldest = lastExtracted.keys().next().value;
        if (oldest) lastExtracted.delete(oldest);
      }

      const snapshot = [...cachedMessages];
      log("auto-save: triggered", { sessionID, project: tags.project, snapshotSize: snapshot.length, hasClient: !!client });

      // Increment turn counter
      const prevCount = turnCountPerSession.get(sessionID) ?? 0;
      const newCount = prevCount + 1;
      turnCountPerSession.set(sessionID, newCount);
      if (turnCountPerSession.size > 500) {
        const oldest = turnCountPerSession.keys().next().value;
        if (oldest) turnCountPerSession.delete(oldest);
      }

      // Await fact extraction so it completes before the process exits
      // (critical for opencode run single-turn sessions that exit immediately after)
      const promises: Promise<void>[] = [
        extractAndSave(snapshot, tags, sessionID, client).catch(
          (err) => log("auto-save: unhandled error", { sessionID, project: tags.project, error: String(err) })
        ),
      ];

      // Every N turns, also generate a session-summary
      const interval = CONFIG.turnSummaryInterval ?? 5;
      if (newCount % interval === 0) {
        log("auto-save: generating session summary", { sessionID, project: tags.project, turn: newCount });
        promises.push(
          generateSessionSummary(snapshot, tags, sessionID, client).catch(
            (err) => log("auto-save: session summary error", { sessionID, project: tags.project, error: String(err) })
          )
        );
      }

      await Promise.all(promises);
    },
  };
}

/**
 * Attempt a single SDK fetch of session messages.
 * Used only as an opportunistic supplement — in TUI mode the plugin client is Unauthorized
 * for session.messages(), so the cache (already injected with the final assistant message
 * via updateAssistantTextBuffer + injectFinalAssistantMessage) is the primary source.
 * In opencode-run (E2E harness) mode the SDK does work and may return more messages than
 * the transform cache captured.
 */
async function fetchMessages(
  sessionID: string,
  snapshot: CachedMessage[],
  client?: PluginInput["client"]
): Promise<CachedMessage[]> {
  if (!client) return snapshot;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client.session as any).messages({ path: { id: sessionID } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (res as any).data as Array<{ info: Message; parts: Part[] }> | undefined;
    if (data && data.length > 0) {
      log("auto-save: fetched fresh messages from SDK", { sessionID, count: data.length });
      return data;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resError = (res as any)?.error;
    if (resError) {
      log("auto-save: SDK fetch failed (expected in TUI mode)", { sessionID, error: String(resError) });
    }
  } catch (err) {
    log("auto-save: SDK fetch threw", { sessionID, error: String(err) });
  }
  return snapshot;
}

async function extractAndSave(
  snapshot: CachedMessage[],
  tags: { user: string; project: string },
  sessionID: string,
  client?: PluginInput["client"]
): Promise<void> {
  try {
    const allMessages = await fetchMessages(sessionID, snapshot, client);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Filter to user/assistant messages that have real (non-synthetic) text content.
    // NOTE: We intentionally do NOT filter out messages where info.summary === true.
    // In opencode run (single-turn) mode, the first user message is marked summary:true
    // by OpenCode (it bundles context), but it still contains the real user text.
    // Excluding summary messages caused realCount to always be 1, breaking auto-save.
    const real = allMessages.filter((m: any) => {
      const role = m.info?.role as string;
      return (role === "user" || role === "assistant") &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        m.parts?.some((p: any) => p.type === "text" && !p.synthetic && p.text?.trim());
    });

    const recent = real.slice(-MAX_MESSAGES);

    log("auto-save: filtered", { sessionID, project: tags.project, realCount: real.length, recentCount: recent.length });

    if (recent.length < 2) {
      // Debug: log part types for each message so we can see why messages were excluded
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const partSummary = allMessages.slice(-6).map((m: any) => ({
        role: m.info?.role,
        summary: m.info?.summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partTypes: (m.parts ?? []).map((p: any) => `${p.type}${p.synthetic ? "(syn)" : ""}${p.type === "text" ? `[${(p.text ?? "").slice(0, 20).replace(/\n/g, "↵")}]` : ""}`),
      }));
      log("auto-save: skipped (realCount<2) — message part debug", { sessionID, project: tags.project, partSummary });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = recent.map((m: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (m.parts ?? []).filter((p: any) => p.type === "text" && !p.synthetic && p.text?.trim())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p.text as string)
        .join("\n").trim();
      return { role: m.info.role as string, content: text };
    }).filter((m: { role: string; content: string }) => m.content.length > 0);

    const totalChars = messages.reduce((sum: number, m: { content: string }) => sum + m.content.length, 0);

    if (totalChars < MIN_EXCHANGE_CHARS) {
      log("auto-save: skipped (too short)", { sessionID, project: tags.project, totalChars });
      return;
    }

    log("auto-save: extracting", { sessionID, project: tags.project, messages: messages.length, chars: totalChars });

    const result = await memoryClient.addMemoryFromMessages(messages, tags.project);

    log("auto-save: done", { sessionID, project: tags.project, success: result.success, count: result.count });
  } catch (err) {
    log("auto-save: failed", { sessionID, project: tags.project, error: String(err) });
  }
}

async function generateSessionSummary(
  snapshot: CachedMessage[],
  tags: { user: string; project: string },
  sessionID: string,
  client?: PluginInput["client"]
): Promise<void> {
  try {
    const allMessages = await fetchMessages(sessionID, snapshot, client);
    // Same filter as extractAndSave — do NOT exclude summary:true messages.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const real = allMessages.filter((m: any) => {
      const role = m.info?.role as string;
      return (role === "user" || role === "assistant") &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        m.parts?.some((p: any) => p.type === "text" && !p.synthetic && p.text?.trim());
    });

    // Use more messages for session summary — we want broader context
    const recent = real.slice(-20);

    if (recent.length < 4) {
      log("auto-save: session summary skipped (not enough messages)", { sessionID });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = recent.map((m: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (m.parts ?? []).filter((p: any) => p.type === "text" && !p.synthetic && p.text?.trim())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p.text as string)
        .join("\n").trim();
      return { role: m.info.role as string, content: text };
    }).filter((m: { role: string; content: string }) => m.content.length > 0);

    const totalChars = messages.reduce((sum: number, m: { content: string }) => sum + m.content.length, 0);
    if (totalChars < MIN_EXCHANGE_CHARS) return;

    log("auto-save: sending session summary request", { sessionID, messages: messages.length });

    const result = await memoryClient.addMemoryFromMessagesAsSummary(messages, tags.project);

    log("auto-save: session summary done", { sessionID, success: result.success, count: result.count });
  } catch (err) {
    log("auto-save: session summary failed", { sessionID, error: String(err) });
  }
}
