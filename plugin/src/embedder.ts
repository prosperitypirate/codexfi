/**
 * Embeddings — local and on-device only.
 *
 * An ONNX model runs in-process via @huggingface/transformers. No key, and no
 * network after the one-time model download (cached in ~/.codexfi/models).
 * Memory text is never sent to a third-party embedding API.
 *
 * Every stored vector is tagged with `currentEmbedModelId()` so vectors from
 * different models are never compared; rows from an older model are migrated
 * by the worker's re-embed pass.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { DATA_DIR } from "./config.js";
import { PLUGIN_CONFIG } from "./plugin-config.js";

export type InputType = "document" | "query";

// ── Model registry ──────────────────────────────────────────────────────────────

/**
 * Similarity cut-offs are model-specific (each model has its own cosine scale).
 * Values were calibrated on the benchmark memory corpus against the 0.7.x
 * baseline's decisions (recall-matched for retrieval, F1-matched for
 * memory↔memory dedup / contradiction pairs). See .github/designs/012.
 */
export interface Thresholds {
	/** Cosine distance below which two memories are duplicates. */
	dedupDistance: number;
	/** Wider dedup distance for structural types (evolving understanding). */
	structuralDedupDistance: number;
	/** Max distance for contradiction candidates. */
	contradictionDistance: number;
	structuralContradictionDistance: number;
	/** Retrieval depth: minimum similarity kept by per-turn search. */
	similarity: number;
	/** Minimum similarity shown under "Relevant to Current Task". */
	display: number;
	/** Minimum similarity at which a memory's source snippet is shown. */
	snippet: number;
	/** Permissive floor for explicit search (MCP tool, CLI, benchmark). */
	floor: number;
	/** Score given to memories pulled in by type for "list all / every X" queries. */
	enumBase: number;
}

export interface LocalModelSpec {
	/** Hugging Face repo id (ONNX weights). */
	repo: string;
	dims: number;
	dtype: "q8" | "fp32" | "fp16" | "q4";
	pooling: "mean" | "cls";
	/** Prefix prepended to queries / documents (model-specific instruction format). */
	queryPrefix?: string;
	documentPrefix?: string;
	maxTokens: number;
	thresholds: Thresholds;
}

export const LOCAL_MODELS: Record<string, LocalModelSpec> = {
	// Default: best local model for code-assistant memories at an acceptable
	// footprint (~160 MB q8, ~240 ms process-start→first-vector, Hit@20 = the 0.7.x baseline's).
	"jina-v2-base-code": {
		repo: "jinaai/jina-embeddings-v2-base-code",
		dims: 768,
		dtype: "q8",
		pooling: "mean",
		maxTokens: 1024,
		thresholds: {
			dedupDistance: 0.16,
			structuralDedupDistance: 0.34,
			contradictionDistance: 0.83,
			structuralContradictionDistance: 1.18,
			similarity: 0.38,
			// The 0.7.x baseline showed ≥0.60; jina's scale is compressed — 0.50 keeps ~97% precision
			// on the benchmark corpus while not hiding clear hits (0.53–0.69 observed).
			display: 0.5,
			snippet: 0.54,
			floor: 0.0,
			enumBase: 0.07,
		},
	},
	// Lightweight option (~23 MB, ~110 ms cold start) for slow machines.
	"all-MiniLM-L6-v2": {
		repo: "Xenova/all-MiniLM-L6-v2",
		dims: 384,
		dtype: "q8",
		pooling: "mean",
		maxTokens: 256,
		thresholds: {
			dedupDistance: 0.21,
			structuralDedupDistance: 0.38,
			contradictionDistance: 0.89,
			structuralContradictionDistance: 1.21,
			similarity: 0.28,
			display: 0.45,
			snippet: 0.45,
			floor: -0.04,
			enumBase: 0.01,
		},
	},
};

export const DEFAULT_LOCAL_MODEL = "jina-v2-base-code";

function localModelName(): string {
	const configured = process.env.CODEXFI_LOCAL_MODEL ?? PLUGIN_CONFIG.localModel;
	return configured && LOCAL_MODELS[configured] ? configured : DEFAULT_LOCAL_MODEL;
}

/**
 * Thresholds for the active embedder; user overrides from codexfi.jsonc
 * (similarityThreshold / displaySimilarityThreshold) win.
 */
export function activeThresholds(): Thresholds {
	const base = LOCAL_MODELS[localModelName()]!.thresholds;
	return {
		...base,
		...(PLUGIN_CONFIG.similarityThreshold !== undefined ? { similarity: PLUGIN_CONFIG.similarityThreshold } : {}),
		...(PLUGIN_CONFIG.displaySimilarityThreshold !== undefined ? { display: PLUGIN_CONFIG.displaySimilarityThreshold } : {}),
	};
}

// ── Info ────────────────────────────────────────────────────────────────────────

export interface EmbedderInfo {
	provider: "local";
	model: string;
	/** Value stored in memories.embed_model. */
	id: string;
	dims: number;
	/** Directory holding downloaded model weights. */
	cacheDir: string;
}

export function embedderInfo(): EmbedderInfo {
	const name = localModelName();
	return { provider: "local", model: name, id: `local:${name}`, dims: LOCAL_MODELS[name]!.dims, cacheDir: modelCacheDir() };
}

/** The embed_model tag for vectors produced right now. */
export function currentEmbedModelId(): string {
	return embedderInfo().id;
}

/**
 * True when the active local model's weights are already on disk. Hooks use this to avoid downloading ~160 MB
 * inside a latency-sensitive UserPromptSubmit — the worker prefetches instead.
 */
export function isEmbedderReady(): boolean {
	const spec = LOCAL_MODELS[localModelName()]!;
	const file = spec.dtype === "q8" ? "model_quantized.onnx" : spec.dtype === "fp32" ? "model.onnx" : `model_${spec.dtype}.onnx`;
	return existsSync(join(modelCacheDir(), spec.repo, "onnx", file));
}

export function modelCacheDir(): string {
	return process.env.CODEXFI_MODEL_DIR ?? join(DATA_DIR, "models");
}

// ── Local backend ───────────────────────────────────────────────────────────────

type Extractor = (texts: string[], opts: { pooling: "mean" | "cls"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

/** Resolve @huggingface/transformers from the plugin's node_modules, else ~/.codexfi/runtime. */
async function loadTransformers(): Promise<Record<string, unknown>> {
	try {
		return (await import("@huggingface/transformers")) as Record<string, unknown>;
	} catch {
		const runtime = join(DATA_DIR, "runtime", "package.json");
		const req = createRequire(runtime);
		const resolved = req.resolve("@huggingface/transformers");
		return (await import(resolved)) as Record<string, unknown>;
	}
}

/** True when the local embedding runtime can be loaded (it may still need to download weights). */
export async function isLocalRuntimeAvailable(): Promise<boolean> {
	try {
		await loadTransformers();
		return true;
	} catch {
		return false;
	}
}

function getExtractor(): Promise<Extractor> {
	if (!extractorPromise) {
		extractorPromise = (async () => {
			const tf = await loadTransformers();
			const env = tf.env as { cacheDir: string; allowLocalModels: boolean; logLevel?: unknown };
			env.cacheDir = modelCacheDir();
			const pipeline = tf.pipeline as (task: string, model: string, opts: Record<string, unknown>) => Promise<Extractor>;
			const spec = LOCAL_MODELS[localModelName()]!;
			return pipeline("feature-extraction", spec.repo, { dtype: spec.dtype });
		})();
		extractorPromise.catch(() => {
			extractorPromise = null; // allow a retry on the next call
		});
	}
	return extractorPromise;
}

async function embedLocal(texts: string[], inputType: InputType): Promise<number[][]> {
	const spec = LOCAL_MODELS[localModelName()]!;
	const prefix = inputType === "query" ? spec.queryPrefix ?? "" : spec.documentPrefix ?? "";
	const extractor = await getExtractor();
	// Rough char cap (~4 chars/token) so very long inputs don't blow the context.
	const cap = spec.maxTokens * 4;
	const inputs = texts.map((t) => prefix + (t.length > cap ? t.slice(0, cap) : t));
	const out = await extractor(inputs, { pooling: spec.pooling, normalize: true });
	return out.tolist();
}

// ── Public API ──────────────────────────────────────────────────────────────────

/** Embed a batch of texts with the active local model. */
export async function embedBatch(texts: string[], inputType: InputType = "document"): Promise<number[][]> {
	if (texts.length === 0) return [];
	return embedLocal(texts, inputType);
}

/**
 * Embed one text. Query embeddings are memoised per process — the same prompt is
 * searched in both project and user scope on every turn.
 */
const queryCache = new Map<string, number[]>();

export async function embed(text: string, inputType: InputType = "document"): Promise<number[]> {
	if (inputType === "query") {
		const hit = queryCache.get(text);
		if (hit) return hit;
	}
	const [vector] = await embedBatch([text], inputType);
	if (!vector) throw new Error("embedding failed: empty result");
	if (inputType === "query") {
		if (queryCache.size > 64) queryCache.clear();
		queryCache.set(text, vector);
	}
	return vector;
}

/** Test hook — drop the loaded local model and query cache. */
export function _resetEmbedderForTests(): void {
	extractorPromise = null;
	queryCache.clear();
}
