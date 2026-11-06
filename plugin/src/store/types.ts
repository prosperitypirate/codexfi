/**
 * store/types.ts — Shared type definitions for the SQLite vector store.
 */

/** A memory record as it lives in RAM after loading from SQLite. */
export interface MemoryRecord {
	id: string;
	memory: string;
	user_id: string;
	/** Embedding — Float32Array in RAM, BLOB in SQLite. Dimension depends on embed_model. */
	vector: Float32Array;
	metadata_json: string;
	created_at: string;
	updated_at: string;
	hash: string;
	chunk: string;
	superseded_by: string;
	type: string;
	/** Id of the embedding model that produced `vector` (e.g. "local:jina-v2-base-code"; pre-1.0 rows carry LEGACY_EMBED_MODEL until re-embedded). */
	embed_model?: string;
}

/** Input type for add() / bulkAdd() — vector can be number[] or Float32Array. */
export interface AddRecord extends Omit<MemoryRecord, "vector"> {
	vector: number[] | Float32Array;
}

/** Fields that update() can modify on an existing record. */
export interface UpdateValues {
	memory?: string;
	updated_at?: string;
	hash?: string;
	metadata_json?: string;
	chunk?: string;
	superseded_by?: string;
	type?: string;
	/** Replace the embedding (e.g. after the memory text changed, or a re-embed). */
	vector?: number[] | Float32Array;
	embed_model?: string;
}

/** A search result — the record without the vector, plus a distance score. */
export interface SearchResult extends Omit<MemoryRecord, "vector"> {
	_distance: number;
}

/** Filter criteria for search() and scan(). */
export interface FilterOptions {
	user_id?: string;
	superseded_by?: "" | null;
	excludeId?: string;
	/** Only rows embedded with this model (vector search must never mix models). */
	embed_model?: string;
}
