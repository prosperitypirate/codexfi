/**
 * Temporary vector store helper for isolated test runs.
 *
 * Creates a fresh store in a temp directory for each test suite,
 * ensuring tests never touch the real ~/.codexfi/ store.
 * Cleans up on teardown.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as db from "../../../plugin/src/db.js";
import * as vs from "../../../plugin/src/vector-store.js";

let tempDir: string;

/**
 * Create a fresh temp directory and redirect the vector store to it.
 * Call this in beforeAll() or beforeEach().
 *
 * IMPORTANT: this redirects persist() to the temp dir so tests never
 * write to the real ~/.codexfi/store.jsonl.
 */
export async function setupTempDb(): Promise<string> {
	tempDir = mkdtempSync(join(tmpdir(), "oc-test-db-"));
	// Redirect store path BEFORE init so any persist() calls go to tempDir
	vs._setStorePathForTests(tempDir);
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
