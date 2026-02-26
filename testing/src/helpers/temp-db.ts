/**
 * Temporary LanceDB database helper for isolated test runs.
 *
 * Creates a fresh LanceDB instance in a temp directory for each test suite,
 * ensuring tests never touch the real ~/.opencode-memory/ database.
 * Cleans up on teardown.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as db from "../../../plugin/src/db.js";

let tempDir: string;

/**
 * Create a fresh temp directory and initialize LanceDB in it.
 * Call this in beforeAll() or beforeEach().
 */
export async function setupTempDb(): Promise<string> {
	tempDir = mkdtempSync(join(tmpdir(), "oc-test-db-"));
	await db.init(tempDir);
	return tempDir;
}

/**
 * Remove the temp directory. Call this in afterAll() or afterEach().
 * Silently ignores errors (e.g. dir already removed).
 */
export function teardownTempDb(): void {
	if (tempDir) {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Best effort — temp dirs get cleaned by OS eventually
		}
	}
}

export { tempDir };
