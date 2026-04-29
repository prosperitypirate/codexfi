/**
 * Unit tests for IngestResultSchema and extraction prompt regression guards.
 *
 * These tests guard against two specific bugs that shipped in PR #138 and were
 * only caught 21 days later:
 *
 *   Bug 1 — `IngestResult` was missing the `type` field. This made downstream
 *   code (e.g. auto-save debug logging) unable to distinguish memory types,
 *   silently masking whether `active-context` extraction was working.
 *
 *   Bug 2 — The extraction prompt was too strict on `active-context` and
 *   `architecture-pattern`, requiring evidence of file edits / explicit pattern
 *   declarations. Discussion- or investigation-driven sessions never triggered
 *   either type, leaving `## Active Context` and `architecture-pattern`
 *   sections of the [MEMORY] block permanently empty in real-world use.
 *
 * Both regressions slipped past existing tests because:
 *   - Scenario 14 seeded an active-context with a string that *did* match the
 *     old strict prompt ("Currently implementing the login page on branch
 *     feature/login...") — so it passed even with the bug.
 *   - No test asserted IngestResult had a `type` field at all.
 */

import { describe, test, expect } from "bun:test";
import { IngestResultSchema } from "../../../plugin/src/types.js";
import { EXTRACTION_SYSTEM } from "../../../plugin/src/prompts.js";

describe("IngestResultSchema", () => {
	test("requires the `type` field — guards Bug 1", () => {
		// Without `type`, downstream code (auto-save logging, dashboard)
		// cannot tell whether active-context extraction is firing.
		const withoutType = { id: "abc", memory: "x", event: "ADD" };
		const result = IngestResultSchema.safeParse(withoutType);
		expect(result.success).toBe(false);
	});

	test("accepts a valid IngestResult including type", () => {
		const valid = { id: "abc", memory: "x", type: "active-context", event: "ADD" };
		const result = IngestResultSchema.safeParse(valid);
		expect(result.success).toBe(true);
	});

	test("type accepts any string (extractor returns LLM-determined types)", () => {
		const types = ["active-context", "architecture-pattern", "learned-pattern", "tech-context"];
		for (const t of types) {
			const result = IngestResultSchema.safeParse({
				id: "x", memory: "y", type: t, event: "ADD",
			});
			expect(result.success).toBe(true);
		}
	});

	test("event must be ADD or UPDATE", () => {
		const bad = { id: "x", memory: "y", type: "z", event: "DELETE" };
		expect(IngestResultSchema.safeParse(bad).success).toBe(false);
	});
});

describe("EXTRACTION_SYSTEM prompt — guards Bug 2 (over-strict triggers)", () => {
	test("active-context section explicitly extracts on discussions/decisions/investigations", () => {
		// The whole point: a discussion-only session about codexfi should still
		// extract an active-context memory. The prompt must SAY so.
		const lower = EXTRACTION_SYSTEM.toLowerCase();
		expect(lower).toContain("active-context");
		// At least one of these "non-edit" trigger keywords must be present
		// in the active-context guidance, otherwise we're back to the old
		// "file edits + bash + decisions" gate.
		const hasBroadTriggers =
			lower.includes("discussion") ||
			lower.includes("investigation") ||
			lower.includes("planning") ||
			lower.includes("triage");
		expect(hasBroadTriggers).toBe(true);
	});

	test("active-context section does NOT exclusively gate on file edits / bash", () => {
		// Regression check: the original prompt said
		//   "Only extract when the conversation shows active implementation work
		//    (file edits, bash commands, architectural decisions) — skip for
		//    questions, discussions, or purely conversational turns."
		// which excluded discussion-driven sessions. The phrase wraps across
		// lines in the source, so collapse whitespace before matching.
		const collapsed = EXTRACTION_SYSTEM.replace(/\s+/g, " ");
		expect(collapsed).not.toContain(
			"Only extract when the conversation shows active implementation work"
		);
		// Also guard the exclusion clause that paired with it.
		expect(collapsed).not.toContain(
			"skip for questions, discussions, or purely conversational turns"
		);
	});

	test("architecture-pattern section explicitly extracts on demonstrated procedures", () => {
		const lower = EXTRACTION_SYSTEM.toLowerCase();
		expect(lower).toContain("architecture-pattern");
		// Must encourage extraction when steps are demonstrated/applied,
		// not only when "established or demonstrated" without context.
		const hasDemoTriggers =
			lower.includes("demonstrated") ||
			lower.includes("applied") ||
			lower.includes("repeatable procedure");
		expect(hasDemoTriggers).toBe(true);
	});

	test("prompt requires returning a JSON array (not prose)", () => {
		// Sanity guard — extractor's parseJsonArray() depends on this format.
		expect(EXTRACTION_SYSTEM).toContain("JSON array");
	});
});
