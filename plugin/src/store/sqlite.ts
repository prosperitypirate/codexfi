/**
 * store/sqlite.ts — SQLite connection management with WAL mode.
 *
 * Uses a runtime-adaptive driver (see driver.ts): `bun:sqlite` under Bun
 * (CLI/TUI) and `node:sqlite` under Node/Electron (desktop sidecar). Both are
 * built-in — zero npm/native dependencies on either runtime.
 *
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

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CREATE_TABLE, CREATE_INDEXES, LEGACY_EMBED_MODEL } from "./schema.js";
import { openDatabase, type DatabaseLike } from "./driver.js";

let db: DatabaseLike | null = null;
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

	db = openDatabase(dbPath);

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

	// Create schema (idempotent), then migrate older databases forward
	db.run(CREATE_TABLE);
	migrate(db);
	for (const sql of CREATE_INDEXES) {
		db.run(sql);
	}

	currentPath = dbPath;
}

/**
 * Forward-only migrations for databases created by older codexfi versions.
 * Each step checks the live schema first, so it is safe to run on every open.
 */
function migrate(conn: DatabaseLike): void {
	const hasColumn = () =>
		(conn.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).some((c) => c.name === "embed_model");
	if (hasColumn()) return;
	// Several hook/worker processes may open an old database at the same moment.
	// BEGIN IMMEDIATE takes the write lock (waiting up to busy_timeout), and the
	// column is re-checked inside the transaction so only the first one migrates.
	conn.run("BEGIN IMMEDIATE");
	try {
		if (!hasColumn()) {
			conn.run("ALTER TABLE memories ADD COLUMN embed_model TEXT NOT NULL DEFAULT ''");
			// Label every pre-1.0 row with the legacy marker so the local re-embed
			// pass can find and migrate them (see LEGACY_EMBED_MODEL).
			conn.prepare("UPDATE memories SET embed_model = ? WHERE embed_model = ''").run(LEGACY_EMBED_MODEL);
		}
		conn.run("COMMIT");
	} catch (e) {
		try { conn.run("ROLLBACK"); } catch { /* already rolled back */ }
		if (!hasColumn()) throw e;
	}
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
export function getDb(): DatabaseLike {
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
