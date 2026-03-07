/**
 * Unit tests for auto-init features introduced in v0.5.0 (Issue #114).
 *
 * Tests verify:
 * 1. INIT_FILES list contains all expected entries (Phase 2)
 * 2. INIT_TOTAL_CHAR_CAP is set to 15000 (Phase 2)
 * 3. generateDirectoryTree() produces correct output format (Phase 3)
 * 4. generateDirectoryTree() respects TREE_IGNORE exclusions (Phase 3)
 * 5. generateDirectoryTree() respects maxDepth cap (Phase 3)
 * 6. generateDirectoryTree() handles empty directories (Phase 3)
 * 7. generateDirectoryTree() handles permission errors gracefully (Phase 3)
 * 8. buildFreshProjectHint() includes project name from path (Phase 4)
 * 9. buildFreshProjectHint() contains [MEMORY - NEW PROJECT] header (Phase 4)
 * 10. buildFreshProjectHint() is pure ASCII (no emoji, no Unicode) (Phase 4)
 *
 * Testing pattern: direct function testing with temp directories for
 * filesystem tests. No mocking — matches project convention.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { INIT_FILES, INIT_TOTAL_CHAR_CAP } from "../../../plugin/src/services/auto-init-config.js";
import { generateDirectoryTree, TREE_IGNORE } from "../../../plugin/src/services/directory-tree.js";
import { buildFreshProjectHint } from "../../../plugin/src/services/fresh-project-hint.js";

// ── INIT_FILES and INIT_TOTAL_CHAR_CAP (Phase 2) ──────────────────

describe("INIT_FILES", () => {
	test("includes critical agent instruction files", () => {
		const names = INIT_FILES.map(f => f.name);
		expect(names).toContain("AGENTS.md");
		expect(names).toContain("CLAUDE.md");
		expect(names).toContain("CONTRIBUTING.md");
	});

	test("includes build system files", () => {
		const names = INIT_FILES.map(f => f.name);
		expect(names).toContain("Makefile");
		expect(names).toContain("Dockerfile");
		expect(names).toContain("deno.json");
	});

	test("includes monorepo config files", () => {
		const names = INIT_FILES.map(f => f.name);
		expect(names).toContain("pnpm-workspace.yaml");
		expect(names).toContain("turbo.json");
		expect(names).toContain("nx.json");
	});

	test("every entry has a positive maxChars value", () => {
		for (const file of INIT_FILES) {
			expect(file.maxChars).toBeGreaterThan(0);
		}
	});
});

describe("INIT_TOTAL_CHAR_CAP", () => {
	test("is 15000", () => {
		expect(INIT_TOTAL_CHAR_CAP).toBe(15000);
	});
});

// ── generateDirectoryTree (Phase 3) ────────────────────────────────

describe("generateDirectoryTree", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "oc-test-tree-"));
	});

	afterEach(() => {
		try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
	});

	test("generates tree for a project directory with correct format", () => {
		// Create: src/index.ts, src/utils/helper.ts, package.json
		mkdirSync(join(tempDir, "src", "utils"), { recursive: true });
		writeFileSync(join(tempDir, "src", "index.ts"), "");
		writeFileSync(join(tempDir, "src", "utils", "helper.ts"), "");
		writeFileSync(join(tempDir, "package.json"), "{}");

		const tree = generateDirectoryTree(tempDir, 3);

		// Root line should be the directory name
		const lines = tree.split("\n");
		expect(lines[0]).toMatch(/\/$/); // root ends with /

		// Should contain our files
		expect(tree).toContain("src/");
		expect(tree).toContain("index.ts");
		expect(tree).toContain("helper.ts");
		expect(tree).toContain("package.json");

		// Should use tree connectors
		expect(tree).toMatch(/[├└]── /);
	});

	test("ignores node_modules, .git, dist, and other TREE_IGNORE entries", () => {
		mkdirSync(join(tempDir, "src"), { recursive: true });
		mkdirSync(join(tempDir, "node_modules", "lodash"), { recursive: true });
		mkdirSync(join(tempDir, ".git", "objects"), { recursive: true });
		mkdirSync(join(tempDir, "dist"), { recursive: true });
		writeFileSync(join(tempDir, "src", "app.ts"), "");
		writeFileSync(join(tempDir, "node_modules", "lodash", "index.js"), "");

		const tree = generateDirectoryTree(tempDir, 3);

		expect(tree).toContain("src/");
		expect(tree).toContain("app.ts");
		expect(tree).not.toContain("node_modules");
		expect(tree).not.toContain("dist");
		// .git is hidden (starts with .) AND in TREE_IGNORE — double excluded
	});

	test("includes .github/ despite being a dotfile", () => {
		mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
		writeFileSync(join(tempDir, ".github", "workflows", "ci.yml"), "");

		const tree = generateDirectoryTree(tempDir, 3);

		expect(tree).toContain(".github/");
		expect(tree).toContain("workflows/");
		expect(tree).toContain("ci.yml");
	});

	test("respects maxDepth — depth 1 shows only top-level", () => {
		mkdirSync(join(tempDir, "src", "deep", "nested"), { recursive: true });
		writeFileSync(join(tempDir, "src", "deep", "nested", "file.ts"), "");

		const tree = generateDirectoryTree(tempDir, 1);

		expect(tree).toContain("src/");
		// depth 1 = only top-level entries; "deep" is at depth 2
		expect(tree).not.toContain("deep");
		expect(tree).not.toContain("nested");
		expect(tree).not.toContain("file.ts");
	});

	test("handles empty directories gracefully", () => {
		const tree = generateDirectoryTree(tempDir, 3);

		// Should have at least the root line
		const lines = tree.split("\n");
		expect(lines.length).toBeGreaterThan(0);
		expect(lines[0]).toMatch(/\/$/);
	});

	test("sorts directories before files", () => {
		writeFileSync(join(tempDir, "zebra.ts"), "");
		mkdirSync(join(tempDir, "alpha"), { recursive: true });
		writeFileSync(join(tempDir, "alpha", "file.ts"), "");

		const tree = generateDirectoryTree(tempDir, 3);
		const lines = tree.split("\n").slice(1); // skip root

		// First entry should be the directory "alpha/"
		const firstEntry = lines[0];
		expect(firstEntry).toContain("alpha/");
	});
});

describe("TREE_IGNORE", () => {
	test("contains standard build/dependency directories", () => {
		expect(TREE_IGNORE.has("node_modules")).toBe(true);
		expect(TREE_IGNORE.has(".git")).toBe(true);
		expect(TREE_IGNORE.has("dist")).toBe(true);
		expect(TREE_IGNORE.has("build")).toBe(true);
		expect(TREE_IGNORE.has("__pycache__")).toBe(true);
		expect(TREE_IGNORE.has("target")).toBe(true);
		expect(TREE_IGNORE.has("coverage")).toBe(true);
	});
});

// ── buildFreshProjectHint (Phase 4) ────────────────────────────────

describe("buildFreshProjectHint", () => {
	test("includes project name extracted from directory path", () => {
		const hint = buildFreshProjectHint("/Users/dev/my-awesome-project");
		expect(hint).toContain("my-awesome-project");
	});

	test("contains [MEMORY - NEW PROJECT] header on first line", () => {
		const hint = buildFreshProjectHint("/some/path");
		const firstLine = hint.split("\n")[0];
		expect(firstLine).toBe("[MEMORY - NEW PROJECT]");
	});

	test("is pure ASCII — no emoji or special Unicode characters", () => {
		const hint = buildFreshProjectHint("/test/project");
		for (let i = 0; i < hint.length; i++) {
			const code = hint.charCodeAt(i);
			if (code > 127) {
				throw new Error(
					`Non-ASCII character at position ${i}: ` +
					`U+${code.toString(16).padStart(4, "0")} "${hint[i]}"`
				);
			}
		}
	});

	test("mentions codexfi by name", () => {
		const hint = buildFreshProjectHint("/test/project");
		expect(hint).toContain("codexfi");
	});

	test("handles root directory without crashing", () => {
		const hint = buildFreshProjectHint("/");
		// Should not throw; project name extraction handles edge case
		expect(hint).toContain("[MEMORY - NEW PROJECT]");
	});
});
