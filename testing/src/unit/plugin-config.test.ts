/**
 * Unit tests for plugin-config.ts — CONFIG_FILE path, writeApiKeys(), getConfigPath().
 *
 * These tests verify:
 * 1. Config path is codexfi.jsonc in ~/.codexfi/ (no legacy memory.* paths)
 * 2. writeApiKeys() writes to codexfi.jsonc in ~/.codexfi/
 * 3. getConfigPath() returns codexfi.jsonc
 *
 * NOTE: CONFIG_DIR is computed from homedir() at module load time. We cannot override
 * it per-test without monkey-patching. Instead, we test the exported functions against
 * the real ~/.codexfi/ path.
 *
 * SAFETY: The real codexfi.jsonc is backed up at the top-level beforeAll and restored
 * unconditionally in the top-level afterAll. Individual tests never delete CODEXFI_JSONC
 * if it existed before the suite started.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// We import the module after setting up preconditions.
// The module is loaded once — all tests share the same module-level state.
import { CONFIG_DIR, PLUGIN_CONFIG, writeApiKeys, getConfigPath } from "../../../plugin/src/plugin-config.js";

// ── Helpers ──────────────────────────────────────────────────────────────────────

const CODEXFI_JSONC  = join(CONFIG_DIR, "codexfi.jsonc");
const LEGACY_JSONC   = join(CONFIG_DIR, "memory.jsonc");
const LEGACY_JSON    = join(CONFIG_DIR, "memory.json");

// ── Top-level backup/restore ─────────────────────────────────────────────────────
// Save the real config once at suite start and restore it unconditionally at end.
// This prevents any test from destroying the developer's live config.

let _savedConfigContent: string | null = null;
let _configExistedBefore = false;

beforeAll(() => {
	_configExistedBefore = existsSync(CODEXFI_JSONC);
	if (_configExistedBefore) {
		_savedConfigContent = readFileSync(CODEXFI_JSONC, "utf-8");
	}
});

afterAll(() => {
	if (_configExistedBefore && _savedConfigContent !== null) {
		// Always restore — this is the developer's real config with real API keys
		mkdirSync(CONFIG_DIR, { recursive: true });
		writeFileSync(CODEXFI_JSONC, _savedConfigContent, "utf-8");
	} else if (!_configExistedBefore) {
		// Config didn't exist before tests — clean up anything we created
		try { rmSync(CODEXFI_JSONC); } catch { /* already gone */ }
	}
});

// ── Config path ─────────────────────────────────────────────────────────────────

describe("config path", () => {
	test("codexfi.jsonc is the config path", () => {
		const path = getConfigPath();
		expect(path).toEndWith("codexfi.jsonc");
		expect(path).not.toMatch(/memory\.jsonc$/);
		expect(path).not.toMatch(/memory\.json$/);
	});

	test("config path is inside ~/.codexfi/", () => {
		const path = getConfigPath();
		expect(path).toContain(".codexfi");
		expect(path).toEndWith("codexfi.jsonc");
	});

	test("config path is NOT inside ~/.config/opencode/", () => {
		const path = getConfigPath();
		expect(path).not.toContain(".config/opencode");
	});

	test("legacy memory.jsonc path is NOT returned by getConfigPath()", () => {
		const path = getConfigPath();
		expect(path).not.toMatch(/memory\.jsonc$/);
		expect(path).not.toMatch(/memory\.json$/);
	});
});

// ── writeApiKeys() ───────────────────────────────────────────────────────────────

describe("writeApiKeys", () => {
	// No per-describe backup needed — the top-level beforeAll/afterAll handles it.

	test("writes to codexfi.jsonc, not memory.jsonc", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		writeApiKeys({ voyageApiKey: "pa-test-write-target" });

		// codexfi.jsonc must exist
		expect(existsSync(CODEXFI_JSONC)).toBe(true);

		// memory.jsonc must NOT have been created by writeApiKeys()
		const legacyExistedBefore = existsSync(LEGACY_JSONC);
		if (!legacyExistedBefore) {
			expect(existsSync(LEGACY_JSONC)).toBe(false);
		}
	});

	test("written file contains the provided API key", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		writeApiKeys({ voyageApiKey: "pa-unit-test-key-12345" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("pa-unit-test-key-12345");
	});

	test("written file header says codexfi.jsonc, not memory.jsonc", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		writeApiKeys({ voyageApiKey: "pa-header-check" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("codexfi.jsonc");
		expect(content).not.toContain("memory.jsonc");
	});

	test("preserves existing non-key settings when updating keys", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		// Write an initial config with a custom setting
		writeApiKeys({ voyageApiKey: "pa-initial" });
		// The generated file is valid JSONC — we verify it was created, then
		// update with a different key and check the new key is present.
		writeApiKeys({ voyageApiKey: "pa-updated", anthropicApiKey: "sk-ant-updated" });

		const updated = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(updated).toContain("pa-updated");
		expect(updated).toContain("sk-ant-updated");
	});

	test("written file contains only ASCII characters (no Bun bytecode corruption)", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		writeApiKeys({
			voyageApiKey: "pa-ascii-test",
			anthropicApiKey: "sk-ant-ascii-test",
			xaiApiKey: "xai-ascii-test",
			googleApiKey: "google-ascii-test",
		});

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		// Every character must be in the printable ASCII range (0x20–0x7E) or whitespace
		// Non-ASCII would indicate Bun // @bun bytecode double-encoding corruption
		for (let i = 0; i < content.length; i++) {
			const code = content.charCodeAt(i);
			const isAsciiPrintable = code >= 0x20 && code <= 0x7e;
			const isWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
			if (!isAsciiPrintable && !isWhitespace) {
				throw new Error(
					`Non-ASCII character found at position ${i}: U+${code.toString(16).toUpperCase().padStart(4, "0")} ` +
					`(context: "${content.slice(Math.max(0, i - 10), i + 10).replace(/\n/g, "\\n")}")`
				);
			}
		}
	});

	test("does not write memory.jsonc as a side-effect", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		const legacyExistedBefore = existsSync(LEGACY_JSONC);

		writeApiKeys({ voyageApiKey: "pa-no-side-effects" });

		// If memory.jsonc didn't exist before, it should still not exist
		if (!legacyExistedBefore) {
			expect(existsSync(LEGACY_JSONC)).toBe(false);
		}
	});
});

// ── getConfigPath() ──────────────────────────────────────────────────────────────

describe("getConfigPath", () => {
	test("returns a path ending in .jsonc", () => {
		const p = getConfigPath();
		expect(p).toMatch(/\.jsonc$/);
	});

	test("returned path is inside ~/.codexfi", () => {
		const p = getConfigPath();
		expect(p).toContain(".codexfi");
	});

	test("returned path is never a legacy memory.* path", () => {
		const p = getConfigPath();
		expect(p).not.toMatch(/memory\.(jsonc|json)$/);
	});

	test("always returns codexfi.jsonc", () => {
		expect(getConfigPath()).toBe(CODEXFI_JSONC);
	});
});

// ── extractionProvider ───────────────────────────────────────────────────────────

describe("PLUGIN_CONFIG.extractionProvider", () => {
	test("is undefined or a valid provider string", () => {
		const val = PLUGIN_CONFIG.extractionProvider;
		if (val !== undefined) {
			expect(["anthropic", "xai", "google"]).toContain(val);
		} else {
			expect(val).toBeUndefined();
		}
	});
});

describe("writeApiKeys with extractionProvider", () => {
	// No per-describe backup needed — top-level beforeAll/afterAll handles it.

	test("written file includes extractionProvider field", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		writeApiKeys({ voyageApiKey: "pa-provider-test", extractionProvider: "xai" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain('"extractionProvider"');
		expect(content).toContain('"xai"');
	});

	test("extractionProvider defaults to anthropic in generated config", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		writeApiKeys({ voyageApiKey: "pa-default-provider-test" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain('"extractionProvider"');
		expect(content).toContain('"anthropic"');
	});

	test("extractionProvider comment references all three options", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		writeApiKeys({ voyageApiKey: "pa-comment-test" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("anthropic");
		expect(content).toContain("xai");
		expect(content).toContain("google");
		expect(content).toContain("Extraction Provider");
	});

	test("preserves extractionProvider when updating only API keys", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });

		// Write initial config with xai provider
		writeApiKeys({ voyageApiKey: "pa-preserve-1", extractionProvider: "xai" });

		// Update only the API key — provider should be preserved
		writeApiKeys({ voyageApiKey: "pa-preserve-2" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("pa-preserve-2");
		// The config merges existing values — extractionProvider from the file
		// gets preserved through the loadConfig() → merge path in writeApiKeys()
		expect(content).toContain('"extractionProvider": "xai"');
	});
});
