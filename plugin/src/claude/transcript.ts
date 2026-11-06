/**
 * Claude Code transcript reader.
 *
 * Claude Code hands every hook a `transcript_path` — an append-only JSONL file
 * with one record per event. We turn the records into a compact, extraction-ready
 * conversation:
 *
 *   user text            → [user] …            (system-reminders stripped)
 *   queued mid-turn msgs → [user] …            (attachment.type = queued_command)
 *   assistant text       → [assistant] …
 *   tool_use             → [assistant] (tool) Bash: npm test     — one line, capped
 *   tool_result errors   → [tool-error] …                         — capped
 *
 * Skipped: thinking blocks, successful tool output, hook attachments (so our own
 * injected [MEMORY] never feeds back into extraction), sidechains (subagents), and
 * bookkeeping records.
 *
 * Reading is incremental: callers pass a byte offset and get back the new offset,
 * so each turn is extracted exactly once — no "last 8 messages" overlap or gaps.
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";

import { stripPrivateContent } from "../services/privacy.js";

export interface TranscriptMessage {
	role: "user" | "assistant";
	content: string;
	timestamp?: string;
}

export interface TranscriptChunk {
	messages: TranscriptMessage[];
	/** Byte offset to resume from next time (end of the last complete line read). */
	nextOffset: number;
	/** True when the file was shorter than the requested offset (rewritten) and we restarted at 0. */
	reset: boolean;
}

const TOOL_LINE_CAP = 240;
const TOOL_ERROR_CAP = 600;
const MESSAGE_CAP = 6_000;

const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const LOCAL_COMMAND_RE = /<(local-command-stdout|local-command-stderr|command-message|command-args)>[\s\S]*?<\/\1>/g;

function cap(s: string, n: number): string {
	return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Strip harness noise from user-typed text. Exported for tests. */
export function cleanUserText(text: string): string {
	return text
		.replace(SYSTEM_REMINDER_RE, "")
		.replace(LOCAL_COMMAND_RE, "")
		.replace(/<command-name>([\s\S]*?)<\/command-name>/g, "$1")
		.trim();
}

function textFromBlocks(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((b): b is { type: string; text: string } => !!b && (b as { type?: string }).type === "text")
		.map((b) => b.text)
		.join("\n");
}

function describeToolUse(block: { name?: string; input?: Record<string, unknown> }): string {
	const name = block.name ?? "tool";
	const input = block.input ?? {};
	const primary =
		(input.command as string) ??
		(input.file_path as string) ??
		(input.path as string) ??
		(input.pattern as string) ??
		(input.url as string) ??
		(input.query as string) ??
		(input.description as string) ??
		"";
	return cap(`(tool) ${name}${primary ? `: ${String(primary).replace(/\s+/g, " ")}` : ""}`, TOOL_LINE_CAP);
}

function toolResultText(block: { content?: unknown }): string {
	const c = block.content;
	if (typeof c === "string") return c;
	return textFromBlocks(c);
}

/**
 * Convert parsed JSONL records into conversation messages. Exported for tests.
 */
export function recordsToMessages(records: unknown[]): TranscriptMessage[] {
	const out: TranscriptMessage[] = [];
	const push = (role: "user" | "assistant", content: string, timestamp?: string) => {
		const trimmed = content.trim();
		if (!trimmed) return;
		const last = out[out.length - 1];
		// Merge consecutive same-role fragments (assistant text + tool lines of one turn)
		if (last && last.role === role) {
			last.content = cap(`${last.content}\n${trimmed}`, MESSAGE_CAP);
			return;
		}
		out.push({ role, content: cap(trimmed, MESSAGE_CAP), timestamp });
	};

	for (const raw of records) {
		if (!raw || typeof raw !== "object") continue;
		const r = raw as Record<string, unknown>;
		if (r.isSidechain === true || r.isMeta === true) continue;
		// Compaction summaries are Claude Code's own recap of earlier turns (which
		// were already extracted) and can embed injected [MEMORY] text — skip.
		if (r.isCompactSummary === true || r.isVisibleInTranscriptOnly === true) continue;
		const ts = typeof r.timestamp === "string" ? r.timestamp : undefined;

		if (r.type === "attachment") {
			const a = r.attachment as Record<string, unknown> | undefined;
			if (a?.type === "queued_command") {
				push("user", stripPrivateContent(cleanUserText(textFromBlocks(a.prompt))), ts);
			}
			continue;
		}

		const msg = r.message as { role?: string; content?: unknown } | undefined;
		if (!msg) continue;

		if (r.type === "user" && msg.role === "user") {
			if (typeof msg.content === "string") {
				push("user", stripPrivateContent(cleanUserText(msg.content)), ts);
				continue;
			}
			if (!Array.isArray(msg.content)) continue;
			const blocks = msg.content as Array<Record<string, unknown>>;
			// Join all text blocks of the record BEFORE stripping <private> spans, so
			// a tag opened in one block and closed in another is still redacted.
			const text = blocks.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("\n");
			if (text) push("user", stripPrivateContent(cleanUserText(text)), ts);
			for (const b of blocks) {
				if (b?.type === "tool_result" && b.is_error === true) {
					push("user", `[tool-error] ${cap(stripPrivateContent(toolResultText(b).trim()), TOOL_ERROR_CAP)}`, ts);
				}
			}
			continue;
		}

		if (r.type === "assistant" && msg.role === "assistant") {
			if (typeof msg.content === "string") {
				push("assistant", stripPrivateContent(msg.content), ts);
				continue;
			}
			if (!Array.isArray(msg.content)) continue;
			for (const b of msg.content as Array<Record<string, unknown>>) {
				if (b?.type === "text") push("assistant", stripPrivateContent(String(b.text ?? "")), ts);
				else if (b?.type === "tool_use") push("assistant", describeToolUse(b as { name?: string; input?: Record<string, unknown> }), ts);
			}
		}
	}
	return out;
}

/**
 * Read transcript records appended after `offset` bytes. Only complete lines are
 * consumed; a partially-written trailing line is left for the next call.
 */
export function readTranscriptFrom(path: string, offset = 0): TranscriptChunk {
	let fd: number;
	try {
		fd = openSync(path, "r");
	} catch {
		return { messages: [], nextOffset: offset, reset: false };
	}
	try {
		const size = fstatSync(fd).size;
		let start = offset;
		let reset = false;
		if (start > size) {
			start = 0;
			reset = true;
		}
		const length = size - start;
		if (length <= 0) return { messages: [], nextOffset: start, reset };

		const buf = Buffer.alloc(length);
		readSync(fd, buf, 0, length, start);
		const lastNewline = buf.lastIndexOf(0x0a);
		if (lastNewline === -1) return { messages: [], nextOffset: start, reset };

		const text = buf.subarray(0, lastNewline + 1).toString("utf8");
		const records: unknown[] = [];
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			try {
				records.push(JSON.parse(line));
			} catch {
				// corrupt / partial line — skip
			}
		}
		return { messages: recordsToMessages(records), nextOffset: start + lastNewline + 1, reset };
	} finally {
		closeSync(fd);
	}
}

/** Render messages in the "[role] content" format the extraction prompts expect. */
export function renderConversation(messages: TranscriptMessage[]): string {
	return messages.map((m) => `[${m.role}] ${m.content}`).join("\n");
}

/**
 * Split a conversation into windows of at most `maxChars`, on message boundaries,
 * so long turns are extracted completely instead of being silently truncated.
 */
export function windowMessages(messages: TranscriptMessage[], maxChars: number): TranscriptMessage[][] {
	const windows: TranscriptMessage[][] = [];
	let current: TranscriptMessage[] = [];
	let size = 0;
	for (const m of messages) {
		const len = m.content.length + m.role.length + 3;
		if (current.length > 0 && size + len > maxChars) {
			windows.push(current);
			current = [];
			size = 0;
		}
		current.push(m);
		size += len;
	}
	if (current.length > 0) windows.push(current);
	return windows;
}
