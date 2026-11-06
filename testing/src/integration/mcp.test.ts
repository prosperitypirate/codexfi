/**
 * Integration tests for claude/mcp.ts handleRpc() — the MCP stdio server's
 * JSON-RPC dispatcher (initialize, tools/list, tools/call round trips, errors).
 *
 * Real store (temp DB) + mocked local embedder + fake LLM (contradiction checks
 * get "[]"). CLAUDE_PROJECT_DIR selects the project scope, as in Claude Code.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";

import pkg from "../../../plugin/package.json";
import { handleRpc } from "../../../plugin/src/claude/mcp.js";
import { CONTRADICTION_SYSTEM } from "../../../plugin/src/prompts.js";
import { PLUGIN_CONFIG } from "../../../plugin/src/plugin-config.js";
import { llmCalls, resetFakeLlm } from "../helpers/fake-llm.js";
import { setupTempDb, teardownTempDb } from "../helpers/temp-db.js";
import { captureStdout, makeTempDir } from "../helpers/test-env.js";

const savedProjectDir = process.env.CLAUDE_PROJECT_DIR;
let rpcId = 0;

async function call(method: string, params?: Record<string, unknown>) {
	return handleRpc({ jsonrpc: "2.0", id: ++rpcId, method, params });
}

async function tool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> {
	const res = (await call("tools/call", { name, arguments: args })) as { result: { content: Array<{ text: string }>; isError?: boolean } };
	return { text: res.result.content[0]!.text, isError: res.result.isError };
}

beforeAll(async () => {
	await setupTempDb();
	process.env.CLAUDE_PROJECT_DIR = makeTempDir("mcp-project");
});

afterAll(() => {
	if (savedProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
	else process.env.CLAUDE_PROJECT_DIR = savedProjectDir;
	teardownTempDb();
});

beforeEach(() => resetFakeLlm());

// ── Protocol ────────────────────────────────────────────────────────────────────

describe("protocol", () => {
	test("initialize returns server info, tools capability and usage instructions", async () => {
		const res = (await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test" } })) as {
			id: number;
			result: { protocolVersion: string; capabilities: { tools: object }; serverInfo: { name: string; version: string }; instructions: string };
		};
		expect(res.id).toBe(rpcId);
		expect(res.result.protocolVersion).toBe("2025-06-18");
		expect(res.result.capabilities.tools).toBeDefined();
		expect(res.result.serverInfo).toEqual({ name: "codexfi", version: pkg.version });
		expect(res.result.instructions).toContain("memory_search");
		expect(res.result.instructions).toContain("memory_add");
	});

	test("initialize echoes the client's protocol version", async () => {
		const res = (await call("initialize", { protocolVersion: "2099-01-01" })) as { result: { protocolVersion: string } };
		expect(res.result.protocolVersion).toBe("2099-01-01");
	});

	test("tools/list exposes the four memory tools with input schemas", async () => {
		const res = (await call("tools/list")) as { result: { tools: Array<{ name: string; inputSchema: { type: string; required?: string[] } }> } };
		const names = res.result.tools.map((t) => t.name);
		expect(names).toEqual(["memory_search", "memory_add", "memory_list", "memory_forget"]);
		for (const t of res.result.tools) expect(t.inputSchema.type).toBe("object");
		expect(res.result.tools.find((t) => t.name === "memory_add")!.inputSchema.required).toEqual(["content"]);
	});

	test("ping → empty result", async () => {
		expect(await call("ping")).toEqual({ id: rpcId, result: {} });
	});

	test("unknown method → JSON-RPC -32601", async () => {
		const res = (await call("resources/list")) as { error: { code: number; message: string } };
		expect(res.error.code).toBe(-32601);
		expect(res.error.message).toContain("resources/list");
	});

	test("notifications (no id) get no response", async () => {
		expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
		expect(await handleRpc({ jsonrpc: "2.0", id: null, method: "notifications/cancelled", params: { requestId: 1 } })).toBeNull();
	});

	test("unknown tool → JSON-RPC -32602", async () => {
		const res = (await call("tools/call", { name: "memory_explode", arguments: {} })) as { error: { code: number; message: string } };
		expect(res.error.code).toBe(-32602);
		expect(res.error.message).toContain("memory_explode");
	});
});

// ── Tools ───────────────────────────────────────────────────────────────────────

describe("tools", () => {
	test("memory_add → memory_search round trip", async () => {
		const added = await tool("memory_add", { content: "The billing service retries Stripe webhooks with exponential backoff" });
		expect(added.isError).toBeUndefined();
		expect(added.text).toMatch(/^Stored project memory [0-9a-f]{8} \(learned-pattern\)\.$/);

		const found = await tool("memory_search", { query: "how are Stripe webhooks retried in the billing service" });
		expect(found.text).toContain("The billing service retries Stripe webhooks with exponential backoff");
		expect(found.text).toMatch(/^- \[[0-9a-f]{8} · project · learned-pattern · \d+%/);
	});

	test("memory_add of the same fact again updates instead of duplicating", async () => {
		await tool("memory_add", { content: "Deploys go out via the release workflow on version tags" });
		const again = await tool("memory_add", { content: "Deploys go out via the release workflow on version tags" });
		expect(again.text).toStartWith("Updated existing project memory");
		const list = await tool("memory_list", {});
		expect(list.text.split("\n").filter((l) => l.includes("release workflow on version tags"))).toHaveLength(1);
	});

	test("memory_add runs contradiction detection only when similar memories exist", async () => {
		const saved = process.env.CLAUDE_PROJECT_DIR;
		process.env.CLAUDE_PROJECT_DIR = makeTempDir("mcp-contradiction-project"); // empty project scope
		try {
			await tool("memory_add", { content: "Zebra quokka narwhal axolotl" });
			expect(llmCalls.filter((c) => c.system === CONTRADICTION_SYSTEM)).toHaveLength(0);
			await tool("memory_add", { content: "Zebra quokka narwhal axolotl pangolin capybara okapi tapir" });
			expect(llmCalls.filter((c) => c.system === CONTRADICTION_SYSTEM).length).toBeGreaterThan(0);
		} finally {
			process.env.CLAUDE_PROJECT_DIR = saved;
		}
	});

	test("user scope and explicit type are honoured; scopes are isolated", async () => {
		const added = await tool("memory_add", { content: "Prefers pnpm over npm for new projects", scope: "user", type: "preference" });
		expect(added.text).toMatch(/^Stored user memory [0-9a-f]{8} \(preference\)\.$/);

		const userOnly = await tool("memory_search", { query: "pnpm over npm", scope: "user" });
		expect(userOnly.text).toContain("· user · preference ·");
		const projectOnly = await tool("memory_search", { query: "pnpm over npm", scope: "project" });
		expect(projectOnly.text).not.toContain("Prefers pnpm over npm");
	});

	test("memory_add strips <private> content and refuses fully-private input", async () => {
		const refused = await tool("memory_add", { content: "<private>db password hunter2</private>" });
		expect(refused.text).toContain("Refusing");

		await tool("memory_add", { content: "Staging DB lives at <private>10.0.0.5:5432</private> behind the VPN" });
		const list = await tool("memory_list", {});
		expect(list.text).toContain("Staging DB lives at [REDACTED] behind the VPN");
		expect(list.text).not.toContain("10.0.0.5");
	});

	test("required arguments are validated", async () => {
		expect((await tool("memory_add", { content: "   " })).text).toBe("content is required");
		expect((await tool("memory_search", { query: "" })).text).toBe("query is required");
		expect((await tool("memory_forget", { id: "abc" })).text).toContain("at least 8 characters");
	});

	test("memory_list filters by type", async () => {
		await tool("memory_add", { content: "Fixed EADDRINUSE by killing the stale dev server", type: "error-solution" });
		const list = await tool("memory_list", { type: "error-solution" });
		expect(list.text).toContain("EADDRINUSE");
		expect(list.text).not.toContain("Stripe webhooks");
	});

	test("memory_forget deletes by unique id prefix", async () => {
		const added = await tool("memory_add", { content: "Temporary fact about the forget tool round trip" });
		const prefix = added.text.match(/memory ([0-9a-f]{8})/)![1]!;
		const res = await tool("memory_forget", { id: prefix });
		expect(res.text).toStartWith(`Deleted memory ${prefix}`);
		const list = await tool("memory_list", { limit: 100 });
		expect(list.text).not.toContain("Temporary fact about the forget tool");
		expect((await tool("memory_forget", { id: prefix })).text).toContain("No memory with id");
	});

	test("memory_search in an empty project scope says so", async () => {
		const saved = process.env.CLAUDE_PROJECT_DIR;
		process.env.CLAUDE_PROJECT_DIR = makeTempDir("mcp-empty-project");
		try {
			const res = await tool("memory_search", { query: "xylophone", scope: "project" });
			expect(res.text).toBe('No memories found for "xylophone".');
		} finally {
			process.env.CLAUDE_PROJECT_DIR = saved;
		}
	});

	test("excludePaths disables explicit tool calls too", async () => {
		const dir = process.env.CLAUDE_PROJECT_DIR!;
		PLUGIN_CONFIG.excludePaths.push(dir);
		try {
			const res = await tool("memory_add", { content: "Should never be stored" });
			expect(res.text).toContain("disabled");
		} finally {
			PLUGIN_CONFIG.excludePaths.pop();
		}
	});

	// ENGINE BUG: store.ts ageActiveContext() logs with console.log (store.ts:256).
	// In the MCP server process stdout IS the JSON-RPC channel, so memory_add with
	// type "active-context" (the agent's natural choice for "what I'm working on")
	// writes a non-JSON line into the protocol stream. Fix: console.error there, or
	// have runMcpServer() redirect console.log/info/debug to stderr at startup.
	// Run with `bun test --todo` to see it fail.
	test("tools/call never writes non-protocol output to stdout (active-context aging)", async () => {
		await tool("memory_add", { content: "Currently wiring dunning emails", type: "active-context" });
		const { stdout, consoleLines } = await captureStdout(() =>
			tool("memory_add", { content: "Now working on the tenant worker pool", type: "active-context" }),
		);
		expect(stdout).toBe("");
		expect(consoleLines).toEqual([]);
	});
});
