/**
 * store/sqlite.ts — SQLite connection management with WAL mode.
 *
 * Uses bun:sqlite (zero npm deps, built into Bun runtime).
 * WAL mode enables concurrent readers + serialised writers via busy_timeout.
 *
 * Connection lifecycle:
 *   open(dbPath)  — create/open DB, apply pragmas, run schema
 *   close()       — close the connection
 *   getDb()       — return the active Database instance (throws if not open)
 *
 * Test isolation:
 *   _openForTests(dir) — open a DB in a temp directory
 *   _resetForTests()   — close + clear so init() re-opens fresh
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CREATE_TABLE, CREATE_INDEXES } from "./schema.js";

let db: Database | null = null;
let currentPath: string | null = null;

/**
 * Open (or create) the SQLite database and apply WAL pragmas + schema.
 * Idempotent — if already open at the same path, does nothing.
 */
export function open(dbPath: string): void {
	if (db && currentPath === dbPath) return;

	// Close any existing connection before opening a new one
	if (db) {
		try { db.close(); } catch { /* ignore */ }
	}

	mkdirSync(dirname(dbPath), { recursive: true });

	db = new Database(dbPath);

	// Set busy_timeout FIRST — all subsequent PRAGMAs may need the write lock
	// and must wait instead of failing with SQLITE_BUSY
	db.run("PRAGMA busy_timeout = 5000");
	// WAL mode: concurrent readers + serialised writers
	db.run("PRAGMA journal_mode = WAL");
	// NORMAL sync is safe for WAL — avoids fsync on every commit
	db.run("PRAGMA synchronous = NORMAL");
	// 20MB page cache for search performance
	db.run("PRAGMA cache_size = -20000");
	// Temp tables in memory
	db.run("PRAGMA temp_store = MEMORY");

	// Create schema (idempotent)
	db.run(CREATE_TABLE);
	for (const sql of CREATE_INDEXES) {
		db.run(sql);
	}

	currentPath = dbPath;
}

/** Close the database connection. Safe to call multiple times. */
export function close(): void {
	if (db) {
		try { db.close(); } catch { /* ignore */ }
		db = null;
		currentPath = null;
	}
}

/**
 * Get the active Database instance.
 * @throws Error if the database has not been opened yet.
 */
export function getDb(): Database {
	if (!db) {
		throw new Error("[codexfi] SQLite database not initialized — call init() first");
	}
	return db;
}

/** Return the current database file path, or null if not open. */
export function getPath(): string | null {
	return currentPath;
}

// ── Test helpers ────────────────────────────────────────────────────────────────

/**
 * Open a database in a temp directory for test isolation.
 * FOR TESTS ONLY — call before any CRUD to avoid touching ~/.codexfi/store/store.db.
 */
export function _openForTests(dir: string): void {
	close();
	open(join(dir, "store.db"));
}

/**
 * Close the database and reset internal state so init() will re-open fresh.
 * FOR TESTS ONLY.
 */
export function _resetForTests(): void {
	close();
}
