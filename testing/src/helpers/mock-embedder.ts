/**
 * Deterministic embedding doubles — no model download, no network.
 *
 *   bowVector()          bag-of-words feature hashing: texts that share words
 *                        are similar, unrelated texts score ~0, identical texts
 *                        score exactly 1. This is what the mocked local model
 *                        (see preload.ts) returns, so `embed()` behaves like a
 *                        crude but predictable semantic embedder in tests.
 *   deterministicVector() pseudo-random unit vector per text (hash-seeded LCG):
 *                        different texts are ~orthogonal. Used by tests that
 *                        seed the store directly and only need distinct vectors.
 *
 * Both default to MOCK_DIMS. Its value is deliberately large (not the real
 * model's 768): bag-of-words feature hashing collides less in a wide space, so
 * unrelated test texts reliably score ~0. Stored rows and embed() output always
 * share this dimension, which is all the store requires.
 */

export const MOCK_DIMS = 2048;

/** Instruction prefix the local bge model prepends to queries (see embedder.ts). */
export const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

function fnv1a(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** Bag-of-words hashed vector, L2-normalised. The bge query prefix is ignored. */
export function bowVector(text: string, dims = MOCK_DIMS): number[] {
	const body = text.startsWith(BGE_QUERY_PREFIX) ? text.slice(BGE_QUERY_PREFIX.length) : text;
	const v = new Array<number>(dims).fill(0);
	for (const tok of body.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
		v[fnv1a(tok) % dims]! += 1;
	}
	const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
	return norm === 0 ? v : v.map((x) => x / norm);
}

/** Pseudo-random unit vector seeded by the text. Same input → same vector. */
export function deterministicVector(text: string, dims = MOCK_DIMS): number[] {
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
	}
	const vector = new Array<number>(dims);
	let seed = Math.abs(hash);
	for (let i = 0; i < dims; i++) {
		seed = (seed * 1664525 + 1013904223) & 0xffffffff;
		vector[i] = seed / 0x7fffffff - 1;
	}
	const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
	return vector.map((v) => v / norm);
}

/** Cosine similarity of two equal-length vectors (test assertions). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let dot = 0, na = 0, nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		na += a[i]! * a[i]!;
		nb += b[i]! * b[i]!;
	}
	return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Mocked @huggingface/transformers (installed by preload.ts) ───────────────────

export const transformersState = {
	/** Arguments of every pipeline() construction. */
	pipelineCalls: [] as Array<{ task: string; repo: string; opts: unknown }>,
	/** Raw inputs (prefix included) of every extractor call. */
	inputs: [] as string[][],
};

export function resetTransformersState(): void {
	transformersState.pipelineCalls.length = 0;
	transformersState.inputs.length = 0;
}

/** Module shape returned by the mock — `env` + `pipeline`, as embedder.ts uses them. */
export function fakeTransformersModule(): Record<string, unknown> {
	return {
		env: {},
		pipeline: async (task: string, repo: string, opts: unknown) => {
			transformersState.pipelineCalls.push({ task, repo, opts });
			return async (texts: string[]) => {
				transformersState.inputs.push([...texts]);
				return { tolist: () => texts.map((t) => bowVector(t)) };
			};
		},
	};
}
