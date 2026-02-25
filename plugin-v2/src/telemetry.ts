/**
 * API usage telemetry — two complementary classes:
 *
 *   CostLedger   — persistent cumulative cost tracker (survives restarts)
 *   ActivityLog  — in-memory ring buffer for activity feed
 */

import {
	ACTIVITY_MAX,
	ANTHROPIC_EXTRACTION_MODEL,
	ANTHROPIC_PRICE_INPUT_PER_M,
	ANTHROPIC_PRICE_OUTPUT_PER_M,
	DATA_DIR,
	EMBEDDING_MODEL,
	EXTRACTION_MODEL,
	GOOGLE_EXTRACTION_MODEL,
	GOOGLE_PRICE_INPUT_PER_M,
	GOOGLE_PRICE_OUTPUT_PER_M,
	VOYAGE_PRICE_PER_M,
	XAI_PRICE_CACHED_PER_M,
	XAI_PRICE_INPUT_PER_M,
	XAI_PRICE_OUTPUT_PER_M,
} from "./config.js";

// ── CostLedger ──────────────────────────────────────────────────────────────────

interface CostBucket {
	calls: number;
	prompt_tokens: number;
	cached_tokens?: number;
	completion_tokens: number;
	cost_usd: number;
}

interface VoyageBucket {
	calls: number;
	tokens: number;
	cost_usd: number;
}

interface LedgerData {
	xai: CostBucket & { cached_tokens: number };
	google: CostBucket;
	anthropic: CostBucket;
	voyage: VoyageBucket;
	total_cost_usd: number;
	last_updated: string;
}

function freshLedger(): LedgerData {
	return {
		xai: { calls: 0, prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0, cost_usd: 0 },
		google: { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 },
		anthropic: { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 },
		voyage: { calls: 0, tokens: 0, cost_usd: 0 },
		total_cost_usd: 0,
		last_updated: "",
	};
}

class CostLedger {
	private data: LedgerData = freshLedger();
	private path = "";

	async init(dataDir: string = DATA_DIR): Promise<void> {
		this.path = `${dataDir}/costs.json`;
		try {
			const file = Bun.file(this.path);
			if (await file.exists()) {
				this.data = await file.json();
			}
		} catch {
			this.data = freshLedger();
		}
	}

	private async save(): Promise<void> {
		if (!this.path) return;
		try {
			await Bun.write(this.path, JSON.stringify(this.data, null, 2));
		} catch (e) {
			console.warn("Cost ledger save error:", e);
		}
	}

	private updateTotal(): void {
		this.data.total_cost_usd = +(
			(this.data.xai?.cost_usd ?? 0) +
			(this.data.google?.cost_usd ?? 0) +
			(this.data.anthropic?.cost_usd ?? 0) +
			(this.data.voyage?.cost_usd ?? 0)
		).toFixed(8);
		this.data.last_updated = new Date().toISOString();
	}

	async recordXai(promptTokens: number, cachedTokens: number, completionTokens: number): Promise<void> {
		const cost =
			(promptTokens - cachedTokens) * XAI_PRICE_INPUT_PER_M / 1_000_000 +
			cachedTokens * XAI_PRICE_CACHED_PER_M / 1_000_000 +
			completionTokens * XAI_PRICE_OUTPUT_PER_M / 1_000_000;
		const x = this.data.xai;
		x.calls++;
		x.prompt_tokens += promptTokens;
		x.cached_tokens += cachedTokens;
		x.completion_tokens += completionTokens;
		x.cost_usd = +(x.cost_usd + cost).toFixed(8);
		this.updateTotal();
		await this.save();
	}

	async recordGoogle(promptTokens: number, completionTokens: number): Promise<void> {
		const cost =
			promptTokens * GOOGLE_PRICE_INPUT_PER_M / 1_000_000 +
			completionTokens * GOOGLE_PRICE_OUTPUT_PER_M / 1_000_000;
		if (!this.data.google) {
			this.data.google = { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 };
		}
		const g = this.data.google;
		g.calls++;
		g.prompt_tokens += promptTokens;
		g.completion_tokens += completionTokens;
		g.cost_usd = +(g.cost_usd + cost).toFixed(8);
		this.updateTotal();
		await this.save();
	}

	async recordAnthropic(promptTokens: number, completionTokens: number): Promise<void> {
		const cost =
			promptTokens * ANTHROPIC_PRICE_INPUT_PER_M / 1_000_000 +
			completionTokens * ANTHROPIC_PRICE_OUTPUT_PER_M / 1_000_000;
		if (!this.data.anthropic) {
			this.data.anthropic = { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 };
		}
		const a = this.data.anthropic;
		a.calls++;
		a.prompt_tokens += promptTokens;
		a.completion_tokens += completionTokens;
		a.cost_usd = +(a.cost_usd + cost).toFixed(8);
		this.updateTotal();
		await this.save();
	}

	async recordVoyage(tokens: number): Promise<void> {
		const cost = tokens * VOYAGE_PRICE_PER_M / 1_000_000;
		const v = this.data.voyage;
		v.calls++;
		v.tokens += tokens;
		v.cost_usd = +(v.cost_usd + cost).toFixed(8);
		this.updateTotal();
		await this.save();
	}

	snapshot(): LedgerData {
		return JSON.parse(JSON.stringify(this.data));
	}

	async reset(): Promise<void> {
		this.data = freshLedger();
		this.data.last_updated = new Date().toISOString();
		await this.save();
	}
}

// ── ActivityLog ─────────────────────────────────────────────────────────────────

interface ActivityEntry {
	ts: string;
	api: string;
	model: string;
	operation: string;
	prompt_tokens: number | null;
	cached_tokens: number | null;
	completion_tokens: number | null;
	tokens: number | null;
	cost_usd: number;
}

class ActivityLog {
	private entries: ActivityEntry[] = [];

	private append(entry: ActivityEntry): void {
		this.entries.push(entry);
		if (this.entries.length > ACTIVITY_MAX) {
			this.entries = this.entries.slice(-ACTIVITY_MAX);
		}
	}

	recordXai(
		promptTokens: number,
		cachedTokens: number,
		completionTokens: number,
		costUsd: number,
		operation = "extraction",
	): void {
		this.append({
			ts: new Date().toISOString(),
			api: "xai",
			model: EXTRACTION_MODEL,
			operation,
			prompt_tokens: promptTokens,
			cached_tokens: cachedTokens,
			completion_tokens: completionTokens,
			tokens: null,
			cost_usd: +costUsd.toFixed(8),
		});
	}

	recordGoogle(
		promptTokens: number,
		completionTokens: number,
		costUsd: number,
		operation = "extraction",
	): void {
		this.append({
			ts: new Date().toISOString(),
			api: "google",
			model: GOOGLE_EXTRACTION_MODEL,
			operation,
			prompt_tokens: promptTokens,
			cached_tokens: null,
			completion_tokens: completionTokens,
			tokens: null,
			cost_usd: +costUsd.toFixed(8),
		});
	}

	recordAnthropic(
		promptTokens: number,
		completionTokens: number,
		costUsd: number,
		operation = "extraction",
	): void {
		this.append({
			ts: new Date().toISOString(),
			api: "anthropic",
			model: ANTHROPIC_EXTRACTION_MODEL,
			operation,
			prompt_tokens: promptTokens,
			cached_tokens: null,
			completion_tokens: completionTokens,
			tokens: null,
			cost_usd: +costUsd.toFixed(8),
		});
	}

	recordVoyage(tokens: number, costUsd: number): void {
		this.append({
			ts: new Date().toISOString(),
			api: "voyage",
			model: EMBEDDING_MODEL,
			operation: "embed",
			prompt_tokens: null,
			cached_tokens: null,
			completion_tokens: null,
			tokens,
			cost_usd: +costUsd.toFixed(8),
		});
	}

	recent(limit = 50): ActivityEntry[] {
		return [...this.entries.slice(-limit)].reverse();
	}
}

// ── Module-level singletons ─────────────────────────────────────────────────────

export const ledger = new CostLedger();
export const activityLog = new ActivityLog();
