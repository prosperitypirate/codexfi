/**
 * store/index.ts — Public API for the SQLite vector store.
 *
 * Persistence: ~/.codexfi/store/store.db (SQLite WAL mode)
 * Concurrency: readers never blocked, writers serialised via busy_timeout(5s)
 */

import { join } from "node:path";
import { DATA_DIR } from "../config.js";
import { open, getDb, _openForTests, _resetForTests as _sqliteReset } from "./sqlite.js";
import { add, bulkAdd, update, deleteById, getById, countRows, scan } from "./crud.js";
import { search } from "./search.js";

// Re-export types so consumers import from a single location
export type {
	MemoryRecord,
	AddRecord,
	UpdateValues,
	SearchResult,
	FilterOptions,
} from "./types.js";

// Re-export CRUD + search (unchanged signatures)
export { add, bulkAdd, update, deleteById, getById, countRows, scan, search };

// ── Lifecycle ───────────────────────────────────────────────────────────────────

let initialised = false;

/**
 * Initialise the store — open SQLite DB with WAL mode.
 * Safe to call multiple times (idempotent after first call).
 */
export function init(): void {
	if (initialised) return;
	initialised = true;
	const dbPath = join(DATA_DIR, "store", "store.db");
	open(dbPath);
}

/**
 * Reload the store — checkpoint WAL to ensure reads see latest writes.
 * Used by the dashboard server to pick up writes from the plugin process.
 *
 * With SQLite WAL, every SELECT already sees the latest committed data,
 * but a PASSIVE checkpoint merges the WAL into the main DB file for
 * durability and to prevent unbounded WAL growth.
 */
export function reload(): void {
	// No-op needed for data freshness (WAL handles this), but run a
	// passive checkpoint to keep WAL file size bounded.
	try {
		getDb().run("PRAGMA wal_checkpoint(PASSIVE)");
	} catch {
		// Ignore — DB may not be open (e.g. tests)
	}
}

// ── Test helpers ────────────────────────────────────────────────────────────────

/**
 * Reset in-memory state and close DB.
 * FOR TESTS ONLY — resets the initialised flag so init() will re-open.
 */
export function _resetForTests(): void {
	_sqliteReset();
	initialised = false;
}

/**
 * Redirect store to a temp directory for test isolation.
 * FOR TESTS ONLY — opens a fresh SQLite DB at dir/store.db.
 */
export function _setStorePathForTests(dir: string): void {
	_openForTests(dir);
	initialised = true; // Mark as initialised so init() doesn't reopen at default path
}
