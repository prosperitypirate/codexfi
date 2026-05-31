/**
 * Integration test: store round-trip under the Node runtime (node:sqlite).
 *
 * WHY A SEPARATE, NODE-SPAWNED TEST
 * ---------------------------------
 * The rest of the suite runs under Bun (`bun test`), which always exercises the
 * `bun:sqlite` driver. The desktop app, however, hosts the plugin under Node
 * (Electron `utilityProcess`), where the store uses `node:sqlite`. Issue #198's
 * highest-risk item was whether the Float32 vector BLOB persists byte-identically
 * under `node:sqlite`. This test pins that behaviour permanently by:
 *
 *   1. Bundling a probe that imports the real store (`plugin/src/store`) with
 *      `bun build --target node` — the exact build the published plugin uses.
 *   2. Executing it under `node`, with a temp CODEXFI_DATA_DIR.
 *   3. Asserting the driver is `node:sqlite` and the vector round-trips exactly.
 *
 * If a future change reintroduces a Bun-only import, the bundle fails to load
 * under Node and this test fails — the same failure mode users hit in #198.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const STORE_ENTRY = resolve(__dirname, "../../../plugin/src/store/index.ts");
const DRIVER_ENTRY = resolve(__dirname, "../../../plugin/src/store/driver.ts");

let workDir: string;
let bundlePath: string;

const tempDirs: string[] = [];

afterAll(() => {
	for (const dir of tempDirs) {
		try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
	}
});

beforeAll(async () => {
	workDir = mkdtempSync(join(tmpdir(), "codexfi-node-store-"));
	tempDirs.push(workDir);

	// Probe imports the REAL store + driver and performs a full round-trip.
	const probeTs = join(workDir, "probe.ts");
	writeFileSync(probeTs, `
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from ${JSON.stringify(STORE_ENTRY)};
import { driverName } from ${JSON.stringify(DRIVER_ENTRY)};

const dir = mkdtempSync(join(tmpdir(), "codexfi-node-db-"));
store._setStorePathForTests(dir);

const vec = new Float32Array(1024);
for (let i = 0; i < vec.length; i++) vec[i] = Math.sin(i) * 0.5;

store.add([{
  id: "m1", memory: "hello node", user_id: "u", vector: vec,
  metadata_json: JSON.stringify({ k: "v" }),
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  hash: "h1", chunk: "", superseded_by: "", type: "fact",
}]);

const got = store.getById("m1");
if (!got) { console.error("FAIL: getById returned undefined"); process.exit(1); }

// Byte-identical BLOB round-trip check.
let identical = got.vector.length === vec.length;
for (let i = 0; i < vec.length && identical; i++) {
  if (got.vector[i] !== vec[i]) identical = false;
}

const results = store.search(vec, { limit: 3 });
const top = results[0];

console.log(JSON.stringify({
  driver: driverName(),
  count: store.countRows(),
  vectorIdentical: identical,
  topId: top ? top.id : null,
  topDistance: top ? Number(top._distance.toFixed(6)) : null,
}));
`.trimStart());

	// Bundle for the Node target — same as the shipped plugin build.
	bundlePath = join(workDir, "probe.node.mjs");
	const build = Bun.spawn(
		["bun", "build", probeTs, "--outfile", bundlePath, "--target", "node"],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const buildErr = await new Response(build.stderr).text();
	await build.exited;
	if (build.exitCode !== 0) {
		throw new Error("probe bundle failed:\n" + buildErr);
	}
});

describe("store round-trip under Node runtime (node:sqlite)", () => {
	test("loads, persists and reads a Float32 vector BLOB byte-identically (#198)", async () => {
		const proc = Bun.spawn(["node", "--no-warnings", bundlePath], {
			cwd: workDir,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		await proc.exited;

		if (proc.exitCode !== 0) {
			console.error("--- node store probe stdout ---\n" + stdout);
			console.error("--- node store probe stderr ---\n" + stderr);
		}

		// Must not hit the #198 bun: scheme failure.
		expect(stderr).not.toContain("protocol 'bun:'");
		expect(proc.exitCode).toBe(0);

		const line = stdout.trim().split("\n").pop() ?? "{}";
		const result = JSON.parse(line) as {
			driver: string; count: number; vectorIdentical: boolean;
			topId: string | null; topDistance: number | null;
		};

		expect(result.driver).toBe("node:sqlite"); // confirms the Node path ran
		expect(result.count).toBe(1);
		expect(result.vectorIdentical).toBe(true); // byte-identical BLOB round-trip
		expect(result.topId).toBe("m1");
		expect(result.topDistance).toBe(0); // identical vector → zero cosine distance
	}, 30_000);
});
