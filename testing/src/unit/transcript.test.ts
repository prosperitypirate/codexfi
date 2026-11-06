/**
 * Unit tests for claude/transcript.ts — turning Claude Code JSONL transcripts
 * into extraction-ready conversation, incrementally.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect } from "bun:test";
import { appendFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	cleanUserText,
	readTranscriptFrom,
	recordsToMessages,
	renderConversation,
	windowMessages,
	type TranscriptMessage,
} from "../../../plugin/src/claude/transcript.js";
import { makeTempDir, writeTranscript } from "../helpers/test-env.js";

// ── Record builders (shapes as written by Claude Code) ──────────────────────────

const user = (content: unknown, extra: Record<string, unknown> = {}) => ({
	type: "user",
	message: { role: "user", content },
	timestamp: "2026-11-01T10:00:00.000Z",
	...extra,
});
const assistant = (content: unknown, extra: Record<string, unknown> = {}) => ({
	type: "assistant",
	message: { role: "assistant", content },
	timestamp: "2026-11-01T10:00:05.000Z",
	...extra,
});

// ── cleanUserText ───────────────────────────────────────────────────────────────

describe("cleanUserText", () => {
	test("strips <system-reminder> blocks", () => {
		expect(cleanUserText("Fix the bug<system-reminder>\nInjected [MEMORY] stuff\n</system-reminder>")).toBe("Fix the bug");
	});

	test("strips local command output but keeps the command name", () => {
		const raw = "<command-name>/review</command-name><command-message>review</command-message><command-args></command-args><local-command-stdout>lots of output</local-command-stdout>";
		expect(cleanUserText(raw)).toBe("/review");
	});
});

// ── recordsToMessages ───────────────────────────────────────────────────────────

describe("recordsToMessages", () => {
	test("user string content becomes a [user] message (system-reminders removed)", () => {
		const msgs = recordsToMessages([user("Please add retries <system-reminder>noise</system-reminder>")]);
		expect(msgs).toEqual([{ role: "user", content: "Please add retries", timestamp: "2026-11-01T10:00:00.000Z" }]);
	});

	test("user text blocks are included", () => {
		const msgs = recordsToMessages([user([{ type: "text", text: "Use SQLite WAL mode" }])]);
		expect(msgs[0]!.content).toBe("Use SQLite WAL mode");
	});

	test("queued_command attachments (messages typed mid-turn) become user messages", () => {
		const msgs = recordsToMessages([
			{ type: "attachment", attachment: { type: "queued_command", prompt: "also update the README<system-reminder>x</system-reminder>" } },
		]);
		expect(msgs).toEqual([{ role: "user", content: "also update the README", timestamp: undefined }]);
	});

	test("hook attachments (our own injected [MEMORY]) are skipped", () => {
		const msgs = recordsToMessages([
			{ type: "attachment", attachment: { type: "hook_additional_context", content: "[MEMORY]\n- old fact" } },
			{ type: "attachment", attachment: { type: "hook_success", hookName: "SessionStart" } },
		]);
		expect(msgs).toEqual([]);
	});

	test("tool_use renders as a capped one-line summary", () => {
		const msgs = recordsToMessages([
			assistant([
				{ type: "text", text: "Running the tests." },
				{ type: "tool_use", name: "Bash", input: { command: "npm   test\n  -- --watch=false" } },
				{ type: "tool_use", name: "Read", input: { file_path: "/repo/src/app.ts" } },
				{ type: "tool_use", name: "Grep", input: { pattern: "x".repeat(500) } },
			]),
		]);
		expect(msgs).toHaveLength(1);
		const lines = msgs[0]!.content.split("\n");
		expect(lines[0]).toBe("Running the tests.");
		expect(lines[1]).toBe("(tool) Bash: npm test -- --watch=false");
		expect(lines[2]).toBe("(tool) Read: /repo/src/app.ts");
		expect(lines[3]!.length).toBeLessThanOrEqual(241); // 240 + ellipsis
		expect(lines[3]!.endsWith("…")).toBe(true);
	});

	test("tool_result: only errors are kept, as [tool-error] lines", () => {
		const msgs = recordsToMessages([
			user([{ type: "tool_result", tool_use_id: "t1", content: "ok: 42 tests passed" }]),
			user([{ type: "tool_result", tool_use_id: "t2", is_error: true, content: [{ type: "text", text: "Error: ENOENT config.json" }] }]),
		]);
		expect(msgs).toEqual([{ role: "user", content: "[tool-error] Error: ENOENT config.json", timestamp: "2026-11-01T10:00:00.000Z" }]);
	});

	test("thinking blocks, sidechains and meta records are skipped", () => {
		const msgs = recordsToMessages([
			assistant([{ type: "thinking", thinking: "secret reasoning" }, { type: "text", text: "Done." }]),
			assistant([{ type: "text", text: "subagent chatter" }], { isSidechain: true }),
			user("caveat: meta", { isMeta: true }),
			{ type: "summary", summary: "bookkeeping" },
			{ type: "system", content: "bookkeeping" },
		]);
		expect(msgs).toEqual([{ role: "assistant", content: "Done.", timestamp: "2026-11-01T10:00:05.000Z" }]);
	});

	test("consecutive same-role fragments are merged; roles alternate", () => {
		const msgs = recordsToMessages([
			user("first"),
			user("second"),
			assistant("reply one"),
			assistant([{ type: "tool_use", name: "Edit", input: { file_path: "a.ts" } }]),
			user("third"),
		]);
		expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
		expect(msgs[0]!.content).toBe("first\nsecond");
		expect(msgs[1]!.content).toBe("reply one\n(tool) Edit: a.ts");
	});

	test("empty / whitespace-only content and junk records are ignored", () => {
		const msgs = recordsToMessages([null, 42, "str", user("   "), assistant([]), { type: "user" }]);
		expect(msgs).toEqual([]);
	});

	test("a very long message is capped", () => {
		const msgs = recordsToMessages([user("z".repeat(20_000))]);
		expect(msgs[0]!.content.length).toBeLessThanOrEqual(6_001);
	});
});

// ── readTranscriptFrom ──────────────────────────────────────────────────────────

describe("readTranscriptFrom", () => {
	test("missing file → no messages, offset unchanged", () => {
		const chunk = readTranscriptFrom("/nonexistent/transcript.jsonl", 123);
		expect(chunk).toEqual({ messages: [], nextOffset: 123, reset: false });
	});

	test("reads everything from 0 and returns the file size as the next offset", () => {
		const p = join(makeTempDir("tr"), "t.jsonl");
		writeTranscript(p, [user("hello there"), assistant("hi!")]);
		const chunk = readTranscriptFrom(p, 0);
		expect(chunk.messages.map((m) => m.content)).toEqual(["hello there", "hi!"]);
		expect(chunk.nextOffset).toBe(statSync(p).size);
		expect(chunk.reset).toBe(false);
	});

	test("incremental: a second read from the returned offset sees only new records", () => {
		const p = join(makeTempDir("tr"), "t.jsonl");
		writeTranscript(p, [user("turn one"), assistant("answer one")]);
		const first = readTranscriptFrom(p, 0);

		appendFileSync(p, JSON.stringify(user("turn two")) + "\n" + JSON.stringify(assistant("answer two")) + "\n");
		const second = readTranscriptFrom(p, first.nextOffset);
		expect(second.messages.map((m) => m.content)).toEqual(["turn two", "answer two"]);
		expect(second.nextOffset).toBe(statSync(p).size);

		const third = readTranscriptFrom(p, second.nextOffset);
		expect(third.messages).toEqual([]);
		expect(third.nextOffset).toBe(second.nextOffset);
	});

	test("a partially written trailing line is left for the next call", () => {
		const p = join(makeTempDir("tr"), "t.jsonl");
		const complete = JSON.stringify(user("complete line")) + "\n";
		const partial = JSON.stringify(assistant("still being written"));
		writeFileSync(p, complete + partial.slice(0, 25));

		const chunk = readTranscriptFrom(p, 0);
		expect(chunk.messages.map((m) => m.content)).toEqual(["complete line"]);
		expect(chunk.nextOffset).toBe(Buffer.byteLength(complete));

		appendFileSync(p, partial.slice(25) + "\n");
		const next = readTranscriptFrom(p, chunk.nextOffset);
		expect(next.messages.map((m) => m.content)).toEqual(["still being written"]);
	});

	test("only a partial line → nothing consumed", () => {
		const p = join(makeTempDir("tr"), "t.jsonl");
		writeFileSync(p, '{"type":"user","mess');
		expect(readTranscriptFrom(p, 0)).toEqual({ messages: [], nextOffset: 0, reset: false });
	});

	test("file shorter than the saved offset (rewritten) → restart from 0 with reset=true", () => {
		const p = join(makeTempDir("tr"), "t.jsonl");
		writeTranscript(p, [user("a long first conversation turn"), assistant("with a long answer as well")]);
		const big = readTranscriptFrom(p, 0).nextOffset;

		writeTranscript(p, [user("fresh")]);
		const chunk = readTranscriptFrom(p, big);
		expect(chunk.reset).toBe(true);
		expect(chunk.messages.map((m) => m.content)).toEqual(["fresh"]);
		expect(chunk.nextOffset).toBe(statSync(p).size);
	});

	test("corrupt lines are skipped, the rest is read", () => {
		const p = join(makeTempDir("tr"), "t.jsonl");
		writeFileSync(p, `${JSON.stringify(user("good one"))}\n{not json}\n${JSON.stringify(assistant("good two"))}\n`);
		expect(readTranscriptFrom(p, 0).messages.map((m) => m.content)).toEqual(["good one", "good two"]);
	});

	test("offsets are byte offsets (multi-byte UTF-8 safe)", () => {
		const p = join(makeTempDir("tr"), "t.jsonl");
		writeTranscript(p, [user("naïve café — 日本語")]);
		const first = readTranscriptFrom(p, 0);
		expect(first.nextOffset).toBe(statSync(p).size);
		appendFileSync(p, JSON.stringify(assistant("ok ✓")) + "\n");
		expect(readTranscriptFrom(p, first.nextOffset).messages.map((m) => m.content)).toEqual(["ok ✓"]);
	});
});

// ── renderConversation / windowMessages ─────────────────────────────────────────

describe("renderConversation", () => {
	test("renders [role] content lines", () => {
		expect(renderConversation([{ role: "user", content: "q" }, { role: "assistant", content: "a" }])).toBe("[user] q\n[assistant] a");
	});
});

describe("windowMessages", () => {
	const msg = (role: "user" | "assistant", n: number): TranscriptMessage => ({ role, content: "m".repeat(n) });

	test("everything fits → one window", () => {
		const msgs = [msg("user", 10), msg("assistant", 10)];
		expect(windowMessages(msgs, 1000)).toEqual([msgs]);
	});

	test("splits on message boundaries without dropping or reordering anything", () => {
		const msgs = [msg("user", 40), msg("assistant", 40), msg("user", 40), msg("assistant", 40), msg("user", 40)];
		const windows = windowMessages(msgs, 100);
		expect(windows.length).toBeGreaterThan(1);
		expect(windows.flat()).toEqual(msgs);
		for (const w of windows) {
			const size = w.reduce((s, m) => s + m.content.length + m.role.length + 3, 0);
			expect(size).toBeLessThanOrEqual(100);
		}
	});

	test("a single oversized message still gets its own window", () => {
		const msgs = [msg("user", 10), msg("assistant", 500), msg("user", 10)];
		const windows = windowMessages(msgs, 100);
		expect(windows).toEqual([[msgs[0]], [msgs[1]], [msgs[2]]]);
	});

	test("empty input → no windows", () => {
		expect(windowMessages([], 100)).toEqual([]);
	});
});

// ── Regression tests from the 1.0 review ────────────────────────────────────────
import { recordsToMessages as r2m } from "../../../plugin/src/claude/transcript.js";
import { stripPrivateContent as strip } from "../../../plugin/src/services/privacy.js";

describe("review regressions", () => {
	test("compaction summaries (isCompactSummary / isVisibleInTranscriptOnly) are never extracted", () => {
		const out = r2m([
			{ type: "user", isCompactSummary: true, message: { role: "user", content: "This session is being continued... [MEMORY] stuff" } },
			{ type: "user", isVisibleInTranscriptOnly: true, message: { role: "user", content: "summary text" } },
			{ type: "user", message: { role: "user", content: "real prompt" } },
		]);
		expect(out.map((m) => m.content)).toEqual(["real prompt"]);
	});

	test("<private> spanning two text blocks of one record is redacted", () => {
		const out = r2m([
			{ type: "user", message: { role: "user", content: [
				{ type: "text", text: "key: <private>sk-AAA" },
				{ type: "text", text: "BBB</private> thanks" },
			] } },
		]);
		expect(out[0]!.content).not.toContain("sk-AAA");
		expect(out[0]!.content).not.toContain("BBB");
		expect(out[0]!.content).toContain("thanks");
	});

	test("a <private> whose closing tag is past the message cap does not leak", () => {
		const long = "x".repeat(7000);
		const out = r2m([{ type: "user", message: { role: "user", content: `<private>secret-123 ${long}</private>` } }]);
		expect(out[0]!.content).not.toContain("secret-123");
	});

	test("stripPrivateContent fails closed on unclosed and orphan tags", () => {
		expect(strip("a <private>secret")).toBe("a [REDACTED]");
		expect(strip("secret</private> b")).toBe("[REDACTED] b");
	});
});
