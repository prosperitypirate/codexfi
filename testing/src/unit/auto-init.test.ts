/**
 * Unit tests for project auto-init (plugin/src/claude/auto-init.ts +
 * services/auto-init-config.ts).
 *
 *   1. INIT_FILES / INIT_TOTAL_CHAR_CAP — which files seed a new project
 *   2. collectInitContent() — corpus assembly: per-file caps, total cap,
 *      git log, <private> stripping, missing files
 *
 * runAutoInit() (LLM extraction + store) is covered by the worker integration
 * test's "init" job.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeEach } from "bun:test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { INIT_FILES, INIT_TOTAL_CHAR_CAP } from "../../../plugin/src/services/auto-init-config.js";
import { collectInitContent } from "../../../plugin/src/claude/auto-init.js";
import { makeTempDir } from "../helpers/test-env.js";

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

// ── collectInitContent ─────────────────────────────────────────────

describe("collectInitContent", () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTempDir("init");
	});

	test("returns empty string for a directory with no known files and no git", () => {
		expect(collectInitContent(dir)).toBe("");
	});

	test("includes known files under === name === headers, in INIT_FILES order", () => {
		writeFileSync(join(dir, "package.json"), `{"name":"demo-app"}`);
		writeFileSync(join(dir, "README.md"), "# Demo App\nA demo.");
		writeFileSync(join(dir, "random.txt"), "not an init file");
		const out = collectInitContent(dir);
		expect(out).toContain("=== README.md ===\n# Demo App");
		expect(out).toContain("=== package.json ===\n{\"name\":\"demo-app\"}");
		expect(out.indexOf("README.md")).toBeLessThan(out.indexOf("package.json"));
		expect(out).not.toContain("not an init file");
	});

	test("caps each file at its maxChars", () => {
		const readmeCap = INIT_FILES.find((f) => f.name === "README.md")!.maxChars;
		writeFileSync(join(dir, "README.md"), "x".repeat(readmeCap + 500));
		const out = collectInitContent(dir);
		const body = out.split("=== README.md ===\n")[1]!;
		expect(body.length).toBe(readmeCap);
	});

	test("never exceeds INIT_TOTAL_CHAR_CAP of file content", () => {
		for (const f of INIT_FILES) writeFileSync(join(dir, f.name), "Q".repeat(f.maxChars));
		const out = collectInitContent(dir);
		const qs = (out.match(/Q/g) ?? []).length;
		expect(qs).toBeLessThanOrEqual(INIT_TOTAL_CHAR_CAP);
	});

	test("redacts <private> content", () => {
		writeFileSync(join(dir, "README.md"), "Public intro. <private>internal-host.corp:5432</private> End.");
		const out = collectInitContent(dir);
		expect(out).toContain("[REDACTED]");
		expect(out).not.toContain("internal-host.corp");
	});

	test("appends the recent git log for git repositories", () => {
		const git = (...args: string[]) =>
			execFileSync("git", args, {
				cwd: dir,
				stdio: "ignore",
				env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" },
			});
		git("init", "-q");
		writeFileSync(join(dir, "README.md"), "# Repo");
		git("add", "README.md");
		git("commit", "-q", "-m", "feat: initial scaffold");
		const out = collectInitContent(dir);
		expect(out).toContain("=== git log (recent) ===");
		expect(out).toContain("feat: initial scaffold");
	});
});
