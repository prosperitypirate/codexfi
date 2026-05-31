/**
 * store/driver.ts — Runtime-adaptive SQLite driver.
 *
 * codexfi keeps a local-first SQLite store, but the plugin must load under two
 * different JavaScript runtimes:
 *
 *   • Bun   (opencode CLI/TUI)          → `bun:sqlite`   (built-in)
 *   • Node  (opencode desktop sidecar,  → `node:sqlite`   (built-in, Node 22.5+)
 *            an Electron utilityProcess)
 *
 * A static `import { Database } from "bun:sqlite"` makes Node's ESM loader throw
 * (`protocol 'bun:' is not supported`) before the plugin can even initialise,
 * silently disabling all memory functionality on the desktop app (issue #198).
 *
 * The fix: detect the runtime and load the matching builtin through a **computed**
 * `require()` specifier. Because the specifier is a variable, neither the bundler
 * (`bun build --target node`) nor the host loader statically resolves the wrong
 * builtin — the unused one is never touched.
 *
 * The adapter exposes a tiny, unified `DatabaseLike` surface that both drivers
 * satisfy. Behavioural deltas handled here:
 *
 *   | Concern        | bun:sqlite              | node:sqlite                       |
 *   |----------------|-------------------------|-----------------------------------|
 *   | open           | new Database(path)      | new DatabaseSync(path)            |
 *   | DDL / pragma   | db.run(sql)             | db.exec(sql)                      |
 *   | prepare        | db.prepare(sql)         | db.prepare(sql)        (identical)|
 *   | run/get/all    | stmt.run/get/all(...p)  | stmt.run/get/all(...p) (identical)|
 *   | transaction    | db.transaction(fn)      | manual BEGIN/COMMIT/ROLLBACK      |
 *   | BLOB read type | Buffer                  | Uint8Array (handled by crud.ts)   |
 *
 * Both runtimes use positional `?` / numbered `?1` placeholders and accept
 * Buffer/Uint8Array for BLOB binds, so prepared statements pass straight through.
 */

import { createRequire } from "node:module";

/**
 * Values that can be bound to a parameterised statement placeholder.
 *
 * Covers every SQLite storage class the store uses: TEXT (`string`),
 * INTEGER/REAL (`number`/`bigint`/`boolean`), NULL (`null`), and BLOB
 * (`Uint8Array` — `Buffer` is a subclass, so vector blobs bind directly).
 */
export type Bindings =
	| string
	| number
	| bigint
	| boolean
	| null
	| Uint8Array;

/**
 * A compiled, reusable prepared statement.
 *
 * Both drivers expose the same `run`/`get`/`all` surface and accept positional
 * (`?`) or numbered (`?1`) placeholders bound via trailing parameters.
 */
export interface Statement {
	/** Execute the statement for its side effects (INSERT/UPDATE/DELETE). */
	run(...params: Bindings[]): unknown;
	/** Execute and return the first matching row, or `undefined`/`null` if none. */
	get(...params: Bindings[]): unknown;
	/** Execute and return all matching rows as an array. */
	all(...params: Bindings[]): unknown[];
}

/** Minimal SQLite surface the store relies on. */
export interface DatabaseLike {
	/** Execute raw SQL with no result (DDL / PRAGMA / transaction control). */
	run(sql: string): void;
	/** Compile a parameterised statement for reuse. */
	prepare(sql: string): Statement;
	/** Wrap `fn` in a single transaction; returns a callable that runs it. */
	transaction(fn: () => void): () => void;
	/** Close the underlying connection. */
	close(): void;
}

/**
 * Detect whether the current process is running under the Bun runtime.
 *
 * Used to choose the matching built-in SQLite driver. Bun hosts the opencode
 * CLI/TUI; Node (Electron `utilityProcess`) hosts the desktop sidecar.
 *
 * @returns `true` under Bun (CLI/TUI), `false` under Node/Electron (desktop).
 */
export function isBun(): boolean {
	return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

/**
 * The name of the SQLite driver that will be selected for the active runtime.
 *
 * Diagnostic helper — surfaced in logs/tests to confirm which builtin is live.
 *
 * @returns `"bun:sqlite"` under Bun, `"node:sqlite"` under Node/Electron.
 */
export function driverName(): "bun:sqlite" | "node:sqlite" {
	return isBun() ? "bun:sqlite" : "node:sqlite";
}

// createRequire lets us load a built-in module synchronously from an ESM context.
// The specifier is computed (a variable), so static analysis never resolves it.
const requireBuiltin = createRequire(import.meta.url);

/**
 * Open (or create) a SQLite database at `path`, returning a runtime-agnostic
 * handle. The correct native driver (`bun:sqlite` or `node:sqlite`) is selected
 * for the active runtime and loaded lazily via a computed `require`.
 *
 * @param path - Absolute filesystem path to the SQLite database file. Created
 *   if it does not exist (the caller is responsible for the parent directory).
 * @returns A {@link DatabaseLike} handle wrapping the runtime-specific driver.
 */
export function openDatabase(path: string): DatabaseLike {
	// Computed specifier — prevents the wrong builtin from being statically
	// resolved by Node's ESM loader or bundled by `bun build`.
	const moduleName = isBun() ? "bun:sqlite" : "node:sqlite";

	if (isBun()) {
		const { Database } = requireBuiltin(moduleName) as {
			Database: new (p: string) => BunDatabase;
		};
		return wrapBun(new Database(path));
	}

	const { DatabaseSync } = requireBuiltin(moduleName) as {
		DatabaseSync: new (p: string) => NodeDatabase;
	};
	return wrapNode(new DatabaseSync(path));
}

// ── Bun adapter ───────────────────────────────────────────────────────────────

interface BunDatabase {
	run(sql: string): unknown;
	prepare(sql: string): Statement;
	transaction(fn: () => void): () => void;
	close(): void;
}

function wrapBun(db: BunDatabase): DatabaseLike {
	return {
		run: (sql) => { db.run(sql); },
		prepare: (sql) => db.prepare(sql),
		// Bun has a first-class transaction helper.
		transaction: (fn) => db.transaction(fn),
		close: () => db.close(),
	};
}

// ── Node adapter (node:sqlite) ──────────────────────────────────────────────────

interface NodeDatabase {
	exec(sql: string): void;
	prepare(sql: string): Statement;
	close(): void;
}

function wrapNode(db: NodeDatabase): DatabaseLike {
	return {
		// node:sqlite uses exec() for statements that return no rows.
		run: (sql) => { db.exec(sql); },
		prepare: (sql) => db.prepare(sql),
		// node:sqlite has no transaction() helper — wrap manually. Returning a
		// callable mirrors Bun's API so call sites are identical.
		transaction: (fn) => () => {
			db.exec("BEGIN");
			try {
				fn();
				db.exec("COMMIT");
			} catch (err) {
				try { db.exec("ROLLBACK"); } catch { /* already rolled back */ }
				throw err;
			}
		},
		close: () => db.close(),
	};
}
