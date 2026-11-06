/**
 * Unit tests for llm.ts — headless `claude -p` argv, binary discovery, backend
 * resolution, and the real CLI call path driven against a fake `claude` stub.
 *
 * Never reaches the real Claude Code CLI or the Anthropic API: preload.ts
 * points CODEXFI_CLAUDE_BIN at a shell stub, and callLlm/callLlmStrict seen by
 * the rest of the engine are fakes. The real implementations live in realLlm.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, afterEach } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildClaudeArgs, findClaudeBinary, resolveBackend, _resetClaudeBinaryCache } from "../../../plugin/src/llm.js";
import { realLlm } from "../helpers/fake-llm.js";
import { FAKE_CLAUDE_BIN, makeTempDir } from "../helpers/test-env.js";

type CallLlmStrict = (system: string, user: string, opts?: Record<string, unknown>) => Promise<{
	text: string;
	usage: { inputTokens: number; outputTokens: number; costUsd: number; model: string };
}>;

const ENV_KEYS = ["CODEXFI_CLAUDE_BIN", "CLAUDE_CODE_EXECPATH", "PATH", "CODEXFI_FAKE_CLAUDE_LOG", "CODEXFI_FAKE_CLAUDE_REPLY"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (savedEnv[k] === undefined) delete process.env[k];
		else process.env[k] = savedEnv[k];
	}
	_resetClaudeBinaryCache();
});

function makeExecutable(dir: string, name: string): string {
	const p = join(dir, name);
	writeFileSync(p, "#!/bin/sh\nexit 0\n");
	chmodSync(p, 0o755);
	return p;
}

// ── buildClaudeArgs ─────────────────────────────────────────────────────────────

describe("buildClaudeArgs", () => {
	const args = buildClaudeArgs("SYSTEM PROMPT", "haiku");

	/** Value following `flag` in argv. */
	const valueOf = (flag: string) => {
		const i = args.indexOf(flag);
		return i === -1 ? undefined : args[i + 1];
	};

	test("runs headless (-p) with JSON output", () => {
		expect(args[0]).toBe("-p");
		expect(valueOf("--output-format")).toBe("json");
	});

	test("--safe-mode keeps the login but skips plugins/hooks/CLAUDE.md (recursion guard)", () => {
		expect(args).toContain("--safe-mode");
	});

	test('--setting-sources "" loads no user/project settings', () => {
		expect(args).toContain("--setting-sources");
		expect(valueOf("--setting-sources")).toBe("");
	});

	test('--tools "" disables every tool', () => {
		expect(args).toContain("--tools");
		expect(valueOf("--tools")).toBe("");
	});

	test("--no-session-persistence keeps background calls out of the user's history", () => {
		expect(args).toContain("--no-session-persistence");
	});

	test("--system-prompt replaces Claude Code's system prompt with ours", () => {
		expect(valueOf("--system-prompt")).toBe("SYSTEM PROMPT");
	});

	test("passes the model and isolates MCP / slash commands", () => {
		expect(valueOf("--model")).toBe("haiku");
		expect(args).toContain("--strict-mcp-config");
		expect(args).toContain("--disable-slash-commands");
	});

	test("never uses --bare (it would reject subscription logins)", () => {
		expect(args).not.toContain("--bare");
	});
});

// ── findClaudeBinary ────────────────────────────────────────────────────────────

describe("findClaudeBinary", () => {
	test("CODEXFI_CLAUDE_BIN wins over CLAUDE_CODE_EXECPATH", () => {
		const dir = makeTempDir("bin");
		const explicit = makeExecutable(dir, "claude-explicit");
		const execPath = makeExecutable(dir, "claude-execpath");
		process.env.CODEXFI_CLAUDE_BIN = explicit;
		process.env.CLAUDE_CODE_EXECPATH = execPath;
		_resetClaudeBinaryCache();
		expect(findClaudeBinary()).toBe(explicit);
	});

	test("falls back to CLAUDE_CODE_EXECPATH when CODEXFI_CLAUDE_BIN is unset or missing", () => {
		const dir = makeTempDir("bin");
		const execPath = makeExecutable(dir, "claude-execpath");
		process.env.CODEXFI_CLAUDE_BIN = join(dir, "does-not-exist");
		process.env.CLAUDE_CODE_EXECPATH = execPath;
		_resetClaudeBinaryCache();
		expect(findClaudeBinary()).toBe(execPath);

		delete process.env.CODEXFI_CLAUDE_BIN;
		_resetClaudeBinaryCache();
		expect(findClaudeBinary()).toBe(execPath);
	});

	test("then searches PATH", () => {
		const dir = makeTempDir("path");
		const onPath = makeExecutable(dir, "claude");
		delete process.env.CODEXFI_CLAUDE_BIN;
		delete process.env.CLAUDE_CODE_EXECPATH;
		process.env.PATH = dir;
		_resetClaudeBinaryCache();
		expect(findClaudeBinary()).toBe(onPath);
	});

	test("result is cached until _resetClaudeBinaryCache()", () => {
		const dir = makeTempDir("bin");
		const first = makeExecutable(dir, "first");
		const second = makeExecutable(dir, "second");
		process.env.CODEXFI_CLAUDE_BIN = first;
		_resetClaudeBinaryCache();
		expect(findClaudeBinary()).toBe(first);
		process.env.CODEXFI_CLAUDE_BIN = second;
		expect(findClaudeBinary()).toBe(first);
		_resetClaudeBinaryCache();
		expect(findClaudeBinary()).toBe(second);
	});
});

// ── resolveBackend ──────────────────────────────────────────────────────────────

describe("resolveBackend", () => {
	test("explicit choices are returned as-is", () => {
		expect(resolveBackend("claude-cli")).toBe("claude-cli");
		expect(resolveBackend("anthropic-api")).toBe("anthropic-api");
	});

	test('"auto" prefers the claude CLI when it is installed', () => {
		process.env.CODEXFI_CLAUDE_BIN = FAKE_CLAUDE_BIN;
		_resetClaudeBinaryCache();
		expect(resolveBackend("auto")).toBe("claude-cli");
	});

	// The well-known install locations are absolute paths outside our control;
	// skip when one exists on this machine.
	const wellKnown = ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"].some((p) => {
		try {
			readFileSync(p, { flag: "r" });
			return true;
		} catch {
			return false;
		}
	});

	test.skipIf(wellKnown)('"auto" with no CLI and no API key resolves to null', () => {
		const empty = makeTempDir("empty-path");
		process.env.CODEXFI_CLAUDE_BIN = join(empty, "missing");
		delete process.env.CLAUDE_CODE_EXECPATH;
		process.env.PATH = empty;
		_resetClaudeBinaryCache();
		// The sandbox has no anthropicApiKey and ANTHROPIC_API_KEY is unset.
		expect(resolveBackend("auto")).toBeNull();
	});
});

// ── Real CLI path against the fake `claude` stub ────────────────────────────────

describe("callLlmStrict via claude-cli (fake binary)", () => {
	const callLlmStrict = realLlm.callLlmStrict as CallLlmStrict;

	test("sends the user prompt on stdin, the system prompt in argv, CODEXFI_DISABLE=1 in env", async () => {
		const dir = makeTempDir("fake-claude");
		const log = join(dir, "calls.log");
		const reply = join(dir, "reply.json");
		writeFileSync(reply, JSON.stringify({
			type: "result",
			is_error: false,
			result: '  [{"memory":"x","type":"learned-pattern"}]  ',
			usage: { input_tokens: 10, cache_read_input_tokens: 500, cache_creation_input_tokens: 90, output_tokens: 25 },
			total_cost_usd: 0.0012,
			modelUsage: { "claude-haiku-4-5": {} },
		}));
		process.env.CODEXFI_CLAUDE_BIN = FAKE_CLAUDE_BIN;
		process.env.CODEXFI_FAKE_CLAUDE_LOG = log;
		process.env.CODEXFI_FAKE_CLAUDE_REPLY = reply;
		_resetClaudeBinaryCache();

		const result = await callLlmStrict("EXTRACT-SYSTEM", "conversation text here", { backend: "claude-cli", model: "haiku" });

		expect(result.text).toBe('[{"memory":"x","type":"learned-pattern"}]');
		// input tokens include cache reads + cache creation
		expect(result.usage.inputTokens).toBe(600);
		expect(result.usage.outputTokens).toBe(25);
		expect(result.usage.costUsd).toBeCloseTo(0.0012, 8);
		expect(result.usage.model).toBe("claude-haiku-4-5");

		const logged = readFileSync(log, "utf8");
		expect(logged).toContain("[--safe-mode]");
		expect(logged).toContain("[--system-prompt] [EXTRACT-SYSTEM]");
		expect(logged).toContain("DISABLE:1");
		expect(logged).toContain("STDIN:conversation text here");
	});
});
