/**
 * Unit tests for telemetry.ts — CostLedger (generic per-backend buckets,
 * legacy costs.json normalisation, persistence) and the ActivityLog ring buffer.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ACTIVITY_MAX } from "../../../plugin/src/config.js";
import { ledger, activityLog } from "../../../plugin/src/telemetry.js";
import { makeTempDir } from "../helpers/test-env.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = makeTempDir("telemetry");
	await ledger.init(tempDir);
	await ledger.reset();
	await activityLog.init(tempDir);
});

// ── CostLedger ──────────────────────────────────────────────────────────────────

describe("CostLedger", () => {
	test("starts empty", () => {
		const snap = ledger.snapshot();
		expect(snap.total_cost_usd).toBe(0);
		expect(snap.backends).toEqual({});
	});

	test("recordLlm creates a bucket per backend and accumulates", async () => {
		await ledger.recordLlm("claude-cli", "claude-haiku-4-5", 600, 120, 0.002);
		await ledger.recordLlm("claude-cli", "claude-haiku-4-5", 400, 80, 0.001);
		const b = ledger.snapshot().backends["claude-cli"]!;
		expect(b.calls).toBe(2);
		expect(b.prompt_tokens).toBe(1000);
		expect(b.completion_tokens).toBe(200);
		expect(b.cost_usd).toBeCloseTo(0.003, 8);
		expect(b.model).toBe("claude-haiku-4-5");
	});

	test("recordEmbedding counts tokens, not prompt/completion", async () => {
		await ledger.recordEmbedding("local", "local:jina-v2-base-code", 1_000_000, 0);
		const b = ledger.snapshot().backends.local!;
		expect(b.calls).toBe(1);
		expect(b.tokens).toBe(1_000_000);
		expect(b.prompt_tokens).toBe(0);
		expect(b.cost_usd).toBe(0);
	});

	test("total_cost_usd is the sum across backends", async () => {
		await ledger.recordLlm("anthropic-api", "claude-haiku-4-5", 100_000, 10_000, 0.15);
		await ledger.recordLlm("claude-cli", "haiku", 1, 1, 0.05);
		await ledger.recordEmbedding("local", "local:jina-v2-base-code", 10, 0);
		const snap = ledger.snapshot();
		expect(snap.total_cost_usd).toBeCloseTo(0.2, 8);
		expect(Object.keys(snap.backends).sort()).toEqual(["anthropic-api", "claude-cli", "local"]);
		expect(snap.last_updated).not.toBe("");
	});

	test("persists to costs.json and survives re-init", async () => {
		await ledger.recordEmbedding("local", "local:jina-v2-base-code", 5000, 0);
		const onDisk = JSON.parse(readFileSync(join(tempDir, "costs.json"), "utf8"));
		expect(onDisk.backends.local.tokens).toBe(5000);

		await ledger.init(tempDir);
		expect(ledger.snapshot().backends.local!.tokens).toBe(5000);
	});

	test("reset zeroes everything", async () => {
		await ledger.recordLlm("claude-cli", "haiku", 1, 1, 0.5);
		await ledger.reset();
		const snap = ledger.snapshot();
		expect(snap.total_cost_usd).toBe(0);
		expect(snap.backends).toEqual({});
		expect(snap.last_updated).not.toBe("");
	});

	test("snapshot returns a deep copy", async () => {
		await ledger.recordLlm("claude-cli", "haiku", 1, 1, 0);
		const snap1 = ledger.snapshot();
		snap1.backends["claude-cli"]!.calls = 999;
		expect(ledger.snapshot().backends["claude-cli"]!.calls).toBe(1);
	});
});

describe("CostLedger legacy costs.json (pre-1.0 shape)", () => {
	const LEGACY = {
		anthropic: { calls: 3, prompt_tokens: 3000, completion_tokens: 300, cost_usd: 0.0045, model: "claude-haiku-4-5" },
		voyage: { calls: 7, tokens: 7000, cost_usd: 0.00126, model: "voyage-code-3" },
		xai: { calls: 2, prompt_tokens: 200, completion_tokens: 20, cost_usd: 0.001 },
		google: { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 },
		total_cost_usd: 0.00576,
		last_updated: "2026-03-01T00:00:00.000Z",
	};

	test("is normalised into the backends map on load", async () => {
		writeFileSync(join(tempDir, "costs.json"), JSON.stringify(LEGACY));
		await ledger.init(tempDir);
		const snap = ledger.snapshot();

		// anthropic → anthropic-api; removed remote providers are dropped, total recomputed
		expect(Object.keys(snap.backends)).toEqual(["anthropic-api"]);
		expect(snap.backends["anthropic-api"]).toMatchObject({ calls: 3, prompt_tokens: 3000, completion_tokens: 300, tokens: 0 });
		expect(snap.total_cost_usd).toBeCloseTo(0.0045, 8);
		expect(snap.last_updated).toBe(LEGACY.last_updated);
	});

	test("new calls accumulate on top of normalised legacy data and re-save in the new shape", async () => {
		writeFileSync(join(tempDir, "costs.json"), JSON.stringify(LEGACY));
		await ledger.init(tempDir);
		await ledger.recordLlm("anthropic-api", "claude-haiku-4-5", 1000, 100, 0.0015);

		const snap = ledger.snapshot();
		expect(snap.backends["anthropic-api"]!.calls).toBe(4);
		expect(snap.total_cost_usd).toBeCloseTo(0.0045 + 0.0015, 8);

		const onDisk = JSON.parse(readFileSync(join(tempDir, "costs.json"), "utf8"));
		expect(onDisk.backends["anthropic-api"].calls).toBe(4);
		expect(onDisk.anthropic).toBeUndefined();
		expect(Object.keys(onDisk.backends)).toEqual(["anthropic-api"]);
	});

	test("legacy remote-provider buckets in a backends-map ledger are dropped on load", async () => {
		const bucket = { calls: 1, prompt_tokens: 0, completion_tokens: 0, tokens: 10, cost_usd: 0.5 };
		writeFileSync(join(tempDir, "costs.json"), JSON.stringify({
			backends: { "claude-cli": { ...bucket, cost_usd: 0.25 }, voyage: bucket, xai: bucket, google: bucket },
			total_cost_usd: 1.75,
			last_updated: "2026-10-01T00:00:00.000Z",
		}));
		await ledger.init(tempDir);
		const snap = ledger.snapshot();
		expect(Object.keys(snap.backends)).toEqual(["claude-cli"]);
		expect(snap.total_cost_usd).toBeCloseTo(0.25, 8);
	});

	test("garbage costs.json falls back to an empty ledger", async () => {
		writeFileSync(join(tempDir, "costs.json"), "{ not json");
		await ledger.init(tempDir);
		expect(ledger.snapshot().backends).toEqual({});
	});

	test("load() re-reads (and normalises) the file written by another process", async () => {
		writeFileSync(join(tempDir, "costs.json"), JSON.stringify(LEGACY));
		await ledger.load();
		expect(ledger.snapshot().backends["anthropic-api"]!.calls).toBe(3);
	});
});

// ── ActivityLog ─────────────────────────────────────────────────────────────────

describe("ActivityLog", () => {
	test("recordLlm stores backend, model, operation and token counts", () => {
		activityLog.recordLlm("claude-cli", "claude-haiku-4-5", "extraction", 500, 100, 0.01);
		const [e] = activityLog.recent(1);
		expect(e).toMatchObject({
			api: "claude-cli", model: "claude-haiku-4-5", operation: "extraction",
			prompt_tokens: 500, completion_tokens: 100, tokens: null,
		});
	});

	test("recordEmbedding defaults the operation to embed", () => {
		activityLog.recordEmbedding("local", "local:jina-v2-base-code", 100, 0);
		const [e] = activityLog.recent(1);
		expect(e).toMatchObject({ api: "local", operation: "embed", tokens: 100, prompt_tokens: null });
	});

	test("entries from removed remote providers in an old activity.json are dropped on load", async () => {
		const entry = (api: string) => ({ ts: "2026-10-01T00:00:00.000Z", api, model: "m", operation: "embed", prompt_tokens: null, completion_tokens: null, tokens: 1, cost_usd: 0 });
		writeFileSync(join(tempDir, "activity.json"), JSON.stringify([entry("voyage"), entry("local"), entry("xai"), entry("claude-cli")]));
		await activityLog.init(tempDir);
		expect(activityLog.recent(10).map((e) => e.api)).toEqual(["claude-cli", "local"]);
	});

	test("recent() is newest-first and respects the limit", () => {
		for (let i = 1; i <= 5; i++) activityLog.recordEmbedding("local", "m", i, 0);
		const recent = activityLog.recent(3);
		expect(recent.map((e) => e.tokens)).toEqual([5, 4, 3]);
	});

	test(`ring buffer keeps at most ACTIVITY_MAX (${ACTIVITY_MAX}) entries`, () => {
		for (let i = 0; i < ACTIVITY_MAX + 25; i++) activityLog.recordEmbedding("local", "m", i, 0);
		const all = activityLog.recent(ACTIVITY_MAX * 2);
		expect(all.length).toBe(ACTIVITY_MAX);
		expect(all[0]!.tokens).toBe(ACTIVITY_MAX + 24);
	});
});
