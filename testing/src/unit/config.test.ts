/**
 * Unit tests for config.ts — validateId(), constants, and environment variable handling.
 */

import { describe, test, expect } from "bun:test";
import { validateId, EMBEDDING_DIMS, DEDUP_DISTANCE, STRUCTURAL_TYPES } from "../../../plugin/src/config.js";

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

	test("STRUCTURAL_TYPES does not include transient types", () => {
		expect(STRUCTURAL_TYPES.has("session-summary")).toBe(false);
		expect(STRUCTURAL_TYPES.has("progress")).toBe(false);
		expect(STRUCTURAL_TYPES.has("conversation")).toBe(false);
	});
});
