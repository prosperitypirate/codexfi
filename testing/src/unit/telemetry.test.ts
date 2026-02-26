/**
 * Unit tests for telemetry.ts — CostLedger persistence and ActivityLog ring buffer.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We can't directly instantiate CostLedger/ActivityLog since they're exported
// as singletons. But we CAN test the singletons with fresh temp dirs.
import { ledger, activityLog } from "../../../plugin/src/telemetry.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-test-telemetry-"));
	// Reset ledger state, then init from fresh temp dir
	await ledger.reset();
	await ledger.init(tempDir);
});

afterEach(() => {
	try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ── CostLedger ──────────────────────────────────────────────────────────────────

describe("CostLedger", () => {
	test("starts with zero costs", () => {
		const snap = ledger.snapshot();
		expect(snap.total_cost_usd).toBe(0);
		expect(snap.voyage.calls).toBe(0);
		expect(snap.anthropic.calls).toBe(0);
	});

	test("records Voyage costs correctly", async () => {
		await ledger.recordVoyage(1_000_000); // 1M tokens
		const snap = ledger.snapshot();
		expect(snap.voyage.calls).toBe(1);
		expect(snap.voyage.tokens).toBe(1_000_000);
		// $0.18 per M tokens
		expect(snap.voyage.cost_usd).toBeCloseTo(0.18, 4);
		expect(snap.total_cost_usd).toBeCloseTo(0.18, 4);
	});

	test("records Anthropic costs correctly", async () => {
		await ledger.recordAnthropic(100_000, 10_000); // 100k in, 10k out
		const snap = ledger.snapshot();
		expect(snap.anthropic.calls).toBe(1);
		expect(snap.anthropic.prompt_tokens).toBe(100_000);
		expect(snap.anthropic.completion_tokens).toBe(10_000);
		// $1.00/M input + $5.00/M output = $0.10 + $0.05 = $0.15
		expect(snap.anthropic.cost_usd).toBeCloseTo(0.15, 4);
	});

	test("records xAI costs with cached tokens", async () => {
		// 10k prompt, 5k cached, 2k completion
		await ledger.recordXai(10_000, 5_000, 2_000);
		const snap = ledger.snapshot();
		expect(snap.xai.calls).toBe(1);
		expect(snap.xai.prompt_tokens).toBe(10_000);
		expect(snap.xai.cached_tokens).toBe(5_000);
		expect(snap.xai.completion_tokens).toBe(2_000);
		// (10k-5k)*0.20/M + 5k*0.05/M + 2k*0.50/M = 0.001 + 0.00025 + 0.001 = 0.00225
		expect(snap.xai.cost_usd).toBeCloseTo(0.00225, 6);
	});

	test("accumulates multiple calls", async () => {
		await ledger.recordVoyage(1000);
		await ledger.recordVoyage(2000);
		await ledger.recordVoyage(3000);
		const snap = ledger.snapshot();
		expect(snap.voyage.calls).toBe(3);
		expect(snap.voyage.tokens).toBe(6000);
	});

	test("persists to disk and survives re-init", async () => {
		await ledger.recordVoyage(5000);

		// Re-init from same directory — should load persisted data
		await ledger.init(tempDir);
		const snap = ledger.snapshot();
		expect(snap.voyage.calls).toBe(1);
		expect(snap.voyage.tokens).toBe(5000);
	});

	test("reset zeroes everything", async () => {
		await ledger.recordVoyage(1000);
		await ledger.recordAnthropic(1000, 500);
		await ledger.reset();

		const snap = ledger.snapshot();
		expect(snap.total_cost_usd).toBe(0);
		expect(snap.voyage.calls).toBe(0);
		expect(snap.anthropic.calls).toBe(0);
		expect(snap.last_updated).not.toBe("");
	});

	test("snapshot returns a deep copy", () => {
		const snap1 = ledger.snapshot();
		snap1.voyage.calls = 999;
		const snap2 = ledger.snapshot();
		expect(snap2.voyage.calls).not.toBe(999);
	});
});

// ── ActivityLog ─────────────────────────────────────────────────────────────────

describe("ActivityLog", () => {
	test("records and retrieves Voyage activity", () => {
		activityLog.recordVoyage(100, 0.001);
		const recent = activityLog.recent(1);
		expect(recent.length).toBeGreaterThanOrEqual(1);
		expect(recent[0]!.api).toBe("voyage");
		expect(recent[0]!.operation).toBe("embed");
		expect(recent[0]!.tokens).toBe(100);
	});

	test("records Anthropic extraction activity", () => {
		activityLog.recordAnthropic(500, 100, 0.01);
		const recent = activityLog.recent(1);
		expect(recent[0]!.api).toBe("anthropic");
		expect(recent[0]!.operation).toBe("extraction");
		expect(recent[0]!.prompt_tokens).toBe(500);
		expect(recent[0]!.completion_tokens).toBe(100);
	});

	test("recent() returns entries in reverse chronological order", () => {
		activityLog.recordVoyage(1, 0);
		activityLog.recordVoyage(2, 0);
		activityLog.recordVoyage(3, 0);
		const recent = activityLog.recent(3);
		// Most recent first
		expect(recent[0]!.tokens).toBe(3);
		expect(recent[2]!.tokens).toBe(1);
	});

	test("recent() respects limit parameter", () => {
		for (let i = 0; i < 10; i++) {
			activityLog.recordVoyage(i, 0);
		}
		const recent = activityLog.recent(3);
		expect(recent.length).toBe(3);
	});
});
