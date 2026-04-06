/**
 * store/cosine.ts — Cosine distance between two Float32Array vectors.
 *
 * Pure math, zero dependencies. Extracted for testability and reuse.
 */

/**
 * Cosine distance (0 = identical, 2 = opposite) between two Float32Arrays.
 *
 * Zero-vector guard: returns 1 (max dissimilarity) instead of NaN when
 * either vector has zero magnitude.
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot   += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	if (normA === 0 || normB === 0) return 1;
	return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
