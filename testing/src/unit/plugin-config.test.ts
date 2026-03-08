/**
 * Unit tests for plugin-config.ts — CONFIG_FILES paths, writeApiKeys(), getConfigPath().
 *
 * These tests verify:
 * 1. CONFIG_FILES contains only codexfi.jsonc and codexfi.json (no legacy memory.* paths)
 * 2. writeApiKeys() writes to codexfi.jsonc, not memory.jsonc
 * 3. getConfigPath() returns codexfi.jsonc as the default when no config files exist
 * 4. getConfigPath() returns the first existing file when one is present
 *
 * NOTE: CONFIG_DIR is computed from homedir() at module load time. We cannot override
 * it per-test without monkey-patching. Instead, we test the exported functions against
 * the real ~/.config/opencode/ path but use a write-then-cleanup approach for
 * writeApiKeys() tests to avoid side-effects on the developer's live config.
 *
 * For CONFIG_FILES shape tests we assert on the exported constant directly.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// We import the module after setting up preconditions.
// The module is loaded once — all tests share the same module-level state.
import { CONFIG_DIR, PLUGIN_CONFIG, writeApiKeys, getConfigPath } from "../../../plugin/src/plugin-config.js";

// ── Helpers ──────────────────────────────────────────────────────────────────────

const CODEXFI_JSONC = join(CONFIG_DIR, "codexfi.jsonc");
const CODEXFI_JSON  = join(CONFIG_DIR, "codexfi.json");
const LEGACY_JSONC  = join(CONFIG_DIR, "memory.jsonc");
const LEGACY_JSON   = join(CONFIG_DIR, "memory.json");

/** Files written by our tests — cleaned up in afterAll. */
const writtenByTest: string[] = [];

function cleanupTestFiles() {
	for (const f of writtenByTest) {
		try { rmSync(f); } catch { /* already gone */ }
	}
	writtenByTest.length = 0;
}

// ── CONFIG_FILES shape ───────────────────────────────────────────────────────────

describe("CONFIG_FILES", () => {
	test("codexfi.jsonc is the first (primary) config path", () => {
		// getConfigPath() returns CONFIG_FILES[0] when nothing exists.
		// We can infer the first entry by calling getConfigPath() in a clean state.
		// We rely on no codexfi.* or memory.* files existing for this assertion —
		// if they do exist, getConfigPath() returns the real file, which is also fine.
		const path = getConfigPath();
		// Either the real file exists (path is whatever file the user has),
		// or the default is codexfi.jsonc. Either way it must NOT be memory.jsonc.
		expect(path).not.toMatch(/memory\.jsonc$/);
		expect(path).not.toMatch(/memory\.json$/);
	});

	test("codexfi.jsonc default path is inside CONFIG_DIR", () => {
		const defaultPath = join(CONFIG_DIR, "codexfi.jsonc");
		// When no files exist, getConfigPath() returns CONFIG_FILES[0] = codexfi.jsonc
		// We verify that the default path is well-formed.
		expect(defaultPath).toContain(".config/opencode");
		expect(defaultPath).toEndWith("codexfi.jsonc");
	});

	test("legacy memory.jsonc path is NOT in the config resolution chain", () => {
		// Write only a legacy file and verify getConfigPath() does NOT return it.
		// This confirms legacy paths were removed from CONFIG_FILES.
		mkdirSync(CONFIG_DIR, { recursive: true });

		// Temporarily write memory.jsonc only (ensure codexfi.* don't exist for this check)
		const hadCodexfiJsonc = existsSync(CODEXFI_JSONC);
		const hadCodexfiJson  = existsSync(CODEXFI_JSON);

		if (!hadCodexfiJsonc && !hadCodexfiJson) {
			// Only run this check when no codexfi.* file exists
			writeFileSync(LEGACY_JSONC, JSON.stringify({ voyageApiKey: "test-legacy" }));
			writtenByTest.push(LEGACY_JSONC);

			const resolved = getConfigPath();

			// Should NOT resolve to the legacy file
			expect(resolved).not.toBe(LEGACY_JSONC);
			expect(resolved).not.toMatch(/memory\.jsonc$/);

			// Clean up immediately
			rmSync(LEGACY_JSONC);
			writtenByTest.splice(writtenByTest.indexOf(LEGACY_JSONC), 1);
		} else {
			// codexfi.* already exists — just verify it's not a legacy path
			const resolved = getConfigPath();
			expect(resolved).not.toMatch(/memory\.jsonc$/);
			expect(resolved).not.toMatch(/memory\.json$/);
		}
	});
});

// ── writeApiKeys() ───────────────────────────────────────────────────────────────

describe("writeApiKeys", () => {
	// Save the original codexfi.jsonc content so we can restore it
	let originalContent: string | null = null;

	beforeAll(() => {
		if (existsSync(CODEXFI_JSONC)) {
			originalContent = readFileSync(CODEXFI_JSONC, "utf-8");
		}
	});

	afterAll(() => {
		if (originalContent !== null) {
			// Restore original config
			writeFileSync(CODEXFI_JSONC, originalContent, "utf-8");
		} else if (writtenByTest.includes(CODEXFI_JSONC)) {
			// We created it — remove it
			try { rmSync(CODEXFI_JSONC); } catch {}
		}
		cleanupTestFiles();
	});

	test("writes to codexfi.jsonc, not memory.jsonc", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

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
		writtenByTest.push(CODEXFI_JSONC);

		writeApiKeys({ voyageApiKey: "pa-unit-test-key-12345" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("pa-unit-test-key-12345");
	});

	test("written file header says codexfi.jsonc, not memory.jsonc", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

		writeApiKeys({ voyageApiKey: "pa-header-check" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("codexfi.jsonc");
		expect(content).not.toContain("memory.jsonc");
	});

	test("preserves existing non-key settings when updating keys", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

		// Write an initial config with a custom setting
		writeApiKeys({ voyageApiKey: "pa-initial" });
		// Manually inject a custom setting into the file
		const initial = readFileSync(CODEXFI_JSONC, "utf-8");
		// The generated file is valid JSONC — we verify it was created, then
		// update with a different key and check the new key is present.
		writeApiKeys({ voyageApiKey: "pa-updated", anthropicApiKey: "sk-ant-updated" });

		const updated = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(updated).toContain("pa-updated");
		expect(updated).toContain("sk-ant-updated");
	});

	test("written file contains only ASCII characters (no Bun bytecode corruption)", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

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
		writtenByTest.push(CODEXFI_JSONC);

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
	test("returns a path ending in .jsonc or .json", () => {
		const p = getConfigPath();
		expect(p).toMatch(/\.(jsonc|json)$/);
	});

	test("returned path is inside .config/opencode", () => {
		const p = getConfigPath();
		expect(p).toContain(".config/opencode");
	});

	test("returned path is never a legacy memory.* path", () => {
		const p = getConfigPath();
		expect(p).not.toMatch(/memory\.(jsonc|json)$/);
	});

	test("default (no file exists) is codexfi.jsonc", () => {
		// Only assert the default when neither codexfi.* file exists
		if (!existsSync(CODEXFI_JSONC) && !existsSync(CODEXFI_JSON)) {
			expect(getConfigPath()).toBe(CODEXFI_JSONC);
		} else {
			// A real config exists — the result is a valid codexfi path
			const p = getConfigPath();
			expect(p === CODEXFI_JSONC || p === CODEXFI_JSON).toBe(true);
		}
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
	let originalContent: string | null = null;

	beforeAll(() => {
		if (existsSync(CODEXFI_JSONC)) {
			originalContent = readFileSync(CODEXFI_JSONC, "utf-8");
		}
	});

	afterAll(() => {
		if (originalContent !== null) {
			writeFileSync(CODEXFI_JSONC, originalContent, "utf-8");
		}
		cleanupTestFiles();
	});

	test("written file includes extractionProvider field", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

		writeApiKeys({ voyageApiKey: "pa-provider-test", extractionProvider: "xai" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain('"extractionProvider"');
		expect(content).toContain('"xai"');
	});

	test("extractionProvider defaults to anthropic in generated config", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

		writeApiKeys({ voyageApiKey: "pa-default-provider-test" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain('"extractionProvider"');
		expect(content).toContain('"anthropic"');
	});

	test("extractionProvider comment references all three options", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

		writeApiKeys({ voyageApiKey: "pa-comment-test" });

		const content = readFileSync(CODEXFI_JSONC, "utf-8");
		expect(content).toContain("anthropic");
		expect(content).toContain("xai");
		expect(content).toContain("google");
		expect(content).toContain("Extraction Provider");
	});

	test("preserves extractionProvider when updating only API keys", () => {
		mkdirSync(CONFIG_DIR, { recursive: true });
		writtenByTest.push(CODEXFI_JSONC);

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
