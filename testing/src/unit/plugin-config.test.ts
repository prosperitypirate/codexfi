/**
 * Unit tests for plugin-config.ts — config path, writeApiKeys(), JSONC loading.
 *
 * CONFIG_DIR is computed from homedir() at import time. The preload sandbox
 * points homedir() at a temp HOME, so writeApiKeys() writes there and the
 * developer's real ~/.codexfi/codexfi.jsonc is never read or written.
 *
 * Loading (comment stripping, defaults, filtering) is checked in fresh
 * subprocesses with their own temp HOME, since the file is read once at import.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_DIR, PLUGIN_CONFIG, writeApiKeys, getConfigPath, isConfigured } from "../../../plugin/src/plugin-config.js";
import { makeTempDir, PLUGIN_SRC, SANDBOX } from "../helpers/test-env.js";

const CODEXFI_JSONC = join(CONFIG_DIR, "codexfi.jsonc");

/** Parse the generated JSONC the same way the plugin does (full-line comments only). */
function parseGenerated(text: string): Record<string, unknown> {
	return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

// ── Sandbox guard ───────────────────────────────────────────────────────────────

describe("sandbox", () => {
	test("CONFIG_DIR lives inside the test sandbox, never the real home", () => {
		expect(CONFIG_DIR.startsWith(SANDBOX)).toBe(true);
		expect(CONFIG_DIR).toEndWith(".codexfi");
	});
});

// ── Config path ─────────────────────────────────────────────────────────────────

describe("getConfigPath", () => {
	test("is ~/.codexfi/codexfi.jsonc", () => {
		expect(getConfigPath()).toBe(CODEXFI_JSONC);
		expect(getConfigPath()).toEndWith("/.codexfi/codexfi.jsonc");
	});

	test("is not a legacy OpenCode / memory.* path", () => {
		expect(getConfigPath()).not.toContain(".config/opencode");
		expect(getConfigPath()).not.toMatch(/memory\.jsonc?$/);
	});
});

// ── writeApiKeys() ──────────────────────────────────────────────────────────────

describe("writeApiKeys", () => {
	beforeEach(() => {
		rmSync(CODEXFI_JSONC, { force: true });
	});

	test("creates codexfi.jsonc (and the directory) with the given key", () => {
		writeApiKeys({ anthropicApiKey: "sk-ant-unit-test-key-12345" });
		expect(existsSync(CODEXFI_JSONC)).toBe(true);
		expect(existsSync(join(CONFIG_DIR, "memory.jsonc"))).toBe(false);
		expect(readFileSync(CODEXFI_JSONC, "utf-8")).toContain("sk-ant-unit-test-key-12345");
	});

	test("generated file is valid JSON once comments are stripped", () => {
		writeApiKeys({ anthropicApiKey: "sk-test", llmBackend: "anthropic-api" });
		const parsed = parseGenerated(readFileSync(CODEXFI_JSONC, "utf-8"));
		expect(parsed.anthropicApiKey).toBe("sk-test");
		expect(parsed.llmBackend).toBe("anthropic-api");
	});

	test("defaults: llmBackend auto, empty optional key", () => {
		writeApiKeys({});
		const parsed = parseGenerated(readFileSync(CODEXFI_JSONC, "utf-8"));
		expect(parsed.llmBackend).toBe("auto");
		expect(parsed.anthropicApiKey).toBe("");
	});

	test("does not emit removed settings (extractionProvider, embedding provider/remote key)", () => {
		writeApiKeys({ anthropicApiKey: "sk-x" });
		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).not.toContain("extractionProvider");
		expect(content).not.toContain("embeddingProvider");
		expect(content.toLowerCase()).not.toContain("voyage");
	});

	test("header references codexfi.jsonc", () => {
		writeApiKeys({ anthropicApiKey: "sk-header-check" });
		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("codexfi.jsonc");
		expect(content).not.toContain("memory.jsonc");
	});

	test("updating keys preserves earlier keys and non-default settings", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writeFileSync(
			CODEXFI_JSONC,
			`// hand-written\n{\n  "anthropicApiKey": "sk-ant-initial",\n  "maxMemories": 7,\n  "memoryBank": "off",\n  "excludePaths": ["/secret"],\n  "llmModel": "sonnet"\n}\n`,
		);
		writeApiKeys({ llmBackend: "anthropic-api" });
		const parsed = parseGenerated(readFileSync(CODEXFI_JSONC, "utf-8"));
		expect(parsed.anthropicApiKey).toBe("sk-ant-initial");
		expect(parsed.llmBackend).toBe("anthropic-api");
		expect(parsed.maxMemories).toBe(7);
		expect(parsed.memoryBank).toBe("off");
		expect(parsed.excludePaths).toEqual(["/secret"]);
		expect(parsed.llmModel).toBe("sonnet");
	});

	test("legacy remote-embedding keys in an existing file are dropped on rewrite", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writeFileSync(
			CODEXFI_JSONC,
			`{\n  "embeddingProvider": "voyage",\n  "voyageApiKey": "pa-legacy-placeholder",\n  "llmModel": "sonnet"\n}\n`,
		);
		writeApiKeys({});
		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).not.toContain("pa-legacy-placeholder");
		expect(content).not.toContain("embeddingProvider");
		expect(content.toLowerCase()).not.toContain("voyage");
		expect(parseGenerated(content).llmModel).toBe("sonnet");
	});

	test("default-valued settings are omitted (minimal file)", () => {
		writeApiKeys({});
		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).not.toContain("maxMemories");
		expect(content).not.toContain("memoryBank");
		expect(content).not.toContain("autoInit");
	});

	test("written file contains only ASCII characters", () => {
		writeApiKeys({ anthropicApiKey: "sk-ant-ascii-test" });
		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		for (let i = 0; i < content.length; i++) {
			const code = content.charCodeAt(i);
			const ok = (code >= 0x20 && code <= 0x7e) || code === 0x09 || code === 0x0a || code === 0x0d;
			if (!ok) throw new Error(`Non-ASCII U+${code.toString(16)} at ${i}`);
		}
	});
});

// ── In-process defaults (sandbox has no config file at import time) ────────────

describe("PLUGIN_CONFIG defaults", () => {
	test("zero-config defaults", () => {
		expect(isConfigured()).toBe(true);
		expect(PLUGIN_CONFIG.memoryBank).toBe("auto");
		expect(PLUGIN_CONFIG.autoInit).toBe(true);
		expect(PLUGIN_CONFIG.excludePaths).toEqual([]);
		expect(PLUGIN_CONFIG.containerTagPrefix).toBe("opencode"); // legacy key prefix, kept on purpose
		// Thresholds are model-specific (embedder.ts activeThresholds); the config
		// only carries explicit user overrides.
		expect(PLUGIN_CONFIG.similarityThreshold).toBeUndefined();
		expect(PLUGIN_CONFIG.displaySimilarityThreshold).toBeUndefined();
		expect(PLUGIN_CONFIG.maxStructuredMemories).toBe(100);
		expect(PLUGIN_CONFIG.keywordPatterns).toContain("remember");
	});
});

// ── Loading codexfi.jsonc (fresh process) ───────────────────────────────────────

async function loadInFreshProcess(jsonc: string): Promise<Record<string, unknown>> {
	const home = makeTempDir("pc-home");
	mkdirSync(join(home, ".codexfi"), { recursive: true });
	writeFileSync(join(home, ".codexfi", "codexfi.jsonc"), jsonc);
	const script = `const m = await import(${JSON.stringify(join(PLUGIN_SRC, "plugin-config.ts"))}); console.log(JSON.stringify(m.PLUGIN_CONFIG));`;
	const proc = Bun.spawn(["bun", "-e", script], { cwd: home, env: { ...process.env, HOME: home }, stdout: "pipe", stderr: "pipe" });
	const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	await proc.exited;
	if (proc.exitCode !== 0) throw new Error(err);
	return JSON.parse(out.trim().split("\n").pop()!);
}

describe("loading codexfi.jsonc", () => {
	test("strips line and block comments; applies overrides", async () => {
		const cfg = await loadInFreshProcess(`// Codexfi
{
	/* block comment */
	"memoryBank": "off",
	"autoInit": false,
	// line comment
	"maxMemories": 5,
	"excludePaths": ["/private/work", "", 42]
}
`);
		expect(cfg.memoryBank).toBe("off");
		expect(cfg.autoInit).toBe(false);
		expect(cfg.maxMemories).toBe(5);
		// Non-string / empty entries are dropped.
		expect(cfg.excludePaths).toEqual(["/private/work"]);
	}, 15_000);

	test("unknown memoryBank values fall back to auto", async () => {
		const cfg = await loadInFreshProcess(`{ "memoryBank": "sometimes" }`);
		expect(cfg.memoryBank).toBe("auto");
	}, 15_000);

	test("custom keywordPatterns are appended; invalid regexes are dropped", async () => {
		const cfg = await loadInFreshProcess(`{ "keywordPatterns": ["pin\\\\s+this", "([unclosed"] }`);
		const patterns = cfg.keywordPatterns as string[];
		expect(patterns).toContain("remember");
		expect(patterns).toContain("pin\\s+this");
		expect(patterns).not.toContain("([unclosed");
	}, 15_000);

	test("a malformed file is ignored (defaults apply)", async () => {
		const cfg = await loadInFreshProcess(`{ this is not json`);
		expect(cfg.memoryBank).toBe("auto");
		expect(cfg.maxMemories).toBe(20);
	}, 15_000);
});
