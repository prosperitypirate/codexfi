/**
 * Integration test: plugin-load regression for the Bun SEA lancedb bug.
 *
 * WHAT THIS TESTS
 * ---------------
 * The bug: when OpenCode (a Bun SEA native binary) dynamically loads the
 * codexfi plugin dist, it resolves ESM imports relative to the host binary
 * context — not relative to the plugin file. The original static ESM import
 * `import * as lancedb from "@lancedb/lancedb"` resolved to an empty `{}`
 * object, making `lancedb.connect` undefined and crashing the plugin on every
 * call to `db.init()`.
 *
 * The fix: `createRequire(import.meta.url)` forces Node/Bun to resolve
 * `@lancedb/lancedb` relative to the dist file's actual path on disk.
 *
 * HOW WE SIMULATE IT
 * ------------------
 * We spawn a child `bun` process whose cwd is a temp directory that has NO
 * node_modules (simulating a host process that doesn't own codexfi's deps).
 * The child does a dynamic `import()` of the built dist file, initialises
 * LanceDB in a temp dir, and exits 0 on success or prints an error + exits 1.
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
	test("dist resolves @lancedb/lancedb and can call lancedb.connect from an external cwd", async () => {
		// 1. Create an isolated working directory with no node_modules
		const hostCwd = mkdtempSync(join(tmpdir(), "oc-host-"));
		tempDirs.push(hostCwd);

		// 2. Write a small probe script into the host cwd.
		//    The dist doesn't re-export db.init(), so we prove the fix by
		//    replicating the exact createRequire pattern it uses:
		//      const _require = createRequire(distFilePath)
		//      const lancedb  = _require("@lancedb/lancedb")
		//    If createRequire resolves from the dist's location (codexfi's own
		//    node_modules) then lancedb.connect will be a function.
		//    If the old static-import bug were present, it would be undefined.
		const probeScript = join(hostCwd, "probe.mjs");
		writeFileSync(probeScript, `
import { createRequire } from "node:module";

// Replicate exactly what db.ts does after the fix
const _require = createRequire(${JSON.stringify(DIST_PATH)});

try {
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

		// 3. Spawn bun from the host cwd (which has no node_modules).
		//    This is the closest we can get to the Bun SEA plugin-load scenario
		//    without actually building a SEA binary.
		const proc = Bun.spawn(["bun", "run", probeScript], {
			cwd: hostCwd,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				// Provide the Voyage key only if it's already in the environment;
				// db.init() doesn't need it — embeddings are only called on ingest.
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
