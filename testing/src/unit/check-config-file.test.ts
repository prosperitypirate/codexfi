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
 * SAFETY: The real codexfi.jsonc is backed up at the top-level beforeAll and
 * restored unconditionally in the top-level afterAll. Tests that need the file
 * absent temporarily remove it and restore it within the same test or describe.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkConfigFile } from "../../../plugin/src/cli/commands/status.js";
import { CONFIG_DIR } from "../../../plugin/src/plugin-config.js";

// ── Paths ────────────────────────────────────────────────────────────────────────

const CODEXFI_JSONC = join(CONFIG_DIR, "codexfi.jsonc");

/** Minimal valid content for a config file used in tests. */
const STUB_CONFIG = JSON.stringify({ voyageApiKey: "pa-unit-test-stub" });

// ── Top-level backup/restore ─────────────────────────────────────────────────────

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
		mkdirSync(CONFIG_DIR, { recursive: true });
		writeFileSync(CODEXFI_JSONC, _savedConfigContent, "utf-8");
	} else if (!_configExistedBefore) {
		try { rmSync(CODEXFI_JSONC); } catch { /* already gone */ }
	}
});

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Temporarily remove the config file for a test, returning a restore function. */
function withConfigRemoved(): () => void {
	let backup: string | null = null;
	if (existsSync(CODEXFI_JSONC)) {
		backup = readFileSync(CODEXFI_JSONC, "utf-8");
		rmSync(CODEXFI_JSONC);
	}
	return () => {
		if (backup !== null) {
			mkdirSync(CONFIG_DIR, { recursive: true });
			writeFileSync(CODEXFI_JSONC, backup, "utf-8");
		}
	};
}

/** Write a stub config, returning a restore function. */
function withStubConfig(): () => void {
	let backup: string | null = null;
	if (existsSync(CODEXFI_JSONC)) {
		backup = readFileSync(CODEXFI_JSONC, "utf-8");
	}
	mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(CODEXFI_JSONC, STUB_CONFIG, "utf-8");
	return () => {
		if (backup !== null) {
			writeFileSync(CODEXFI_JSONC, backup, "utf-8");
		} else {
			try { rmSync(CODEXFI_JSONC); } catch { /* already gone */ }
		}
	};
}

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
		const restore = withStubConfig();
		try {
			const result = checkConfigFile();
			expect(result.status).toBe("ok");
			expect(result.detail).toBe(CODEXFI_JSONC);
		} finally {
			restore();
		}
	});

	test("ok detail is an absolute path ending in .jsonc", () => {
		const restore = withStubConfig();
		try {
			const result = checkConfigFile();
			if (result.status === "ok") {
				expect(result.detail).toMatch(/\.jsonc$/);
				expect(result.detail.startsWith("/")).toBe(true);
			}
		} finally {
			restore();
		}
	});

	test("ok detail path is inside ~/.codexfi/", () => {
		const restore = withStubConfig();
		try {
			const result = checkConfigFile();
			if (result.status === "ok") {
				expect(result.detail).toContain(".codexfi");
				expect(result.detail).not.toContain(".config/opencode");
			}
		} finally {
			restore();
		}
	});
});

// ── fail branch ──────────────────────────────────────────────────────────────────

describe("checkConfigFile — fail branch", () => {
	test("returns fail when codexfi.jsonc does not exist", () => {
		const restore = withConfigRemoved();
		try {
			const result = checkConfigFile();
			expect(result.status).toBe("fail");
		} finally {
			restore();
		}
	});

	test("fail detail contains actionable install command", () => {
		const restore = withConfigRemoved();
		try {
			const result = checkConfigFile();
			if (result.status === "fail") {
				expect(result.detail).toContain("codexfi install");
			}
		} finally {
			restore();
		}
	});

	test("fail detail references codexfi.jsonc as the file to create", () => {
		const restore = withConfigRemoved();
		try {
			const result = checkConfigFile();
			if (result.status === "fail") {
				expect(result.detail).toContain("codexfi.jsonc");
			}
		} finally {
			restore();
		}
	});

	test("fail detail says 'not found'", () => {
		const restore = withConfigRemoved();
		try {
			const result = checkConfigFile();
			if (result.status === "fail") {
				expect(result.detail).toContain("not found");
			}
		} finally {
			restore();
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
