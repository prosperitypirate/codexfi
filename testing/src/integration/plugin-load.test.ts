/**
 * Integration test: the shipped Claude Code plugin bundle.
 *
 * Claude Code runs codexfi through plugin/scripts/run.sh, which execs
 * plugin/dist/codexfi.js (a single `bun build --target node` bundle with
 * @huggingface/transformers kept external) under Bun, or Node >= 22.5 when Bun
 * is absent. This suite spawns that bundle exactly like the plugin does, from
 * an external cwd with no node_modules, under BOTH runtimes:
 *
 *   --version              loads at all (a static `bun:` import would break Node — #198)
 *   hook stop              reads the payload on stdin, enqueues a job, prints nothing, exits 0 fast
 *   hook session-start     source "resume" prints nothing
 *   mcp                    answers initialize / tools/list over stdio JSON-RPC
 *
 * plus static checks of the bundle and of hooks.json / plugin.json wiring.
 *
 * The bundle must be built first: `cd plugin && npm run build`. Children inherit
 * the sandbox env (temp HOME, CODEXFI_NO_WORKER=1, fake claude binary) and get
 * their own temp CODEXFI_DATA_DIR. No test calls a tool that would embed text
 * (that would load the real transformers runtime).
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeAll } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import pkg from "../../../plugin/package.json";
import { makeTempDir, PLUGIN_DIR } from "../helpers/test-env.js";

const BUNDLE = join(PLUGIN_DIR, "dist", "codexfi.js");
const RUN_SH = join(PLUGIN_DIR, "scripts", "run.sh");
const RUNTIMES = ["bun", "node"] as const;
type Runtime = (typeof RUNTIMES)[number];

interface Result { code: number | null; stdout: string; stderr: string; ms: number; dataDir: string }

async function run(cmd: string[], opts: { stdin?: string; env?: Record<string, string> } = {}): Promise<Result> {
	const cwd = makeTempDir("ext-cwd"); // external cwd, no node_modules
	const dataDir = makeTempDir("bundle-data");
	const started = Date.now();
	const proc = Bun.spawn(cmd, {
		cwd,
		stdin: opts.stdin !== undefined ? new TextEncoder().encode(opts.stdin) : "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, CODEXFI_DATA_DIR: dataDir, ...opts.env },
	});
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	await proc.exited;
	return { code: proc.exitCode, stdout, stderr, ms: Date.now() - started, dataDir };
}

const runBundle = (runtime: Runtime, args: string[], opts?: Parameters<typeof run>[1]) =>
	run(runtime === "node" ? ["node", "--no-warnings", BUNDLE, ...args] : ["bun", BUNDLE, ...args], opts);

function explain(r: Result): string {
	return `exit=${r.code}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`;
}

beforeAll(() => {
	if (!existsSync(BUNDLE)) {
		throw new Error(`Missing ${BUNDLE} — build it first: cd plugin && npm run build`);
	}
});

// ── Static bundle checks ────────────────────────────────────────────────────────

describe("bundle contents", () => {
	const src = () => readFileSync(BUNDLE, "utf8");

	test("is a single self-contained file with no static bun: imports", () => {
		expect(src()).not.toMatch(/^\s*import[^;]*from\s+["']bun:/m);
		expect(src()).not.toMatch(/require\(["']bun:/);
	});

	test("keeps @huggingface/transformers external (dynamic import, not inlined)", () => {
		expect(src()).toContain('import("@huggingface/transformers")');
		expect(src()).not.toContain("onnxruntime-web");
	});
});

// ── Runtime checks (both runtimes) ──────────────────────────────────────────────

for (const runtime of RUNTIMES) {
	describe(`bundle under ${runtime}`, () => {
		test("--version prints the package version from an external cwd", async () => {
			const r = await runBundle(runtime, ["--version"]);
			expect(r.code, explain(r)).toBe(0);
			expect(r.stdout.trim()).toBe(pkg.version);
			expect(r.stderr).not.toContain("protocol 'bun:'");
		}, 30_000);

		test("hook stop: reads the payload, enqueues a turn job, prints nothing, exits 0 fast", async () => {
			const payload = JSON.stringify({
				session_id: "bundle-session",
				transcript_path: "/tmp/does-not-matter.jsonl",
				cwd: "/tmp/codexfi-bundle-project",
				hook_event_name: "Stop",
			});
			const r = await runBundle(runtime, ["hook", "stop"], { stdin: payload });
			expect(r.code, explain(r)).toBe(0);
			expect(r.stdout).toBe("");
			expect(r.ms).toBeLessThan(5_000); // Stop hook timeout is 5 s; typically ~100 ms
			const queue = readdirSync(join(r.dataDir, "queue"));
			expect(queue).toHaveLength(1);
			const job = JSON.parse(readFileSync(join(r.dataDir, "queue", queue[0]!), "utf8"));
			expect(job).toMatchObject({ kind: "turn", sessionId: "bundle-session", cwd: "/tmp/codexfi-bundle-project" });
		}, 30_000);

		test("hook stop with garbage stdin still exits 0 silently", async () => {
			const r = await runBundle(runtime, ["hook", "stop"], { stdin: "not json at all" });
			expect(r.code, explain(r)).toBe(0);
			expect(r.stdout).toBe("");
		}, 30_000);

		test("CODEXFI_DISABLE=1 makes every hook a silent no-op", async () => {
			const r = await runBundle(runtime, ["hook", "stop"], {
				stdin: JSON.stringify({ session_id: "s", transcript_path: "/t.jsonl", cwd: "/tmp" }),
				env: { CODEXFI_DISABLE: "1" },
			});
			expect(r.code, explain(r)).toBe(0);
			expect(r.stdout).toBe("");
			expect(existsSync(join(r.dataDir, "queue"))).toBe(false);
		}, 30_000);

		test('hook session-start with source "resume" prints nothing', async () => {
			const r = await runBundle(runtime, ["hook", "session-start"], {
				stdin: JSON.stringify({ session_id: "s", source: "resume", cwd: "/tmp" }),
			});
			expect(r.code, explain(r)).toBe(0);
			expect(r.stdout).toBe("");
		}, 30_000);
	});
}

describe("mcp server (node)", () => {
	test("answers initialize and tools/list as newline-delimited JSON-RPC, then exits on EOF", async () => {
		const lines = [
			{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		].map((m) => JSON.stringify(m)).join("\n") + "\nnot json\n";
		const r = await runBundle("node", ["mcp"], { stdin: lines });
		expect(r.code, explain(r)).toBe(0);
		const replies = r.stdout.trim().split("\n").map((l) => JSON.parse(l));
		expect(replies).toHaveLength(3); // the notification gets no reply
		expect(replies[0].id).toBe(1);
		expect(replies[0].result.serverInfo.name).toBe("codexfi");
		expect(typeof replies[0].result.instructions).toBe("string");
		expect(replies[1].result.tools.map((t: { name: string }) => t.name)).toEqual(["memory_search", "memory_add", "memory_list", "memory_forget"]);
		expect(replies[2]).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
	}, 30_000);
});

// ── Launcher + manifests ────────────────────────────────────────────────────────

describe("scripts/run.sh launcher", () => {
	test("runs the bundle (default runtime)", async () => {
		const r = await run(["sh", RUN_SH, "--version"]);
		expect(r.code, explain(r)).toBe(0);
		expect(r.stdout.trim()).toBe(pkg.version);
	}, 30_000);

	test("CODEXFI_RUNTIME=node forces Node", async () => {
		const r = await run(["sh", RUN_SH, "--version"], { env: { CODEXFI_RUNTIME: "node" } });
		expect(r.code, explain(r)).toBe(0);
		expect(r.stdout.trim()).toBe(pkg.version);
	}, 30_000);
});

describe("plugin manifests", () => {
	const hooks = JSON.parse(readFileSync(join(PLUGIN_DIR, "hooks", "hooks.json"), "utf8")) as {
		hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
	};
	const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"), "utf8")) as {
		name: string;
		mcpServers: Record<string, { command: string; args: string[] }>;
	};

	const EXPECTED: Record<string, string> = {
		SessionStart: "session-start",
		UserPromptSubmit: "user-prompt-submit",
		Stop: "stop",
		PreCompact: "pre-compact",
		SessionEnd: "session-end",
	};

	test("hooks.json registers exactly the five handled events via run.sh", () => {
		expect(Object.keys(hooks.hooks).sort()).toEqual(Object.keys(EXPECTED).sort());
		for (const [event, sub] of Object.entries(EXPECTED)) {
			const cmds = hooks.hooks[event]!.flatMap((m) => m.hooks);
			expect(cmds).toHaveLength(1);
			expect(cmds[0]!.type).toBe("command");
			expect(cmds[0]!.command).toBe(`sh "\${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" hook ${sub}`);
		}
	});

	test("the write hooks keep short timeouts (they only enqueue)", () => {
		for (const event of ["Stop", "PreCompact"]) {
			expect(hooks.hooks[event]![0]!.hooks[0]!.timeout).toBeLessThanOrEqual(5);
		}
	});

	test("plugin.json starts the MCP server through run.sh", () => {
		expect(manifest.name).toBe("codexfi");
		expect(manifest.mcpServers.codexfi).toEqual({ command: "sh", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/run.sh", "mcp"] });
	});
});
