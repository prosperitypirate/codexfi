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
    type          TEXT NOT NULL DEFAULT ''
);
`;

export const CREATE_INDEXES = [
	"CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);",
	"CREATE INDEX IF NOT EXISTS idx_memories_user_superseded ON memories(user_id, superseded_by);",
	"CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);",
];
