import * as lancedb from "@lancedb/lancedb";
import { homedir } from "node:os";
import { join } from "node:path";
import { EMBEDDING_DIMS } from "./config.js";

const DB_PATH = join(homedir(), ".codexfi", "lancedb");
const TABLE_NAME = "memories";

let db: lancedb.Connection;
let table: lancedb.Table;

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

export function getTable(): lancedb.Table {
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

export function getDb(): lancedb.Connection {
	if (!db) throw new Error("LanceDB not initialized — call init() first");
	return db;
}
