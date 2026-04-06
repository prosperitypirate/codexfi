/**
 * db.ts — thin adapter over vector-store.ts.
 *
 * All plugin code goes through this module to reach the pure TS vector store.
 */

import * as vs from "./vector-store.js";

export async function init(storePath?: string): Promise<void> {
	if (storePath) {
		// Allow tests / CLI to override the store path via env var
		process.env.CODEXFI_DATA_DIR = storePath;
	}
	vs.init();
}

/** Reload store from disk — picks up writes from other processes (e.g. plugin → dashboard). */
export async function refresh(): Promise<void> {
	vs.reload();
}

export { vs as store };
