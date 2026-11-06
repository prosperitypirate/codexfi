/**
 * Unit tests for claude/runtime.ts — fitToLimit() (Claude Code truncates hook
 * output above 10,000 chars) and isDisabled() (recursion guard + privacy).
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, afterEach } from "bun:test";

import { fitToLimit, HOOK_OUTPUT_LIMIT, isDisabled } from "../../../plugin/src/claude/runtime.js";
import { PLUGIN_CONFIG } from "../../../plugin/src/plugin-config.js";

// ── fitToLimit ──────────────────────────────────────────────────────────────────

describe("fitToLimit", () => {
	const block = [
		"[MEMORY]",
		"",
		"## Project Brief",
		"- brief fact one",
		"- brief fact two",
		"",
		"## Relevant to Current Task",
		"- [91%] relevant fact alpha",
		"  > source snippet line 1",
		"  > source snippet line 2",
		"- [80%] relevant fact beta",
	].join("\n");

	test("text under the limit is returned unchanged", () => {
		expect(fitToLimit(block, 10_000)).toBe(block);
		expect(fitToLimit("", 10)).toBe("");
	});

	test("default limit stays under Claude Code's 10,000-char hook cap", () => {
		expect(HOOK_OUTPUT_LIMIT).toBeLessThan(10_000);
		const huge = ["[MEMORY]", "", "## Facts", ...Array.from({ length: 500 }, (_, i) => `- fact number ${i} ${"x".repeat(40)}`)].join("\n");
		const out = fitToLimit(huge);
		expect(out.length).toBeLessThanOrEqual(HOOK_OUTPUT_LIMIT);
		expect(out.startsWith("[MEMORY]\n\n## Facts\n- fact number 0 ")).toBe(true);
	});

	test("drops whole trailing bullets — never cuts a fact mid-line", () => {
		const out = fitToLimit(block, block.length - 5);
		const inLines = new Set(block.split("\n"));
		for (const line of out.split("\n")) expect(inLines.has(line)).toBe(true);
		expect(out).not.toContain("relevant fact beta");
		expect(out).toContain("relevant fact alpha");
	});

	test("a removed bullet takes its '  >' continuation lines with it", () => {
		// Budget that forces both Relevant bullets out.
		const limit = block.indexOf("- [91%]") + 5;
		const out = fitToLimit(block, limit);
		expect(out).not.toContain("relevant fact alpha");
		expect(out).not.toContain("source snippet");
	});

	test("section headers left without bullets are removed", () => {
		const limit = block.indexOf("## Relevant") + 30;
		const out = fitToLimit(block, limit);
		expect(out).not.toContain("## Relevant to Current Task");
		expect(out).toContain("## Project Brief");
		expect(out).toContain("- brief fact one");
	});

	test("architecture-pattern '> ' lines count as droppable bullets", () => {
		const text = ["[MEMORY]", "", "## Architecture", "- keep me", "> **pattern:** drop me first"].join("\n");
		const out = fitToLimit(text, text.length - 3);
		expect(out).toContain("- keep me");
		expect(out).not.toContain("drop me first");
	});
});

// ── isDisabled ──────────────────────────────────────────────────────────────────

describe("isDisabled", () => {
	const savedDisable = process.env.CODEXFI_DISABLE;
	const savedExclude = [...PLUGIN_CONFIG.excludePaths];

	afterEach(() => {
		if (savedDisable === undefined) delete process.env.CODEXFI_DISABLE;
		else process.env.CODEXFI_DISABLE = savedDisable;
		PLUGIN_CONFIG.excludePaths.splice(0, PLUGIN_CONFIG.excludePaths.length, ...savedExclude);
	});

	test("enabled by default", () => {
		expect(isDisabled()).toBe(false);
		expect(isDisabled("/some/project")).toBe(false);
	});

	test("CODEXFI_DISABLE=1 disables everything (set on our own claude -p children)", () => {
		process.env.CODEXFI_DISABLE = "1";
		expect(isDisabled()).toBe(true);
		expect(isDisabled("/some/project")).toBe(true);
	});

	test("CODEXFI_DISABLE with another value does not disable", () => {
		process.env.CODEXFI_DISABLE = "0";
		expect(isDisabled("/some/project")).toBe(false);
	});

	test("excludePaths: the directory itself and anything below it", () => {
		PLUGIN_CONFIG.excludePaths.push("/work/secret");
		expect(isDisabled("/work/secret")).toBe(true);
		expect(isDisabled("/work/secret/sub/dir")).toBe(true);
	});

	test("excludePaths: prefix match is path-segment aware", () => {
		PLUGIN_CONFIG.excludePaths.push("/work/secret");
		expect(isDisabled("/work/secretive")).toBe(false);
		expect(isDisabled("/work")).toBe(false);
	});

	test("excludePaths entries with a trailing slash work too", () => {
		PLUGIN_CONFIG.excludePaths.push("/clients/acme/");
		expect(isDisabled("/clients/acme/app")).toBe(true);
		expect(isDisabled("/clients/acme-other")).toBe(false);
	});
});
