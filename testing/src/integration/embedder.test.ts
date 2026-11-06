/**
 * Integration tests for embedder.ts — the local on-device embedding path.
 *
 * @huggingface/transformers is mocked process-wide by preload.ts (no model
 * download, no ONNX runtime): the fake pipeline records what embedder.ts sends
 * it and returns deterministic bag-of-words vectors. This verifies the real
 * embedder logic around the model — model selection, prefixes, input caps,
 * query memoisation, cache dir, readiness and thresholds.
 *
 * The Voyage provider is chosen at import time (EMBEDDING_PROVIDER), so it is
 * not exercised in this process; its request shape is unchanged from 0.7.x.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";

import {
	activeThresholds,
	currentEmbedModelId,
	DEFAULT_LOCAL_MODEL,
	embed,
	embedBatch,
	embedderInfo,
	isEmbedderReady,
	isLocalRuntimeAvailable,
	LOCAL_MODELS,
	modelCacheDir,
	_resetEmbedderForTests,
} from "../../../plugin/src/embedder.js";
import { PLUGIN_CONFIG } from "../../../plugin/src/plugin-config.js";
import { bowVector, resetTransformersState, transformersState } from "../helpers/mock-embedder.js";
import { markEmbedderMissing, markEmbedderReady, TEST_DATA_DIR } from "../helpers/test-env.js";

const savedLocalModel = process.env.CODEXFI_LOCAL_MODEL;

beforeEach(() => {
	_resetEmbedderForTests();
	resetTransformersState();
});

afterEach(() => {
	if (savedLocalModel === undefined) delete process.env.CODEXFI_LOCAL_MODEL;
	else process.env.CODEXFI_LOCAL_MODEL = savedLocalModel;
	PLUGIN_CONFIG.similarityThreshold = undefined;
	PLUGIN_CONFIG.displaySimilarityThreshold = undefined;
	_resetEmbedderForTests();
});

describe("embedderInfo", () => {
	test("defaults to the local default model, tagged local:<name>", () => {
		const info = embedderInfo();
		expect(info.provider).toBe("local");
		expect(info.model).toBe(DEFAULT_LOCAL_MODEL);
		expect(info.id).toBe(`local:${DEFAULT_LOCAL_MODEL}`);
		expect(info.dims).toBe(LOCAL_MODELS[DEFAULT_LOCAL_MODEL]!.dims);
		expect(currentEmbedModelId()).toBe(info.id);
	});

	test("CODEXFI_LOCAL_MODEL selects another registered model; unknown names fall back", () => {
		process.env.CODEXFI_LOCAL_MODEL = "all-MiniLM-L6-v2";
		expect(embedderInfo().id).toBe("local:all-MiniLM-L6-v2");
		expect(embedderInfo().dims).toBe(384);
		process.env.CODEXFI_LOCAL_MODEL = "no-such-model";
		expect(embedderInfo().model).toBe(DEFAULT_LOCAL_MODEL);
	});

	test("model weights are cached under DATA_DIR/models", () => {
		expect(modelCacheDir()).toBe(join(TEST_DATA_DIR, "models"));
		expect(embedderInfo().cacheDir).toBe(modelCacheDir());
	});
});

describe("local embedding", () => {
	test("loads the model's ONNX repo once with its dtype", async () => {
		await embed("first");
		await embed("second");
		expect(transformersState.pipelineCalls).toHaveLength(1);
		const spec = LOCAL_MODELS[DEFAULT_LOCAL_MODEL]!;
		expect(transformersState.pipelineCalls[0]).toEqual({ task: "feature-extraction", repo: spec.repo, opts: { dtype: spec.dtype } });
	});

	test("returns the model's vector for a document", async () => {
		expect(await embed("SQLite runs in WAL mode")).toEqual(bowVector("SQLite runs in WAL mode"));
	});

	test("query vs document prefixes follow the model spec", async () => {
		process.env.CODEXFI_LOCAL_MODEL = "all-MiniLM-L6-v2";
		const spec = LOCAL_MODELS["all-MiniLM-L6-v2"]!;
		await embed("find the auth code", "query");
		await embed("auth lives in src/auth", "document");
		expect(transformersState.inputs[0]).toEqual([`${spec.queryPrefix ?? ""}find the auth code`]);
		expect(transformersState.inputs[1]).toEqual([`${spec.documentPrefix ?? ""}auth lives in src/auth`]);
	});

	test("long inputs are capped at ~4 chars per model token", async () => {
		const spec = LOCAL_MODELS[DEFAULT_LOCAL_MODEL]!;
		await embed("w".repeat(spec.maxTokens * 4 + 1000));
		expect(transformersState.inputs[0]![0]!.length).toBe((spec.documentPrefix ?? "").length + spec.maxTokens * 4);
	});

	test("query embeddings are memoised; documents are not", async () => {
		await embed("same query", "query");
		await embed("same query", "query");
		expect(transformersState.inputs).toHaveLength(1);
		await embed("same doc", "document");
		await embed("same doc", "document");
		expect(transformersState.inputs).toHaveLength(3);
	});

	test("embedBatch sends one batch and preserves order; empty input short-circuits", async () => {
		const texts = ["one fish", "two fish", "red fish"];
		expect(await embedBatch(texts)).toEqual(texts.map((t) => bowVector(t)));
		expect(transformersState.inputs).toEqual([texts]);
		expect(await embedBatch([])).toEqual([]);
		expect(transformersState.inputs).toHaveLength(1);
	});

	test("the local runtime is reported available", async () => {
		expect(await isLocalRuntimeAvailable()).toBe(true);
	});
});

describe("isEmbedderReady", () => {
	test("false until the model weights exist on disk, true after", async () => {
		await markEmbedderMissing();
		expect(isEmbedderReady()).toBe(false);
		await markEmbedderReady();
		expect(isEmbedderReady()).toBe(true);
		await markEmbedderMissing();
	});
});

describe("activeThresholds", () => {
	test("model-specific defaults, with codexfi.jsonc overrides winning", () => {
		const base = LOCAL_MODELS[DEFAULT_LOCAL_MODEL]!.thresholds;
		expect(activeThresholds()).toEqual(base);
		PLUGIN_CONFIG.similarityThreshold = 0.9;
		PLUGIN_CONFIG.displaySimilarityThreshold = 0.95;
		expect(activeThresholds()).toEqual({ ...base, similarity: 0.9, display: 0.95 });
	});

	test("every registered model defines sane thresholds", () => {
		for (const [name, spec] of Object.entries(LOCAL_MODELS)) {
			const t = spec.thresholds;
			expect(t.dedupDistance, name).toBeGreaterThan(0);
			expect(t.structuralDedupDistance, name).toBeGreaterThanOrEqual(t.dedupDistance);
			expect(t.contradictionDistance, name).toBeGreaterThan(t.dedupDistance);
			expect(t.display, name).toBeGreaterThanOrEqual(t.similarity);
		}
	});
});
