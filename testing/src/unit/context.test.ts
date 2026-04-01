/**
 * Unit tests for services/context.ts — formatContextForPrompt().
 *
 * formatContextForPrompt is a pure function with zero network calls.
 * Tests cover all changes introduced in design doc 010 (Richer [MEMORY] Block):
 *   - architecture-pattern rendering with '> pattern:' prefix
 *   - displaySimilarityThreshold filtering (< 0.60 excluded)
 *   - Recent Sessions (up to 3, with condensation)
 *   - Active Context 2,000-char render cap
 *   - Full [MEMORY] block structure with all new sections
 */

import { describe, test, expect } from "bun:test";
import {
	formatContextForPrompt,
	type StructuredMemory,
	type ProfileResult,
	type MemoriesResponseMinimal,
} from "../../../plugin/src/services/context.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMemory(id: string, memory: string, type: string, createdAt?: string): StructuredMemory {
	return { id, memory, similarity: 1, metadata: { type }, createdAt };
}

function makeSemanticResult(memory: string, similarity: number, date?: string) {
	return { memory, similarity, date };
}

const EMPTY_PROFILE: ProfileResult = { profile: null };
const EMPTY_USER: MemoriesResponseMinimal = { results: [] };
const EMPTY_SEMANTIC: MemoriesResponseMinimal = { results: [] };

// ── architecture-pattern rendering ────────────────────────────────────────────

describe("architecture-pattern rendering", () => {
	test("renders with '> **pattern:**' prefix in ## Architecture section", () => {
		const byType = {
			"architecture": [makeMemory("a1", "System uses event-driven messaging", "architecture")],
			"architecture-pattern": [makeMemory("p1", "How to add a route: 1. Add handler in src/routes/", "architecture-pattern")],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain("## Architecture");
		expect(block).toContain("- System uses event-driven messaging");
		expect(block).toContain("> **pattern:** How to add a route: 1. Add handler in src/routes/");
	});

	test("architecture-pattern does NOT render as a bullet point", () => {
		const byType = {
			"architecture-pattern": [makeMemory("p1", "How to add a migration step", "architecture-pattern")],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		// Should use '>' prefix, not '- '
		expect(block).toContain("> **pattern:**");
		expect(block).not.toContain("- How to add a migration step");
	});

	test("architecture-pattern appears alongside descriptive architecture memories", () => {
		const byType = {
			"architecture": [
				makeMemory("a1", "Uses LanceDB for vector storage", "architecture"),
				makeMemory("a2", "Plugin hooks run on every chat message", "architecture"),
			],
			"architecture-pattern": [
				makeMemory("p1", "How to add a hook: register in index.ts", "architecture-pattern"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain("- Uses LanceDB for vector storage");
		expect(block).toContain("- Plugin hooks run on every chat message");
		expect(block).toContain("> **pattern:** How to add a hook: register in index.ts");
	});
});

// ── displaySimilarityThreshold filtering ─────────────────────────────────────

describe("displaySimilarityThreshold filtering", () => {
	test("memories below 0.60 similarity are excluded from Relevant section", () => {
		const semantic: MemoriesResponseMinimal = {
			results: [
				makeSemanticResult("High relevance memory", 0.85),
				makeSemanticResult("Medium relevance memory", 0.62),
				makeSemanticResult("Below threshold memory", 0.58),
				makeSemanticResult("Low relevance memory", 0.45),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, semantic, undefined);

		expect(block).toContain("## Relevant to Current Task");
		expect(block).toContain("High relevance memory");
		expect(block).toContain("Medium relevance memory");
		expect(block).not.toContain("Below threshold memory");
		expect(block).not.toContain("Low relevance memory");
	});

	test("memories at exactly 0.60 are included (inclusive threshold)", () => {
		const semantic: MemoriesResponseMinimal = {
			results: [makeSemanticResult("At threshold memory", 0.60)],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, semantic, undefined);

		expect(block).toContain("At threshold memory");
	});

	test("when all memories are below threshold, Relevant section is omitted", () => {
		const semantic: MemoriesResponseMinimal = {
			results: [
				makeSemanticResult("Low score 1", 0.45),
				makeSemanticResult("Low score 2", 0.50),
				makeSemanticResult("Low score 3", 0.55),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, semantic, undefined);

		expect(block).not.toContain("## Relevant to Current Task");
	});
});

// ── Recent Sessions (up to 3 with condensation) ───────────────────────────────

describe("Recent Sessions", () => {
	test("section header is '## Recent Sessions' (not '## Last Session')", () => {
		const byType = {
			"session-summary": [
				makeMemory("s1", "Worked on auth feature", "session-summary", "2026-03-30T10:00:00Z"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain("## Recent Sessions");
		expect(block).not.toContain("## Last Session");
	});

	test("shows up to 3 session summaries", () => {
		const byType = {
			"session-summary": [
				makeMemory("s1", "Session 1 content", "session-summary", "2026-03-28T10:00:00Z"),
				makeMemory("s2", "Session 2 content", "session-summary", "2026-03-29T10:00:00Z"),
				makeMemory("s3", "Session 3 content", "session-summary", "2026-03-30T10:00:00Z"),
				makeMemory("s4", "Session 4 content", "session-summary", "2026-03-31T10:00:00Z"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		// Latest 3 shown, oldest (s1) excluded
		expect(block).toContain("Session 4 content");
		expect(block).toContain("Session 3 content");
		expect(block).toContain("Session 2 content");
		expect(block).not.toContain("Session 1 content");
	});

	test("latest entry is shown at full length", () => {
		const longContent = "A".repeat(1000);
		const byType = {
			"session-summary": [
				makeMemory("s1", longContent, "session-summary", "2026-03-31T10:00:00Z"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain(longContent);
	});

	test("2nd entry is truncated at 600 chars", () => {
		const longContent = "B".repeat(900);
		const byType = {
			"session-summary": [
				makeMemory("s1", "Latest session content", "session-summary", "2026-03-31T10:00:00Z"),
				makeMemory("s2", longContent, "session-summary", "2026-03-30T10:00:00Z"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		// 2nd entry should be truncated at 600 chars + ellipsis
		expect(block).toContain("B".repeat(600) + "…");
		expect(block).not.toContain("B".repeat(601));
	});

	test("3rd entry is truncated at 300 chars", () => {
		const longContent = "C".repeat(500);
		const byType = {
			"session-summary": [
				makeMemory("s1", "Latest session", "session-summary", "2026-03-31T10:00:00Z"),
				makeMemory("s2", "Second session", "session-summary", "2026-03-30T10:00:00Z"),
				makeMemory("s3", longContent, "session-summary", "2026-03-29T10:00:00Z"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		// 3rd entry should be truncated at 300 chars + ellipsis
		expect(block).toContain("C".repeat(300) + "…");
		expect(block).not.toContain("C".repeat(301));
	});

	test("single-session project shows 1 entry cleanly (no truncation)", () => {
		const content = "Built the login form and wired it to the auth API.";
		const byType = {
			"session-summary": [
				makeMemory("s1", content, "session-summary", "2026-03-31T10:00:00Z"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain("## Recent Sessions");
		expect(block).toContain(content);
		expect(block).not.toContain("…");
	});
});

// ── Active Context 2,000-char render cap ──────────────────────────────────────

describe("Active Context render cap", () => {
	test("active-context memory is shown in ## Active Context section", () => {
		const byType = {
			"active-context": [
				makeMemory("ac1", "Currently building the OAuth refresh token flow.", "active-context"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain("## Active Context");
		expect(block).toContain("Currently building the OAuth refresh token flow.");
	});

	test("active-context content exceeding 2,000 chars is truncated with ellipsis", () => {
		const longContent = "X".repeat(2500);
		const byType = {
			"active-context": [
				makeMemory("ac1", longContent, "active-context"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain("X".repeat(2000) + "…");
		expect(block).not.toContain("X".repeat(2001));
	});

	test("active-context content within 2,000 chars is shown in full", () => {
		const shortContent = "X".repeat(1999);
		const byType = {
			"active-context": [
				makeMemory("ac1", shortContent, "active-context"),
			],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toContain(shortContent);
		expect(block).not.toContain("…");
	});

	test("no ## Active Context section when no active-context memories exist", () => {
		const byType = {
			"project-brief": [makeMemory("pb1", "A test project", "project-brief")],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).not.toContain("## Active Context");
	});
});

// ── Full [MEMORY] block structure ─────────────────────────────────────────────

describe("Full [MEMORY] block structure", () => {
	test("block starts with [MEMORY]", () => {
		const byType = {
			"project-brief": [makeMemory("pb1", "A test project", "project-brief")],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		expect(block).toMatch(/^\[MEMORY\]/);
	});

	test("all new section types appear in correct order", () => {
		const byType = {
			"project-brief":        [makeMemory("pb1", "Brief", "project-brief")],
			"architecture":         [makeMemory("a1", "Architecture desc", "architecture")],
			"architecture-pattern": [makeMemory("p1", "Pattern recipe", "architecture-pattern")],
			"tech-context":         [makeMemory("tc1", "Tech stack", "tech-context")],
			"product-context":      [makeMemory("pc1", "Product goals", "product-context")],
			"progress":             [makeMemory("pr1", "v1.0 shipped", "progress")],
			"active-context":       [makeMemory("ac1", "Working on auth", "active-context")],
			"session-summary":      [makeMemory("ss1", "Built login", "session-summary", "2026-03-31T10:00:00Z")],
		};

		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, byType);

		const archIdx       = block.indexOf("## Architecture");
		const progressIdx   = block.indexOf("## Progress & Status");
		const activeIdx     = block.indexOf("## Active Context");
		const recentIdx     = block.indexOf("## Recent Sessions");

		// Architecture appears before Progress & Status
		expect(archIdx).toBeLessThan(progressIdx);
		// Progress & Status appears before Active Context
		expect(progressIdx).toBeLessThan(activeIdx);
		// Active Context appears before Recent Sessions
		expect(activeIdx).toBeLessThan(recentIdx);
	});

	test("returns empty string when no sections have content", () => {
		const block = formatContextForPrompt(EMPTY_PROFILE, EMPTY_USER, EMPTY_SEMANTIC, {});
		expect(block).toBe("");
	});
});
