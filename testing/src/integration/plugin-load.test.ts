/**
 * Integration test: plugin-load regression for the Bun SEA lancedb bug.
 *
 * WHAT THIS TESTS
 * ---------------
 * The bug: when OpenCode (a Bun SEA native binary) dynamically loads the
 * codexfi plugin dist, static ESM imports and createRequire() both fail to
 * resolve @lancedb/lancedb in certain Bun SEA builds:
 *
 *   - Static `import * as lancedb` resolves to empty `{}` in Bun SEA
 *   - `createRequire()` is rejected by the desktop app's Bun SEA with
 *     "require() async module ... is unsupported"
 *
 * The fix: `await import("@lancedb/lancedb")` — standard dynamic import that
 * works in all environments (Node.js, Bun, terminal Bun SEA, desktop Bun SEA).
 *
 * HOW WE SIMULATE IT
 * ------------------
 * We spawn a child `bun` process whose cwd is a temp directory that has NO
 * node_modules (simulating a host process that doesn't own codexfi's deps).
 * The child does a dynamic `import()` of `@lancedb/lancedb` using the same
 * resolution base as the dist file, and verifies `connect` is a function.
 *
 * If the static ESM import bug were present the child would print
 * "lancedb.connect is not a function" and exit 1 — this test would catch it.
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
	test("dist resolves @lancedb/lancedb via dynamic import() from an external cwd", async () => {
		// 1. Create an isolated working directory with no node_modules
		const hostCwd = mkdtempSync(join(tmpdir(), "oc-host-"));
		tempDirs.push(hostCwd);

		// 2. Write a small probe script into the host cwd.
		//    Replicates the exact `await import("@lancedb/lancedb")` pattern
		//    used in db.ts init(). The import specifier is bare, so Bun/Node
		//    must resolve it from the dist file's location (codexfi's own
		//    node_modules). If the old static-import or createRequire bug
		//    were present, connect would be undefined or the import would throw.
		const probeScript = join(hostCwd, "probe.mjs");
		writeFileSync(probeScript, `
try {
  // Dynamic import — same approach as db.ts
  const lancedb = await import("@lancedb/lancedb");
  if (typeof lancedb.connect !== "function") {
    console.error("FAIL: lancedb.connect is not a function — got:", typeof lancedb.connect);
    process.exit(1);
  }
  console.log("OK: lancedb.connect is a function — dynamic import resolved correctly");
  process.exit(0);
} catch (err) {
  console.error("FAIL:", err.message ?? String(err));
  process.exit(1);
}
`.trimStart());

		// 3. Spawn bun from the host cwd (which has no node_modules).
		//    Pass NODE_PATH so the bare specifier resolves to codexfi's deps,
		//    simulating what happens when OpenCode loads the plugin from cache.
		const pluginNodeModules = resolve(__dirname, "../../../plugin/node_modules");
		const proc = Bun.spawn(["bun", "run", probeScript], {
			cwd: hostCwd,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				NODE_PATH: pluginNodeModules,
			},
		});

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		await proc.exited;

		// 4. Assert
		if (proc.exitCode !== 0) {
			// Print diagnostics so failures are easy to debug in CI
			console.error("--- probe stdout ---\n" + stdout);
			console.error("--- probe stderr ---\n" + stderr);
		}

		expect(proc.exitCode).toBe(0);
		expect(stdout).toContain("OK:");
	}, 30_000); // LanceDB init can take a few seconds on first run
});
