/**
 * Unit tests for config.ts — validateId(), constants, and environment variable handling.
 *
 * In-process assertions see the preload sandbox (CODEXFI_LLM_BACKEND=claude-cli,
 * local embeddings, temp data dir). Precedence rules between env vars and
 * codexfi.jsonc are checked in fresh subprocesses (config is read at import time).
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, PLUGIN_SRC, TEST_DATA_DIR } from "../helpers/test-env.js";
import {
	validateId,
	DATA_DIR,
	DEDUP_DISTANCE,
	LLM_BACKEND,
	LLM_MODEL,
	STRUCTURAL_TYPES,
	VERSIONING_SKIP_TYPES,
} from "../../../plugin/src/config.js";
import * as configModule from "../../../plugin/src/config.js";
import { embedderInfo } from "../../../plugin/src/embedder.js";
import { EXTRACTION_SYSTEM, INIT_EXTRACTION_SYSTEM } from "../../../plugin/src/prompts.js";

// ── validateId() ────────────────────────────────────────────────────────────────

describe("validateId", () => {
	test("accepts alphanumeric IDs", () => {
		expect(validateId("abc123")).toBe("abc123");
	});

	test("accepts hyphens, underscores, colons, dots", () => {
		expect(validateId("project_a81f6c15:tag-1.0")).toBe("project_a81f6c15:tag-1.0");
	});

	test("accepts typical opencode project tags", () => {
		const tag = "opencode_project_a81f6c15048ce084a81f6c15";
		expect(validateId(tag, "user_id")).toBe(tag);
	});

	test("accepts user scope tags with email-like patterns", () => {
		// Dots, hyphens, underscores are allowed — but @ and + are NOT
		const tag = "user_clarkbalan_github.com_df3f3531";
		expect(validateId(tag, "user_id")).toBe(tag);
	});

	test("rejects empty string", () => {
		expect(() => validateId("")).toThrow("Invalid id");
	});

	test("rejects string with single quotes (SQL injection)", () => {
		expect(() => validateId("test'OR'1'='1")).toThrow("Invalid id");
	});

	test("rejects string with semicolons", () => {
		expect(() => validateId("test;DROP TABLE")).toThrow("Invalid id");
	});

	test("rejects string with parentheses", () => {
		expect(() => validateId("test()")).toThrow("Invalid id");
	});

	test("rejects string with spaces", () => {
		expect(() => validateId("hello world")).toThrow("Invalid id");
	});

	test("rejects string with backslash", () => {
		expect(() => validateId("path\\to\\file")).toThrow("Invalid id");
	});

	test("rejects string with angle brackets", () => {
		expect(() => validateId("<script>")).toThrow("Invalid id");
	});

	test("uses custom field name in error message", () => {
		expect(() => validateId("", "project_id")).toThrow("Invalid project_id");
	});
});

// ── Constants ───────────────────────────────────────────────────────────────────

describe("constants", () => {
	test("no remote embedding provider config is exported (local-only)", () => {
		const names = Object.keys(configModule);
		expect(names.filter((n) => /voyage|embedding_provider|xai|google|gemini/i.test(n))).toEqual([]);
	});

	test("DEDUP_DISTANCE is reasonable (0 < x < 1)", () => {
		expect(DEDUP_DISTANCE).toBeGreaterThan(0);
		expect(DEDUP_DISTANCE).toBeLessThan(1);
	});

	test("STRUCTURAL_TYPES contains expected types", () => {
		expect(STRUCTURAL_TYPES.has("project-brief")).toBe(true);
		expect(STRUCTURAL_TYPES.has("architecture")).toBe(true);
		expect(STRUCTURAL_TYPES.has("tech-context")).toBe(true);
		expect(STRUCTURAL_TYPES.has("product-context")).toBe(true);
		expect(STRUCTURAL_TYPES.has("project-config")).toBe(true);
	});

	test("STRUCTURAL_TYPES includes architecture-pattern (010 Phase 2)", () => {
		expect(STRUCTURAL_TYPES.has("architecture-pattern")).toBe(true);
	});

	test("STRUCTURAL_TYPES does not include transient types", () => {
		expect(STRUCTURAL_TYPES.has("session-summary")).toBe(false);
		expect(STRUCTURAL_TYPES.has("progress")).toBe(false);
		expect(STRUCTURAL_TYPES.has("conversation")).toBe(false);
	});
});

// ── VERSIONING_SKIP_TYPES ────────────────────────────────────────────────────────

describe("VERSIONING_SKIP_TYPES", () => {
	test("contains session-summary and progress (pre-existing)", () => {
		expect(VERSIONING_SKIP_TYPES.has("session-summary")).toBe(true);
		expect(VERSIONING_SKIP_TYPES.has("progress")).toBe(true);
	});

	test("contains active-context (010 Phase 1 — singleton aging)", () => {
		expect(VERSIONING_SKIP_TYPES.has("active-context")).toBe(true);
	});
});

// ── Extraction prompts ───────────────────────────────────────────────────────────

describe("extraction prompts", () => {
	test("EXTRACTION_SYSTEM includes project-config type", () => {
		expect(EXTRACTION_SYSTEM).toContain('"project-config"');
	});

	test("INIT_EXTRACTION_SYSTEM includes project-config type", () => {
		expect(INIT_EXTRACTION_SYSTEM).toContain('"project-config"');
	});

	test("EXTRACTION_SYSTEM includes all expected memory types", () => {
		const expectedTypes = [
			'"project-brief"',
			'"architecture"',
			'"tech-context"',
			'"project-config"',
			'"product-context"',
			'"session-summary"',
			'"progress"',
			'"error-solution"',
			'"preference"',
			'"learned-pattern"',
		];
		for (const type of expectedTypes) {
			expect(EXTRACTION_SYSTEM).toContain(type);
		}
	});

	test("EXTRACTION_SYSTEM includes new types from 010 (active-context, architecture-pattern)", () => {
		expect(EXTRACTION_SYSTEM).toContain('"active-context"');
		expect(EXTRACTION_SYSTEM).toContain('"architecture-pattern"');
	});

	test("INIT_EXTRACTION_SYSTEM does NOT include active-context or architecture-pattern", () => {
		// These types only make sense in conversation context, not static file analysis
		expect(INIT_EXTRACTION_SYSTEM).not.toContain('"active-context"');
		expect(INIT_EXTRACTION_SYSTEM).not.toContain('"architecture-pattern"');
	});
});

// ── Sandbox values (in-process) ─────────────────────────────────────────────────

describe("runtime configuration (sandbox)", () => {
	test("DATA_DIR comes from CODEXFI_DATA_DIR", () => {
		expect(DATA_DIR).toBe(TEST_DATA_DIR);
	});

	test("LLM_BACKEND honours CODEXFI_LLM_BACKEND", () => {
		expect(LLM_BACKEND).toBe("claude-cli");
	});

	test("LLM_MODEL defaults to the haiku alias", () => {
		expect(LLM_MODEL).toBe("haiku");
	});

	test("embedder provider is local (no key needed)", () => {
		expect(embedderInfo().provider).toBe("local");
	});
});

// ── Env vs codexfi.jsonc precedence (subprocess) ────────────────────────────────

/**
 * Import config.ts in a fresh Bun process with HOME pointing at a temp dir
 * holding `fileConfig` as ~/.codexfi/codexfi.jsonc, and the given env.
 */
async function probeConfig(fileConfig: Record<string, unknown> | null, env: Record<string, string>) {
	const home = makeTempDir("cfg-home");
	if (fileConfig) {
		mkdirSync(join(home, ".codexfi"), { recursive: true });
		writeFileSync(join(home, ".codexfi", "codexfi.jsonc"), `// test config\n${JSON.stringify(fileConfig, null, 2)}\n`);
	}
	const script = `
		const c = await import(${JSON.stringify(join(PLUGIN_SRC, "config.ts"))});
		const e = await import(${JSON.stringify(join(PLUGIN_SRC, "embedder.ts"))});
		const info = e.embedderInfo();
		console.log(JSON.stringify({
			backend: c.LLM_BACKEND, model: c.LLM_MODEL, provider: info.provider, embedModel: info.id,
			hasAnthropicKey: c.ANTHROPIC_API_KEY.length > 0,
			dataDir: c.DATA_DIR,
		}));
	`;
	const baseEnv: Record<string, string> = { ...(process.env as Record<string, string>), HOME: home };
	for (const k of ["CODEXFI_LLM_BACKEND", "CODEXFI_LLM_MODEL", "CODEXFI_EMBEDDING_PROVIDER", "ANTHROPIC_API_KEY", "VOYAGE_API_KEY"]) {
		delete baseEnv[k];
	}
	const proc = Bun.spawn(["bun", "-e", script], { cwd: home, env: { ...baseEnv, ...env }, stdout: "pipe", stderr: "pipe" });
	const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	await proc.exited;
	if (proc.exitCode !== 0) throw new Error(`config probe failed: ${err}`);
	return JSON.parse(out.trim().split("\n").pop()!) as {
		backend: string; model: string; provider: string; embedModel: string; hasAnthropicKey: boolean; dataDir: string;
	};
}

describe("config precedence (fresh process)", () => {
	test("defaults with no config file: auto backend, haiku, local embeddings, no keys", async () => {
		const r = await probeConfig(null, {});
		expect(r).toMatchObject({ backend: "auto", model: "haiku", provider: "local", hasAnthropicKey: false });
	}, 15_000);

	test("codexfi.jsonc llmBackend / llmModel are honoured", async () => {
		const r = await probeConfig({ llmBackend: "anthropic-api", llmModel: "sonnet" }, {});
		expect(r).toMatchObject({ backend: "anthropic-api", model: "sonnet", provider: "local" });
	}, 15_000);

	// Pre-1.0 configs may still carry remote-embedding settings; they must be ignored.
	test("legacy embeddingProvider / voyageApiKey (file or env) are ignored: embeddings stay local", async () => {
		const r = await probeConfig(
			{ embeddingProvider: "voyage", voyageApiKey: "test-legacy-placeholder" },
			{ CODEXFI_EMBEDDING_PROVIDER: "voyage", VOYAGE_API_KEY: "test-legacy-placeholder" },
		);
		expect(r.provider).toBe("local");
		expect(r.embedModel).toStartWith("local:");
	}, 15_000);

	test("env vars override the file; an invalid CODEXFI_LLM_BACKEND falls back to the file", async () => {
		const file = { llmBackend: "anthropic-api", llmModel: "sonnet" };
		const r = await probeConfig(file, { CODEXFI_LLM_BACKEND: "claude-cli", CODEXFI_LLM_MODEL: "opus" });
		expect(r).toMatchObject({ backend: "claude-cli", model: "opus" });
		const bad = await probeConfig(file, { CODEXFI_LLM_BACKEND: "xyz" });
		expect(bad.backend).toBe("anthropic-api");
	}, 15_000);

	test("an invalid llmBackend in the file falls back to auto", async () => {
		const r = await probeConfig({ llmBackend: "something-else" }, {});
		expect(r.backend).toBe("auto");
	}, 15_000);

	test("API keys from codexfi.jsonc are picked up", async () => {
		const r = await probeConfig({ anthropicApiKey: "test-anthropic-placeholder" }, {});
		expect(r.hasAnthropicKey).toBe(true);
	}, 15_000);

	// Regression: plugin-config.ts defaults missing keys to "", so config.ts must
	// fall back with `||` (a `??` there silently ignored the env vars).
	test("ANTHROPIC_API_KEY env var is used when the file has no key", async () => {
		const r = await probeConfig(null, { ANTHROPIC_API_KEY: "test-anthropic-placeholder" });
		expect(r.hasAnthropicKey).toBe(true);
	}, 15_000);
});
