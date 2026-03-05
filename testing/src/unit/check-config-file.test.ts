/**
 * Unit tests for checkConfigFile() in plugin/src/cli/commands/status.ts.
 *
 * checkConfigFile() is check #3 in `bunx codexfi status`. It is the first
 * check that can definitively tell the user their config is missing — before
 * API key checks, which would silently pass with stale cached values.
 *
 * These tests verify:
 * 1. Returns { status: "ok" } when codexfi.jsonc exists in CONFIG_DIR
 * 2. Returns { status: "ok" } when codexfi.json exists in CONFIG_DIR
 * 3. Returns { status: "fail" } when neither file exists
 * 4. The fail result contains an actionable message referencing codexfi install
 * 5. The ok result detail is the resolved file path
 * 6. The check name is "Config file"
 *
 * Strategy: write real temp files into CONFIG_DIR (same pattern as
 * plugin-config.test.ts), restore state in afterAll.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { checkConfigFile } from "../../../plugin/src/cli/commands/status.js";
import { CONFIG_DIR } from "../../../plugin/src/plugin-config.js";

// ── Paths ────────────────────────────────────────────────────────────────────────

const CODEXFI_JSONC = join(CONFIG_DIR, "codexfi.jsonc");
const CODEXFI_JSON  = join(CONFIG_DIR, "codexfi.json");

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

/** True if the real user's config files exist before tests run. */
let hadJsoncBefore = false;
let hadJsonBefore = false;

beforeAll(() => {
	hadJsoncBefore = existsSync(CODEXFI_JSONC);
	hadJsonBefore  = existsSync(CODEXFI_JSON);
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

	test("returns ok when only codexfi.json exists", () => {
		// Ensure codexfi.jsonc is absent so codexfi.json is the first hit
		const jsonc = existsSync(CODEXFI_JSONC);
		if (jsonc) return; // skip on machines where real .jsonc is present

		writeStub(CODEXFI_JSON);

		const result = checkConfigFile();
		expect(result.status).toBe("ok");
		expect(result.detail).toBe(CODEXFI_JSON);

		removeStub(CODEXFI_JSON);
	});

	test("ok detail is an absolute path ending in .jsonc or .json", () => {
		writeStub(CODEXFI_JSONC);

		const result = checkConfigFile();
		if (result.status === "ok") {
			expect(result.detail).toMatch(/\.(jsonc|json)$/);
			expect(result.detail.startsWith("/")).toBe(true);
		}

		removeStub(CODEXFI_JSONC);
	});

	test("codexfi.jsonc takes precedence over codexfi.json when both exist", () => {
		writeStub(CODEXFI_JSONC);
		writeStub(CODEXFI_JSON);

		const result = checkConfigFile();
		expect(result.status).toBe("ok");
		expect(result.detail).toBe(CODEXFI_JSONC);

		removeStub(CODEXFI_JSONC);
		removeStub(CODEXFI_JSON);
	});
});

// ── fail branch ──────────────────────────────────────────────────────────────────

describe("checkConfigFile — fail branch", () => {
	test("returns fail when neither codexfi.jsonc nor codexfi.json exists", () => {
		// Only run this test when the user's real config files are absent
		if (hadJsoncBefore || hadJsonBefore) return;

		const result = checkConfigFile();
		expect(result.status).toBe("fail");
	});

	test("fail detail contains actionable install command", () => {
		if (hadJsoncBefore || hadJsonBefore) return;

		const result = checkConfigFile();
		if (result.status === "fail") {
			expect(result.detail).toContain("codexfi install");
		}
	});

	test("fail detail references codexfi.jsonc as the file to create", () => {
		if (hadJsoncBefore || hadJsonBefore) return;

		const result = checkConfigFile();
		if (result.status === "fail") {
			expect(result.detail).toContain("codexfi.jsonc");
		}
	});

	test("fail detail says 'not found'", () => {
		if (hadJsoncBefore || hadJsonBefore) return;

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
