/**
 * store/crud.ts — CRUD operations for the memories table.
 *
 * All queries use parameterised statements (? placeholders) — no string
 * interpolation. This is a hard project requirement.
 *
 * Vector encoding:
 *   Write: Float32Array → Buffer → BLOB
 *   Read:  BLOB (Buffer) → Float32Array
 */

import type { SQLQueryBindings } from "bun:sqlite";
import { getDb } from "./sqlite.js";
import type { MemoryRecord, AddRecord, UpdateValues, FilterOptions } from "./types.js";

// ── Vector encoding ─────────────────────────────────────────────────────────────

function toFloat32(v: number[] | Float32Array): Float32Array {
	return v instanceof Float32Array ? v : new Float32Array(v);
}

function vectorToBlob(v: Float32Array): Buffer {
	return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

function blobToVector(blob: Buffer): Float32Array {
	// Copy to a fresh ArrayBuffer to guarantee alignment
	const copy = new Uint8Array(blob).buffer;
	return new Float32Array(copy);
}

// ── Row mapping ─────────────────────────────────────────────────────────────────

/** Raw row shape from SQLite (vector is a Buffer). */
interface RawRow {
	id: string;
	memory: string;
	user_id: string;
	vector: Buffer;
	metadata_json: string;
	created_at: string;
	updated_at: string;
	hash: string;
	chunk: string;
	superseded_by: string;
	type: string;
}

function rowToRecord(row: RawRow): MemoryRecord {
	return {
		id: row.id,
		memory: row.memory,
		user_id: row.user_id,
		vector: blobToVector(row.vector),
		metadata_json: row.metadata_json,
		created_at: row.created_at,
		updated_at: row.updated_at,
		hash: row.hash,
		chunk: row.chunk,
		superseded_by: row.superseded_by,
		type: row.type,
	};
}

// ── CRUD operations ─────────────────────────────────────────────────────────────

/** Add one or more records. Overwrites if id already exists (UPSERT). */
export function add(rows: AddRecord[]): void {
	const db = getDb();
	const stmt = db.prepare(`
		INSERT OR REPLACE INTO memories
			(id, memory, user_id, vector, metadata_json, created_at, updated_at, hash, chunk, superseded_by, type)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
	`);

	const tx = db.transaction(() => {
		for (const row of rows) {
			const vec = toFloat32(row.vector);
			stmt.run(
				row.id,
				row.memory,
				row.user_id,
				vectorToBlob(vec),
				row.metadata_json,
				row.created_at,
				row.updated_at,
				row.hash,
				row.chunk,
				row.superseded_by,
				row.type,
			);
		}
	});
	tx();
}

/**
 * Add many records in a single transaction.
 * Functionally identical to add() — both use transactions.
 */
export function bulkAdd(rows: AddRecord[]): void {
	add(rows);
}

/** Update fields on a record matching `where.id`. No-op if id not found. */
export function update(where: { id: string }, values: UpdateValues): void {
	const db = getDb();

	const setClauses: string[] = [];
	const params: SQLQueryBindings[] = [];

	if (values.memory !== undefined) { setClauses.push("memory = ?"); params.push(values.memory); }
	if (values.updated_at !== undefined) { setClauses.push("updated_at = ?"); params.push(values.updated_at); }
	if (values.hash !== undefined) { setClauses.push("hash = ?"); params.push(values.hash); }
	if (values.metadata_json !== undefined) { setClauses.push("metadata_json = ?"); params.push(values.metadata_json); }
	if (values.chunk !== undefined) { setClauses.push("chunk = ?"); params.push(values.chunk); }
	if (values.superseded_by !== undefined) { setClauses.push("superseded_by = ?"); params.push(values.superseded_by); }
	if (values.type !== undefined) { setClauses.push("type = ?"); params.push(values.type); }

	if (setClauses.length === 0) return;

	params.push(where.id);
	db.prepare(`UPDATE memories SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);
}

/** Delete a record by id. No-op if id not found. */
export function deleteById(id: string): void {
	getDb().prepare("DELETE FROM memories WHERE id = ?").run(id);
}

/** Get a single record by id, or undefined if not found. */
export function getById(id: string): MemoryRecord | undefined {
	const row = getDb().prepare("SELECT * FROM memories WHERE id = ?").get(id) as RawRow | null;
	return row ? rowToRecord(row) : undefined;
}

/** Total number of records (including superseded). */
export function countRows(): number {
	const row = getDb().prepare("SELECT COUNT(*) as cnt FROM memories").get() as { cnt: number };
	return row.cnt;
}

/**
 * Pure filter scan — no vector, no similarity ranking.
 * Returns records matching the filter, up to limit.
 */
export function scan(
	filter: FilterOptions,
	options: { limit?: number } = {},
): MemoryRecord[] {
	const limit = options.limit ?? 10_000;
	const whereClauses: string[] = [];
	const params: SQLQueryBindings[] = [];

	if (filter.user_id !== undefined) {
		whereClauses.push("user_id = ?");
		params.push(filter.user_id);
	}
	if (filter.superseded_by !== undefined) {
		whereClauses.push("superseded_by = ?");
		params.push(filter.superseded_by ?? "");
	}
	if (filter.excludeId !== undefined) {
		whereClauses.push("id != ?");
		params.push(filter.excludeId);
	}

	const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
	const sql = `SELECT * FROM memories ${where} LIMIT ?`;
	params.push(limit);

	const rows = getDb().prepare(sql).all(...params) as RawRow[];
	return rows.map(rowToRecord);
}

/**
 * Load all records (optionally filtered) for vector search.
 * Returns records with their vectors for cosine scoring in JS.
 */
export function loadForSearch(
	filter?: FilterOptions,
	limit?: number,
): MemoryRecord[] {
	return scan(filter ?? {}, { limit: limit ?? 100_000 });
}
