/**
 * Unit tests for buildDisabledWarning() in plugin/src/index.ts.
 *
 * buildDisabledWarning() is called when isConfigured() returns false and is
 * injected into the system prompt via experimental.chat.system.transform.
 * It is the primary user-facing signal that memory is disabled.
 *
 * These tests verify:
 * 1. The output contains the [MEMORY - DISABLED] header
 * 2. The AI directive is present (must tell user before first response)
 * 3. VOYAGE_API_KEY status line is present and correctly labelled
 * 4. All four API key status lines are present
 * 5. The install command reference is present
 * 6. The config file path reference is present
 * 7. Output is pure ASCII (no Unicode characters that could corrupt Bun output)
 *
 * NOTE: buildDisabledWarning() reads from the module-level constants
 * (VOYAGE_API_KEY etc.) which are loaded from PLUGIN_CONFIG at module init.
 * In CI with no codexfi.jsonc present, all four keys will be empty strings —
 * so the "MISSING" branch of each keyStatus line will be exercised.
 */

import { describe, test, expect } from "bun:test";
import { buildDisabledWarning } from "../../../plugin/src/services/disabled-warning.js";

// ── Output format ────────────────────────────────────────────────────────────────

describe("buildDisabledWarning", () => {
	test("output starts with [MEMORY - DISABLED] header", () => {
		const result = buildDisabledWarning();
		expect(result).toMatch(/^\[MEMORY - DISABLED\]/);
	});

	test("output contains AI directive to inform user before first response", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("Inform the user at the start of this session");
		expect(result).toContain("Do not wait for the user to ask");
	});

	test("output contains [codexfi] message with install command", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("[codexfi] Memory is disabled");
		expect(result).toContain("codexfi install");
	});

	test("output states that memories are not being saved or retrieved", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("Memories are not being saved or retrieved");
	});

	test("output contains VOYAGE_API_KEY status line", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("VOYAGE_API_KEY");
	});

	test("output contains all four API key status lines", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("VOYAGE_API_KEY");
		expect(result).toContain("ANTHROPIC_API_KEY");
		expect(result).toContain("XAI_API_KEY");
		expect(result).toContain("GOOGLE_API_KEY");
	});

	test("output contains root-cause explanation when VOYAGE_API_KEY is missing", () => {
		// In test environment (no codexfi.jsonc), VOYAGE_API_KEY is empty
		const result = buildDisabledWarning();
		// Either VOYAGE_API_KEY is set (user's machine) or the root cause line appears
		if (!result.includes("✓ VOYAGE_API_KEY")) {
			expect(result).toContain("Root cause: VOYAGE_API_KEY is not set");
		}
	});

	test("output references codexfi.jsonc config file path", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("codexfi.jsonc");
	});

	test("output references codexfi status command for diagnostics", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("codexfi status");
	});

	test("output is a non-empty string", () => {
		const result = buildDisabledWarning();
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(100);
	});

	test("output contains only ASCII-safe characters (no Bun bytecode corruption)", () => {
		const result = buildDisabledWarning();
		// Allow printable ASCII (0x20-0x7E), newlines (0x0A), tabs (0x09),
		// and checkmark/cross symbols used in keyStatus lines (✓ U+2713, ✗ U+2717)
		// Everything else is unexpected and would indicate encoding issues.
		const unexpectedChars: string[] = [];
		for (let i = 0; i < result.length; i++) {
			const code = result.charCodeAt(i);
			const isAsciiPrintable = code >= 0x20 && code <= 0x7e;
			const isWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
			const isAllowedUnicode = code === 0x2713 || code === 0x2717; // ✓ ✗
			const isBacktick = code === 0x60; // backtick used in template strings
			if (!isAsciiPrintable && !isWhitespace && !isAllowedUnicode && !isBacktick) {
				unexpectedChars.push(
					`U+${code.toString(16).toUpperCase().padStart(4, "0")} at pos ${i} ` +
					`(context: "${result.slice(Math.max(0, i - 5), i + 5).replace(/\n/g, "\\n")}")`
				);
			}
		}
		if (unexpectedChars.length > 0) {
			throw new Error(`Unexpected characters in buildDisabledWarning() output:\n${unexpectedChars.join("\n")}`);
		}
	});

	test("each call returns the same output (pure function, no randomness)", () => {
		const a = buildDisabledWarning();
		const b = buildDisabledWarning();
		expect(a).toBe(b);
	});
});

// ── Key status lines ─────────────────────────────────────────────────────────────

describe("buildDisabledWarning key status lines", () => {
	test("each key shows either 'set' or 'MISSING'", () => {
		const result = buildDisabledWarning();
		const lines = result.split("\n");
		const keyLines = lines.filter(
			(l) => l.includes("VOYAGE_API_KEY") || l.includes("ANTHROPIC_API_KEY") ||
				   l.includes("XAI_API_KEY") || l.includes("GOOGLE_API_KEY")
		);
		// At least the four status lines should be present (there may be extras in
		// the root cause / note lines)
		const statusLines = keyLines.filter((l) => l.startsWith("  ✓") || l.startsWith("  ✗"));
		expect(statusLines.length).toBe(4);
		for (const line of statusLines) {
			const hasSet = line.includes("set");
			const hasMissing = line.includes("MISSING");
			expect(hasSet || hasMissing).toBe(true);
		}
	});

	test("VOYAGE_API_KEY line is marked as required (no fallback note)", () => {
		const result = buildDisabledWarning();
		expect(result).toContain("required for embeddings, no fallback");
	});
});
