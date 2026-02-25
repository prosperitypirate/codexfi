/**
 * Auto-save service — buffers conversation messages and triggers extraction.
 *
 * Port from plugin/src/services/auto-save.ts:
 * - memoryClient.addMemoryFromMessages() → store.ingest()
 * - memoryClient.addMemoryFromMessagesAsSummary() → store.ingest() with mode: "summary"
 * - Privacy stripping applied before extraction (bug fix §12)
 */

import type { Message, Part } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import * as store from "../store.js";
import { log } from "./logger.js";
import { stripPrivateContent } from "./privacy.js";
import { PLUGIN_CONFIG } from "../plugin-config.js";
import { MIN_EXCHANGE_CHARS, MAX_MESSAGES, EXTRACTION_COOLDOWN_MS } from "../config.js";

export interface CachedMessage {
	info: Message;
	parts: Part[];
}

// Module-level cache updated by experimental.chat.messages.transform before every LLM call.
let cachedMessages: CachedMessage[] = [];

export function updateMessageCache(messages: CachedMessage[]): void {
	cachedMessages = messages;
	log("auto-save: message cache updated", { count: messages.length });
}

// Buffer holding the latest accumulated text for in-flight assistant messages.
// Key: "sessionID:messageID" → latest full text of the text part.
const assistantTextBuffer = new Map<string, string>();

export function updateAssistantTextBuffer(sessionID: string, messageID: string, text: string): void {
	const key = `${sessionID}:${messageID}`;
	assistantTextBuffer.set(key, text);
	// Hard cap: 200 entries, FIFO eviction
	if (assistantTextBuffer.size > 200) {
		const oldest = assistantTextBuffer.keys().next().value;
		if (oldest) assistantTextBuffer.delete(oldest);
	}
}

export function popAssistantText(sessionID: string, messageID: string): string | undefined {
	const key = `${sessionID}:${messageID}`;
	const text = assistantTextBuffer.get(key);
	assistantTextBuffer.delete(key);
	return text;
}

export function injectFinalAssistantMessage(message: CachedMessage): void {
	const last = cachedMessages[cachedMessages.length - 1];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (last && (last.info as any).id === (message.info as any).id) return;
	cachedMessages = [...cachedMessages, message];
	log("auto-save: injected final assistant message into cache", {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		id: (message.info as any).id,
		newCacheSize: cachedMessages.length,
	});
}

const lastExtracted = new Map<string, number>();
const turnCountPerSession = new Map<string, number>();

export function createAutoSaveHook(
	tags: { user: string; project: string },
	client?: PluginInput["client"]
) {
	return {
		async onSessionIdle(sessionID: string): Promise<void> {
			const now = Date.now();
			const last = lastExtracted.get(sessionID) ?? 0;

			if (now - last < EXTRACTION_COOLDOWN_MS) {
				log("auto-save: skipped (cooldown)", { sessionID, project: tags.project, msSinceLast: now - last });
				return;
			}

			lastExtracted.set(sessionID, now);
			if (lastExtracted.size > 500) {
				const oldest = lastExtracted.keys().next().value;
				if (oldest) lastExtracted.delete(oldest);
			}

			const snapshot = [...cachedMessages];
			log("auto-save: triggered", { sessionID, project: tags.project, snapshotSize: snapshot.length });

			// Increment turn counter
			const prevCount = turnCountPerSession.get(sessionID) ?? 0;
			const newCount = prevCount + 1;
			turnCountPerSession.set(sessionID, newCount);
			if (turnCountPerSession.size > 500) {
				const oldest = turnCountPerSession.keys().next().value;
				if (oldest) turnCountPerSession.delete(oldest);
			}

			const promises: Promise<void>[] = [
				extractAndSave(snapshot, tags, sessionID, client).catch(
					(err) => log("auto-save: unhandled error", { sessionID, project: tags.project, error: String(err) })
				),
			];

			// Every N turns, also generate a session-summary
			const interval = PLUGIN_CONFIG.turnSummaryInterval ?? 5;
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
 * SDK fetch fallback — tries SDK first, falls back to cache.
 * SDK is unreliable in TUI mode; cache + streaming buffer is the actual source.
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
		const real = allMessages.filter((m: any) => {
			const role = m.info?.role as string;
			return (role === "user" || role === "assistant") &&
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				m.parts?.some((p: any) => p.type === "text" && !p.synthetic && p.text?.trim());
		});

		const recent = real.slice(-MAX_MESSAGES);

		log("auto-save: filtered", { sessionID, project: tags.project, realCount: real.length, recentCount: recent.length });

		if (recent.length < 2) {
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

		// Privacy stripping — applied before extraction (bug fix §12)
		const sanitizedMessages = messages.map(m => ({
			...m,
			content: stripPrivateContent(m.content),
		}));

		log("auto-save: extracting", { sessionID, project: tags.project, messages: sanitizedMessages.length, chars: totalChars });

		// Direct store call — replaces memoryClient.addMemoryFromMessages()
		const results = await store.ingest(sanitizedMessages, tags.project);

		log("auto-save: done", { sessionID, project: tags.project, count: results.length });
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const real = allMessages.filter((m: any) => {
			const role = m.info?.role as string;
			return (role === "user" || role === "assistant") &&
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				m.parts?.some((p: any) => p.type === "text" && !p.synthetic && p.text?.trim());
		});

		// Use more messages for session summary — broader context
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

		// Privacy stripping — applied before extraction (bug fix §12)
		const sanitizedMessages = messages.map(m => ({
			...m,
			content: stripPrivateContent(m.content),
		}));

		log("auto-save: sending session summary request", { sessionID, messages: sanitizedMessages.length });

		// Direct store call — replaces memoryClient.addMemoryFromMessagesAsSummary()
		const results = await store.ingest(sanitizedMessages, tags.project, {
			mode: "summary",
			metadata: { type: "session-summary" },
		});

		log("auto-save: session summary done", { sessionID, count: results.length });
	} catch (err) {
		log("auto-save: session summary failed", { sessionID, error: String(err) });
	}
}
