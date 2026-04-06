/**
 * db.ts — thin adapter over the SQLite vector store.
 *
 * All plugin code goes through this module to reach the store.
 */

import * as vs from "./store/index.js";

export async function init(storePath?: string): Promise<void> {
	if (storePath) {
		// Allow tests / CLI to override the store path via env var
		process.env.CODEXFI_DATA_DIR = storePath;
	}
	vs.init();
}

/** Reload store — runs a WAL checkpoint to pick up writes from other processes. */
export async function refresh(): Promise<void> {
	vs.reload();
}

export { vs as store };
