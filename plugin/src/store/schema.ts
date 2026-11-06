/**
 * store/schema.ts — SQLite schema definition and migration SQL.
 *
 * Single table "memories" with indexes for common filter patterns.
 * Vector stored as BLOB (Float32Array raw bytes) for ~50% size reduction
 * vs JSON-encoded arrays.
 */

/** SQL to create the memories table and indexes. Idempotent (IF NOT EXISTS). */
export const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS memories (
    id            TEXT PRIMARY KEY,
    memory        TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    vector        BLOB NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    hash          TEXT NOT NULL,
    chunk         TEXT NOT NULL DEFAULT '',
    superseded_by TEXT NOT NULL DEFAULT '',
    type          TEXT NOT NULL DEFAULT '',
    embed_model   TEXT NOT NULL DEFAULT ''
);
`;

export const CREATE_INDEXES = [
	"CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);",
	"CREATE INDEX IF NOT EXISTS idx_memories_user_superseded ON memories(user_id, superseded_by);",
	"CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);",
	"CREATE INDEX IF NOT EXISTS idx_memories_embed_model ON memories(embed_model);",
];

/**
 * Embedding model of every row written before the embed_model column existed
 * (codexfi ≤ 0.7.x vectors). This is a DATA LABEL only — it marks pre-1.0 rows
 * as stale so the worker re-embeds them locally. It is not a provider: codexfi
 * 1.0+ has no remote embedding backend and never calls any embedding API.
 */
export const LEGACY_EMBED_MODEL = "voyage-code-3";
