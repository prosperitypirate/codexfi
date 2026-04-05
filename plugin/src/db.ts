// Use createRequire instead of a static ESM import so that Bun SEA (OpenCode's
// runtime) resolves @lancedb/lancedb from THIS file's location rather than the
// host binary's module resolver, which doesn't see codexfi's node_modules.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import type * as LanceDB from "@lancedb/lancedb";
import { EMBEDDING_DIMS } from "./config.js";

const _require = createRequire(import.meta.url);
const lancedb = _require("@lancedb/lancedb") as typeof LanceDB;

const DB_PATH = join(homedir(), ".codexfi", "lancedb");
const TABLE_NAME = "memories";

let db: LanceDB.Connection;
let table: LanceDB.Table;

export async function init(dbPath?: string): Promise<void> {
	db = await lancedb.connect(dbPath ?? DB_PATH);
	try {
		table = await db.openTable(TABLE_NAME);
	} catch {
		// First run — create table with seed row to define schema, then delete it.
		// Uses EMBEDDING_DIMS to stay in sync with the embedding model.
		table = await db.createTable(TABLE_NAME, [{
			id: "__seed__",
			memory: "",
			user_id: "",
			vector: new Array(EMBEDDING_DIMS).fill(0),
			metadata_json: "{}",
			created_at: "",
			updated_at: "",
			hash: "",
			chunk: "",
			superseded_by: "",
			type: "",
		}]);
		await table.delete('id = "__seed__"');
	}
}

export function getTable(): LanceDB.Table {
	if (!table) throw new Error("LanceDB not initialized — call init() first");
	return table;
}

/**
 * Re-open the table to pick up writes from other processes.
 * LanceDB caches table state; cross-process reads need a refresh.
 */
export async function refresh(): Promise<void> {
	if (!db) throw new Error("LanceDB not initialized — call init() first");
	table = await db.openTable(TABLE_NAME);
}

export function getDb(): LanceDB.Connection {
	if (!db) throw new Error("LanceDB not initialized — call init() first");
	return db;
}
