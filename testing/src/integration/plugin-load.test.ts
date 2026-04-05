/**
 * Integration test: plugin-load regression for the Bun SEA lancedb bug.
 *
 * WHAT THIS TESTS
 * ---------------
 * When OpenCode (a Bun SEA native binary) loads the codexfi plugin, a plain
 * static `import * as lancedb from "@lancedb/lancedb"` resolves to an empty
 * namespace `{}` because the Bun SEA resolver looks inside the host binary
 * instead of the plugin's node_modules on disk.
 *
 * The fix: `createRequire(import.meta.url)("@lancedb/lancedb")` which
 * resolves from the dist file's actual filesystem location.
 *
 * HOW WE SIMULATE IT
 * ------------------
 * We spawn a child `bun` process whose cwd is a temp directory that has NO
 * node_modules (simulating a host process that doesn't own codexfi's deps).
 * The child uses createRequire anchored to the dist file path, same as db.ts.
 *
 * If the static ESM import bug were present the child would print
 * "lancedb.connect is not a function" and exit 1.
 */

import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Absolute path to the built dist — must be built before running this test.
const DIST_PATH = resolve(__dirname, "../../../plugin/dist/index.js");

let tempDirs: string[] = [];

afterAll(() => {
	for (const dir of tempDirs) {
		try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
	}
});

describe("plugin-load (Bun SEA lancedb regression)", () => {
	test("dist resolves @lancedb/lancedb via createRequire from an external cwd", async () => {
		// 1. Create an isolated working directory with no node_modules
		const hostCwd = mkdtempSync(join(tmpdir(), "oc-host-"));
		tempDirs.push(hostCwd);

		// 2. Write a probe script that uses createRequire (same as db.ts)
		const probeScript = join(hostCwd, "probe.mjs");
		writeFileSync(probeScript, `
import { createRequire } from "node:module";
try {
  const _require = createRequire("${DIST_PATH}");
  const lancedb = _require("@lancedb/lancedb");
  if (typeof lancedb.connect !== "function") {
    console.error("FAIL: lancedb.connect is not a function — got:", typeof lancedb.connect);
    process.exit(1);
  }
  console.log("OK: lancedb.connect is a function — createRequire resolved correctly");
  process.exit(0);
} catch (err) {
  console.error("FAIL:", err.message ?? String(err));
  process.exit(1);
}
`.trimStart());

		// 3. Spawn bun from the host cwd (no node_modules).
		const proc = Bun.spawn(["bun", "run", probeScript], {
			cwd: hostCwd,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		await proc.exited;

		// 4. Assert
		if (proc.exitCode !== 0) {
			console.error("--- probe stdout ---\n" + stdout);
			console.error("--- probe stderr ---\n" + stderr);
		}

		expect(proc.exitCode).toBe(0);
		expect(stdout).toContain("OK:");
	}, 30_000);
});
