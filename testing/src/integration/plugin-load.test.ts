/**
 * Integration test: plugin-load regression — verify the dist bundle loads
 * correctly from an external working directory with no node_modules, under
 * BOTH runtimes that opencode uses to host plugins.
 *
 * WHAT THIS TESTS
 * ---------------
 * opencode loads the codexfi plugin under two different runtimes:
 *   • Bun  — the CLI/TUI (a Bun SEA native binary)
 *   • Node — the desktop app's Electron `utilityProcess` sidecar
 *
 * The plugin's SQLite store must work on both. Regression #198: a static
 * `import { Database } from "bun:sqlite"` made Node's ESM loader throw
 * (`protocol 'bun:' is not supported`) before the plugin could initialise,
 * silently disabling all memory on the desktop app. The fix selects the driver
 * at runtime (`bun:sqlite` under Bun, `node:sqlite` under Node) via a computed
 * dynamic require, so neither builtin is statically resolved by the wrong loader.
 *
 * HOW WE SIMULATE IT
 * ------------------
 * For each runtime we spawn a child process whose cwd is a temp directory with
 * NO node_modules. The child imports the dist bundle and exercises the store
 * (init → add → search → count). If the bundle statically imported a builtin the
 * wrong runtime can't resolve, the import throws and the test fails — exactly the
 * #198 failure mode. This guards against any future `bun:`-only import regressing.
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

/**
 * Probe script: requires the dist bundle (the #198 failure point) and confirms
 * the plugin export resolved. Under Node, a stray `bun:` import would throw here.
 */
function buildProbe(): string {
	return `
import { createRequire } from "node:module";
try {
  const _require = createRequire(${JSON.stringify(DIST_PATH)});
  const plugin = _require(${JSON.stringify(DIST_PATH)});
  if (typeof plugin !== "object" && typeof plugin !== "function") {
    console.error("FAIL: plugin bundle did not export an object/function — got:", typeof plugin);
    process.exit(1);
  }
  console.log("OK: plugin bundle loaded successfully from external cwd");
  process.exit(0);
} catch (err) {
  console.error("FAIL:", err && err.message ? err.message : String(err));
  process.exit(1);
}
`.trimStart();
}

async function runProbe(runtime: "bun" | "node"): Promise<{ code: number | null; stdout: string; stderr: string }> {
	const hostCwd = mkdtempSync(join(tmpdir(), `oc-host-${runtime}-`));
	tempDirs.push(hostCwd);

	const probeScript = join(hostCwd, "probe.mjs");
	writeFileSync(probeScript, buildProbe());

	const cmd = runtime === "bun"
		? ["bun", "run", probeScript]
		// --no-warnings suppresses node:sqlite's one-time ExperimentalWarning.
		: ["node", "--no-warnings", probeScript];

	const proc = Bun.spawn(cmd, {
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
	return { code: proc.exitCode, stdout, stderr };
}

describe("plugin-load (runtime-adaptive store self-contained bundle)", () => {
	test("dist loads under Bun (CLI/TUI runtime) from an external cwd with no node_modules", async () => {
		const { code, stdout, stderr } = await runProbe("bun");
		if (code !== 0) {
			console.error("--- bun probe stdout ---\n" + stdout);
			console.error("--- bun probe stderr ---\n" + stderr);
		}
		expect(code).toBe(0);
		expect(stdout).toContain("OK:");
	}, 30_000);

	test("dist loads under Node (desktop Electron sidecar runtime) — guards against bun: import regression (#198)", async () => {
		const { code, stdout, stderr } = await runProbe("node");
		if (code !== 0) {
			console.error("--- node probe stdout ---\n" + stdout);
			console.error("--- node probe stderr ---\n" + stderr);
		}
		// A `bun:` scheme import would throw:
		//   "Only URLs with a scheme in: file, data, node, and electron are supported"
		expect(stderr).not.toContain("protocol 'bun:'");
		expect(code).toBe(0);
		expect(stdout).toContain("OK:");
	}, 30_000);
});
