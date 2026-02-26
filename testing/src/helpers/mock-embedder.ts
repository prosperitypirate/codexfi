/**
 * Deterministic mock embedder for tests that need embedding vectors
 * without hitting the real Voyage AI API.
 *
 * Generates a consistent 1024-dim vector from the input text using a
 * simple hash-based approach. Same input → same vector every time.
 * Different inputs → different vectors (not orthogonal, but distinct enough
 * for cosine similarity tests).
 */

import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";

/**
 * Generate a deterministic pseudo-random vector from text.
 * Uses a simple string hash seeded PRNG — not cryptographic, just consistent.
 */
export function deterministicVector(text: string): number[] {
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
	}

	const vector = new Array(EMBEDDING_DIMS);
	let seed = Math.abs(hash);
	for (let i = 0; i < EMBEDDING_DIMS; i++) {
		// Simple LCG (linear congruential generator)
		seed = (seed * 1664525 + 1013904223) & 0xffffffff;
		// Normalize to [-1, 1] range
		vector[i] = (seed / 0x7fffffff) - 1;
	}

	// Normalize to unit vector (cosine similarity needs unit vectors)
	const norm = Math.sqrt(vector.reduce((sum: number, v: number) => sum + v * v, 0));
	for (let i = 0; i < EMBEDDING_DIMS; i++) {
		vector[i] /= norm;
	}

	return vector;
}

/**
 * Mock embed function — drop-in replacement for embedder.embed().
 * Returns a deterministic vector based on input text.
 */
export async function mockEmbed(
	text: string,
	_inputType: "document" | "query" = "document",
): Promise<number[]> {
	return deterministicVector(text);
}
