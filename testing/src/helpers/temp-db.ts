/**
 * Temporary SQLite store helper for isolated test runs.
 *
 * Creates a fresh store in a temp directory for each test suite,
 * ensuring tests never touch the real ~/.codexfi/ store (the preload
 * sandbox already redirects CODEXFI_DATA_DIR; this gives each suite its own DB).
 * Cleans up on teardown.
 */

import { rmSync } from "node:fs";
import * as db from "../../../plugin/src/db.js";
import * as vs from "../../../plugin/src/store/index.js";
import { makeTempDir } from "./test-env.js";

let tempDir: string;

/**
 * Create a fresh temp directory and redirect the SQLite store to it.
 * Call this in beforeAll() or beforeEach().
 *
 * IMPORTANT: this redirects the database to the temp dir so tests never
 * write to the real ~/.codexfi/store.db.
 */
export async function setupTempDb(): Promise<string> {
	tempDir = makeTempDir("db");
	// Redirect store path BEFORE init so any writes go to tempDir. db.init() is
	// then a no-op; it is called WITHOUT a path on purpose — db.init(path)
	// rewrites process.env.CODEXFI_DATA_DIR, which would leak into subprocesses.
	vs._setStorePathForTests(tempDir);
	await db.init();
	return tempDir;
}

/**
 * Remove the temp directory. Call this in afterAll() or afterEach().
 * Silently ignores errors (e.g. dir already removed).
 */
export function teardownTempDb(): void {
	vs._resetForTests();
	if (tempDir) {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Best effort — temp dirs get cleaned by OS eventually
		}
	}
}

export { tempDir };
