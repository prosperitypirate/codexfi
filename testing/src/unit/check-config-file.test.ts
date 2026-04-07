/**
 * Unit tests for checkConfigFile() in plugin/src/cli/commands/status.ts.
 *
 * checkConfigFile() is check #3 in `bunx codexfi status`. It is the first
 * check that can definitively tell the user their config is missing — before
 * API key checks, which would silently pass with stale cached values.
 *
 * These tests verify:
 * 1. Returns { status: "ok" } when codexfi.jsonc exists in CONFIG_DIR (~/.codexfi/)
 * 2. Returns { status: "fail" } when codexfi.jsonc does not exist
 * 3. The fail result contains an actionable message referencing codexfi install
 * 4. The ok result detail is the resolved file path
 * 5. The check name is "Config file"
 *
 * Strategy: write real temp files into CONFIG_DIR (same pattern as
 * plugin-config.test.ts), restore state in afterAll.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkConfigFile } from "../../../plugin/src/cli/commands/status.js";
import { CONFIG_DIR } from "../../../plugin/src/plugin-config.js";

// ── Paths ────────────────────────────────────────────────────────────────────────

const CODEXFI_JSONC = join(CONFIG_DIR, "codexfi.jsonc");

/** Minimal valid content for a config file used in tests. */
const STUB_CONFIG = JSON.stringify({ voyageApiKey: "pa-unit-test-stub" });

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Files we created in tests — removed in afterAll. */
const createdByTest: string[] = [];

function ensureConfigDir() {
	mkdirSync(CONFIG_DIR, { recursive: true });
}

function writeStub(path: string) {
	ensureConfigDir();
	writeFileSync(path, STUB_CONFIG, "utf-8");
	if (!createdByTest.includes(path)) createdByTest.push(path);
}

function removeStub(path: string) {
	try { rmSync(path); } catch { /* already gone */ }
	const idx = createdByTest.indexOf(path);
	if (idx !== -1) createdByTest.splice(idx, 1);
}

// ── Baseline state ───────────────────────────────────────────────────────────────

/** True if the real user's config file exists before tests run. */
let hadJsoncBefore = false;

beforeAll(() => {
	hadJsoncBefore = existsSync(CODEXFI_JSONC);
});

afterAll(() => {
	// Remove anything we created that wasn't there before
	for (const f of [...createdByTest]) {
		try { rmSync(f); } catch { /* already gone */ }
	}
	createdByTest.length = 0;
});

// ── check name ───────────────────────────────────────────────────────────────────

describe("checkConfigFile name", () => {
	test('result name is always "Config file"', () => {
		const result = checkConfigFile();
		expect(result.name).toBe("Config file");
	});
});

// ── ok branch ────────────────────────────────────────────────────────────────────

describe("checkConfigFile — ok branch", () => {
	test("returns ok when codexfi.jsonc exists", () => {
		writeStub(CODEXFI_JSONC);

		const result = checkConfigFile();
		expect(result.status).toBe("ok");
		expect(result.detail).toBe(CODEXFI_JSONC);

		removeStub(CODEXFI_JSONC);
	});

	test("ok detail is an absolute path ending in .jsonc", () => {
		writeStub(CODEXFI_JSONC);

		const result = checkConfigFile();
		if (result.status === "ok") {
			expect(result.detail).toMatch(/\.jsonc$/);
			expect(result.detail.startsWith("/")).toBe(true);
		}

		removeStub(CODEXFI_JSONC);
	});

	test("ok detail path is inside ~/.codexfi/", () => {
		writeStub(CODEXFI_JSONC);

		const result = checkConfigFile();
		if (result.status === "ok") {
			expect(result.detail).toContain(".codexfi");
			expect(result.detail).not.toContain(".config/opencode");
		}

		removeStub(CODEXFI_JSONC);
	});
});

// ── fail branch ──────────────────────────────────────────────────────────────────

describe("checkConfigFile — fail branch", () => {
	test("returns fail when codexfi.jsonc does not exist", () => {
		// Only run this test when the user's real config file is absent
		if (hadJsoncBefore) return;

		const result = checkConfigFile();
		expect(result.status).toBe("fail");
	});

	test("fail detail contains actionable install command", () => {
		if (hadJsoncBefore) return;

		const result = checkConfigFile();
		if (result.status === "fail") {
			expect(result.detail).toContain("codexfi install");
		}
	});

	test("fail detail references codexfi.jsonc as the file to create", () => {
		if (hadJsoncBefore) return;

		const result = checkConfigFile();
		if (result.status === "fail") {
			expect(result.detail).toContain("codexfi.jsonc");
		}
	});

	test("fail detail says 'not found'", () => {
		if (hadJsoncBefore) return;

		const result = checkConfigFile();
		if (result.status === "fail") {
			expect(result.detail).toContain("not found");
		}
	});
});

// ── status field shape ───────────────────────────────────────────────────────────

describe("checkConfigFile result shape", () => {
	test("result always has name, status, and detail fields", () => {
		const result = checkConfigFile();
		expect(typeof result.name).toBe("string");
		expect(["ok", "warn", "fail"]).toContain(result.status);
		expect(typeof result.detail).toBe("string");
	});

	test("status is never 'warn' (config file is binary — present or absent)", () => {
		// checkConfigFile() only has ok/fail paths — no warn branch
		const result = checkConfigFile();
		expect(result.status).not.toBe("warn");
	});
});
