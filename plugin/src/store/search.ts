/**
 * store/search.ts — Vector search with cosine scoring and filters.
 *
 * Strategy: exact nearest neighbor — load matching records from SQLite,
 * compute cosine similarity in JS, rank by distance ascending.
 *
 * At current scale (~3.5k records), search completes in <5ms.
 * Upgrade path: swap to sqlite-vec (ANN indexing) when records exceed 50k+.
 */

import { cosineDistance } from "./cosine.js";
import { loadForSearch } from "./crud.js";
import type { FilterOptions, SearchResult } from "./types.js";

/**
 * Search for the closest records to queryVector, filtered and ranked by
 * cosine distance (ascending — 0 = identical, 2 = opposite).
 */
export function search(
	queryVector: number[] | Float32Array,
	options: {
		filter?: FilterOptions;
		limit?: number;
	} = {},
): SearchResult[] {
	const qv = queryVector instanceof Float32Array
		? queryVector
		: new Float32Array(queryVector);
	const limit = options.limit ?? 20;

	// Load candidates from SQLite — filtered at the SQL level
	const candidates = loadForSearch(options.filter);

	// Score each candidate with cosine distance
	const scored: Array<{ rec: typeof candidates[0]; dist: number }> = [];
	for (const rec of candidates) {
		const dist = cosineDistance(qv, rec.vector);
		scored.push({ rec, dist });
	}

	// Sort by distance ascending (closest first)
	scored.sort((a, b) => a.dist - b.dist);

	// Return top N without the vector field
	return scored.slice(0, limit).map(({ rec, dist }) => ({
		id: rec.id,
		memory: rec.memory,
		user_id: rec.user_id,
		metadata_json: rec.metadata_json,
		created_at: rec.created_at,
		updated_at: rec.updated_at,
		hash: rec.hash,
		chunk: rec.chunk,
		superseded_by: rec.superseded_by,
		type: rec.type,
		_distance: dist,
	}));
}
