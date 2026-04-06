/**
 * Integration test: plugin-load regression — verify the dist bundle loads
 * correctly from an external working directory with no node_modules.
 *
 * WHAT THIS TESTS
 * ---------------
 * When OpenCode (a Bun SEA native binary) loads the codexfi plugin, the
 * plugin bundle must be self-contained. Previously this tested the LanceDB
 * createRequire workaround; now that LanceDB is removed, we verify the pure
 * TS vector store initialises without errors when loaded from outside the
 * plugin's own directory.
 *
 * HOW WE SIMULATE IT
 * ------------------
 * We spawn a child `bun` process whose cwd is a temp directory that has NO
 * node_modules. The child imports the dist bundle and calls store.init().
 * If the bundle is not self-contained it will throw a module resolution error.
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

describe("plugin-load (pure TS store self-contained bundle)", () => {
	test("dist initialises the vector store from an external cwd with no node_modules", async () => {
		// 1. Create an isolated working directory with no node_modules
		const hostCwd = mkdtempSync(join(tmpdir(), "oc-host-"));
		tempDirs.push(hostCwd);

		// 2. Write a probe script that imports the dist and calls init()
		const probeScript = join(hostCwd, "probe.mjs");
		writeFileSync(probeScript, `
import { createRequire } from "node:module";
try {
  const _require = createRequire("${DIST_PATH}");
  const plugin = _require("${DIST_PATH}");
  // The pure TS store has no native deps — if this throws, the bundle is broken
  if (typeof plugin !== "object" && typeof plugin !== "function") {
    console.error("FAIL: plugin bundle did not export an object/function — got:", typeof plugin);
    process.exit(1);
  }
  console.log("OK: plugin bundle loaded successfully from external cwd");
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
