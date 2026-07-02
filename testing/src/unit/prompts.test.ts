/**
 * Unit tests for prompts.ts — SUMMARY_SYSTEM anti-recursion guard.
 *
 * Follow-up to issue #201 (Item 2). Session summaries could previously drift into
 * self-referential narration about the memory system itself ("memory ops used",
 * "verified [MEMORY] block visibility") instead of describing the work performed.
 *
 * These are pure string assertions on the prompt template — no network calls,
 * no LLM invocation. They lock in that the guard text exists and mentions the
 * specific phrasing patterns found during the #201 research pass (see issue
 * body: "…assigned to clarkbalan, memory ops used." / "Memory types map to
 * [MEMORY] block sections…").
 *
 * NOTE: whether a live model actually avoids these phrases given the guard is
 * NOT covered here (would require a real extraction API call — this repo's
 * test suite mocks fetch() rather than hitting live LLMs; see
 * testing/src/integration/extractor-summary.test.ts for the mocked wiring test
 * that verifies SUMMARY_SYSTEM, guard included, is what actually gets sent).
 */

import { describe, test, expect } from "bun:test";
import { SUMMARY_SYSTEM } from "../../../plugin/src/prompts.js";

describe("SUMMARY_SYSTEM anti-recursion guard", () => {
	test("contains an explicit 'Avoid' section", () => {
		expect(SUMMARY_SYSTEM).toMatch(/Avoid/i);
	});

	test("forbids narrating memory operations", () => {
		expect(SUMMARY_SYSTEM).toMatch(/memory ops/i);
		expect(SUMMARY_SYSTEM).toMatch(/narrate memory operations|do not narrate/i);
	});

	test("forbids describing the [MEMORY] block or its sections", () => {
		expect(SUMMARY_SYSTEM).toContain("[MEMORY] block");
		expect(SUMMARY_SYSTEM).toMatch(/structured sections|how memories are injected/i);
	});

	test("makes an explicit exception for sessions that build the memory system itself", () => {
		// False-positive guard: a project that IS a memory system (e.g. codexfi itself)
		// must still be able to describe work on its own code without the guard
		// stripping legitimate content. See issue #201 "Confidence & limitations".
		expect(SUMMARY_SYSTEM).toMatch(/building or\s*\n?\s*fixing that memory system's code/i);
	});

	test("still instructs focus on actual work performed", () => {
		expect(SUMMARY_SYSTEM).toMatch(/focus entirely on the actual work performed/i);
	});

	test("retains all pre-existing summary rules (past tense, 200-300 words, JSON array)", () => {
		expect(SUMMARY_SYSTEM).toMatch(/past tense/i);
		expect(SUMMARY_SYSTEM).toContain("200-300 words");
		expect(SUMMARY_SYSTEM).toContain('"type": "session-summary"');
	});
});
