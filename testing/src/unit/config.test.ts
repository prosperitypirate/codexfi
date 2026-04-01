/**
 * Unit tests for config.ts — validateId(), constants, and environment variable handling.
 */

import { describe, test, expect } from "bun:test";
import { validateId, EMBEDDING_DIMS, DEDUP_DISTANCE, STRUCTURAL_TYPES, VERSIONING_SKIP_TYPES, VALID_PROVIDERS, EXTRACTION_PROVIDER, DEFAULT_EXTRACTION_PROVIDER } from "../../../plugin/src/config.js";
import { EXTRACTION_SYSTEM, INIT_EXTRACTION_SYSTEM } from "../../../plugin/src/prompts.js";

// ── validateId() ────────────────────────────────────────────────────────────────

describe("validateId", () => {
	test("accepts alphanumeric IDs", () => {
		expect(validateId("abc123")).toBe("abc123");
	});

	test("accepts hyphens, underscores, colons, dots", () => {
		expect(validateId("project_a81f6c15:tag-1.0")).toBe("project_a81f6c15:tag-1.0");
	});

	test("accepts typical opencode project tags", () => {
		const tag = "opencode_project_a81f6c15048ce084a81f6c15";
		expect(validateId(tag, "user_id")).toBe(tag);
	});

	test("accepts user scope tags with email-like patterns", () => {
		// Dots, hyphens, underscores are allowed — but @ and + are NOT
		const tag = "user_clarkbalan_github.com_df3f3531";
		expect(validateId(tag, "user_id")).toBe(tag);
	});

	test("rejects empty string", () => {
		expect(() => validateId("")).toThrow("Invalid id");
	});

	test("rejects string with single quotes (SQL injection)", () => {
		expect(() => validateId("test'OR'1'='1")).toThrow("Invalid id");
	});

	test("rejects string with semicolons", () => {
		expect(() => validateId("test;DROP TABLE")).toThrow("Invalid id");
	});

	test("rejects string with parentheses", () => {
		expect(() => validateId("test()")).toThrow("Invalid id");
	});

	test("rejects string with spaces", () => {
		expect(() => validateId("hello world")).toThrow("Invalid id");
	});

	test("rejects string with backslash", () => {
		expect(() => validateId("path\\to\\file")).toThrow("Invalid id");
	});

	test("rejects string with angle brackets", () => {
		expect(() => validateId("<script>")).toThrow("Invalid id");
	});

	test("uses custom field name in error message", () => {
		expect(() => validateId("", "project_id")).toThrow("Invalid project_id");
	});
});

// ── Constants ───────────────────────────────────────────────────────────────────

describe("constants", () => {
	test("EMBEDDING_DIMS is 1024 (voyage-code-3)", () => {
		expect(EMBEDDING_DIMS).toBe(1024);
	});

	test("DEDUP_DISTANCE is reasonable (0 < x < 1)", () => {
		expect(DEDUP_DISTANCE).toBeGreaterThan(0);
		expect(DEDUP_DISTANCE).toBeLessThan(1);
	});

	test("STRUCTURAL_TYPES contains expected types", () => {
		expect(STRUCTURAL_TYPES.has("project-brief")).toBe(true);
		expect(STRUCTURAL_TYPES.has("architecture")).toBe(true);
		expect(STRUCTURAL_TYPES.has("tech-context")).toBe(true);
		expect(STRUCTURAL_TYPES.has("product-context")).toBe(true);
		expect(STRUCTURAL_TYPES.has("project-config")).toBe(true);
	});

	test("STRUCTURAL_TYPES includes architecture-pattern (010 Phase 2)", () => {
		expect(STRUCTURAL_TYPES.has("architecture-pattern")).toBe(true);
	});

	test("STRUCTURAL_TYPES does not include transient types", () => {
		expect(STRUCTURAL_TYPES.has("session-summary")).toBe(false);
		expect(STRUCTURAL_TYPES.has("progress")).toBe(false);
		expect(STRUCTURAL_TYPES.has("conversation")).toBe(false);
	});
});

// ── VERSIONING_SKIP_TYPES ────────────────────────────────────────────────────────

describe("VERSIONING_SKIP_TYPES", () => {
	test("contains session-summary and progress (pre-existing)", () => {
		expect(VERSIONING_SKIP_TYPES.has("session-summary")).toBe(true);
		expect(VERSIONING_SKIP_TYPES.has("progress")).toBe(true);
	});

	test("contains active-context (010 Phase 1 — singleton aging)", () => {
		expect(VERSIONING_SKIP_TYPES.has("active-context")).toBe(true);
	});
});

// ── Extraction prompts ───────────────────────────────────────────────────────────

describe("extraction prompts", () => {
	test("EXTRACTION_SYSTEM includes project-config type", () => {
		expect(EXTRACTION_SYSTEM).toContain('"project-config"');
	});

	test("INIT_EXTRACTION_SYSTEM includes project-config type", () => {
		expect(INIT_EXTRACTION_SYSTEM).toContain('"project-config"');
	});

	test("EXTRACTION_SYSTEM includes all expected memory types", () => {
		const expectedTypes = [
			'"project-brief"',
			'"architecture"',
			'"tech-context"',
			'"project-config"',
			'"product-context"',
			'"session-summary"',
			'"progress"',
			'"error-solution"',
			'"preference"',
			'"learned-pattern"',
		];
		for (const type of expectedTypes) {
			expect(EXTRACTION_SYSTEM).toContain(type);
		}
	});

	test("EXTRACTION_SYSTEM includes new types from 010 (active-context, architecture-pattern)", () => {
		expect(EXTRACTION_SYSTEM).toContain('"active-context"');
		expect(EXTRACTION_SYSTEM).toContain('"architecture-pattern"');
	});

	test("INIT_EXTRACTION_SYSTEM does NOT include active-context or architecture-pattern", () => {
		// These types only make sense in conversation context, not static file analysis
		expect(INIT_EXTRACTION_SYSTEM).not.toContain('"active-context"');
		expect(INIT_EXTRACTION_SYSTEM).not.toContain('"architecture-pattern"');
	});
});

// ── VALID_PROVIDERS & EXTRACTION_PROVIDER ───────────────────────────────────────

describe("VALID_PROVIDERS", () => {
	test("contains all three provider names", () => {
		expect(VALID_PROVIDERS.has("anthropic")).toBe(true);
		expect(VALID_PROVIDERS.has("xai")).toBe(true);
		expect(VALID_PROVIDERS.has("google")).toBe(true);
	});

	test("does not contain invalid providers", () => {
		expect(VALID_PROVIDERS.has("openai")).toBe(false);
		expect(VALID_PROVIDERS.has("")).toBe(false);
		expect(VALID_PROVIDERS.has("mistral")).toBe(false);
	});

	test("has exactly 3 entries", () => {
		expect(VALID_PROVIDERS.size).toBe(3);
	});
});

describe("EXTRACTION_PROVIDER", () => {
	test("is one of the valid providers", () => {
		expect(VALID_PROVIDERS.has(EXTRACTION_PROVIDER)).toBe(true);
	});

	test("is a non-empty string", () => {
		expect(typeof EXTRACTION_PROVIDER).toBe("string");
		expect(EXTRACTION_PROVIDER.length).toBeGreaterThan(0);
	});
});

describe("DEFAULT_EXTRACTION_PROVIDER", () => {
	test("is 'anthropic'", () => {
		expect(DEFAULT_EXTRACTION_PROVIDER).toBe("anthropic");
	});

	test("is a member of VALID_PROVIDERS", () => {
		expect(VALID_PROVIDERS.has(DEFAULT_EXTRACTION_PROVIDER)).toBe(true);
	});
});
