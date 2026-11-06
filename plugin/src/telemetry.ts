/**
 * Usage telemetry — two complementary classes:
 *
 *   CostLedger   — persistent cumulative usage per backend (costs.json)
 *   ActivityLog  — ring buffer of recent calls for the dashboard feed (activity.json)
 *
 * Backends are keyed by name ("claude-cli", "anthropic-api", "local").
 * claude-cli costs are the notional figure Claude Code reports — subscription
 * users are not billed per call; it is shown so usage stays visible.
 */

import { ACTIVITY_MAX, DATA_DIR } from "./config.js";
import { readJsonFile, writeTextFile } from "./fsx.js";

// ── CostLedger ──────────────────────────────────────────────────────────────────

export interface UsageBucket {
	calls: number;
	prompt_tokens: number;
	completion_tokens: number;
	/** Embedding-only backends record total tokens here. */
	tokens: number;
	cost_usd: number;
	model?: string;
}

export interface LedgerData {
	backends: Record<string, UsageBucket>;
	total_cost_usd: number;
	last_updated: string;
}

function freshLedger(): LedgerData {
	return { backends: {}, total_cost_usd: 0, last_updated: "" };
}

function emptyBucket(): UsageBucket {
	return { calls: 0, prompt_tokens: 0, completion_tokens: 0, tokens: 0, cost_usd: 0 };
}

/**
 * The only backends codexfi has. Anything else in an old costs.json /
 * activity.json (buckets from removed pre-1.0 remote providers) is dropped on
 * load so it is never displayed.
 */
const KNOWN_BACKENDS = new Set(["claude-cli", "anthropic-api", "local"]);

function sumCost(backends: Record<string, UsageBucket>): number {
	return +Object.values(backends).reduce((sum, b) => sum + (b.cost_usd ?? 0), 0).toFixed(8);
}

/**
 * Accept older ledgers without crashing: the pre-1.0 flat shape (one top-level
 * bucket per provider; only `anthropic` is kept) and `backends` maps. Unknown
 * backend buckets are dropped and the total is recomputed from what remains.
 */
function normalizeLedger(raw: unknown): LedgerData {
	if (!raw || typeof raw !== "object") return freshLedger();
	const r = raw as Record<string, unknown>;

	const out = freshLedger();
	out.last_updated = String(r.last_updated ?? "");
	if (r.backends && typeof r.backends === "object") {
		for (const [key, b] of Object.entries(r.backends as Record<string, UsageBucket>)) {
			if (KNOWN_BACKENDS.has(key)) out.backends[key] = b;
		}
		out.total_cost_usd = sumCost(out.backends);
		return out;
	}

	const b = r.anthropic as Partial<UsageBucket> | undefined;
	if (b && b.calls) {
		out.backends["anthropic-api"] = { ...emptyBucket(), ...b, tokens: b.tokens ?? 0 };
	}
	out.total_cost_usd = sumCost(out.backends);
	return out;
}

class CostLedger {
	private data: LedgerData = freshLedger();
	private path = "";

	async init(dataDir: string = DATA_DIR): Promise<void> {
		this.path = `${dataDir}/costs.json`;
		try {
			this.data = normalizeLedger(await readJsonFile<unknown>(this.path));
		} catch {
			this.data = freshLedger();
		}
	}

	private async save(): Promise<void> {
		if (!this.path) return;
		try {
			await writeTextFile(this.path, JSON.stringify(this.data, null, 2));
		} catch (e) {
			console.warn("Cost ledger save error:", e);
		}
	}

	private bucket(name: string): UsageBucket {
		return (this.data.backends[name] ??= emptyBucket());
	}

	private touch(): void {
		this.data.total_cost_usd = sumCost(this.data.backends);
		this.data.last_updated = new Date().toISOString();
	}

	/** Record one LLM completion (claude-cli or anthropic-api). */
	async recordLlm(backend: string, model: string, promptTokens: number, completionTokens: number, costUsd: number): Promise<void> {
		await this.load(); // other processes write costs.json too — merge, don't clobber
		const b = this.bucket(backend);
		b.calls++;
		b.prompt_tokens += promptTokens;
		b.completion_tokens += completionTokens;
		b.cost_usd = +(b.cost_usd + costUsd).toFixed(8);
		b.model = model;
		this.touch();
		await this.save();
	}

	/** Record one embedding call (embedding-only backends count total tokens). */
	async recordEmbedding(backend: string, model: string, tokens: number, costUsd: number): Promise<void> {
		await this.load();
		const b = this.bucket(backend);
		b.calls++;
		b.tokens += tokens;
		b.cost_usd = +(b.cost_usd + costUsd).toFixed(8);
		b.model = model;
		this.touch();
		await this.save();
	}

	snapshot(): LedgerData {
		return JSON.parse(JSON.stringify(this.data));
	}

	/** Re-read costs.json — used by the dashboard to see writes from hook processes. */
	async load(): Promise<void> {
		if (!this.path) return;
		try {
			const loaded = await readJsonFile<unknown>(this.path);
			if (loaded) this.data = normalizeLedger(loaded);
		} catch {
			// keep existing data
		}
	}

	async reset(): Promise<void> {
		this.data = freshLedger();
		this.data.last_updated = new Date().toISOString();
		await this.save();
	}
}

// ── ActivityLog ─────────────────────────────────────────────────────────────────

export interface ActivityEntry {
	ts: string;
	api: string;
	model: string;
	operation: string;
	prompt_tokens: number | null;
	completion_tokens: number | null;
	tokens: number | null;
	cost_usd: number;
}

/** Drop entries from unknown (removed pre-1.0) backends so they are never displayed. */
function dropLegacy(entries: ActivityEntry[]): ActivityEntry[] {
	return entries.filter((e) => KNOWN_BACKENDS.has(e.api));
}

class ActivityLog {
	private entries: ActivityEntry[] = [];
	private path = "";

	async init(dataDir: string = DATA_DIR): Promise<void> {
		this.path = `${dataDir}/activity.json`;
		try {
			this.entries = dropLegacy((await readJsonFile<ActivityEntry[]>(this.path)) ?? []);
		} catch {
			this.entries = [];
		}
	}

	private async save(): Promise<void> {
		if (!this.path) return;
		try {
			await writeTextFile(this.path, JSON.stringify(this.entries));
		} catch {
			// activity log is ephemeral
		}
	}

	async load(): Promise<void> {
		if (!this.path) return;
		try {
			const loaded = await readJsonFile<ActivityEntry[]>(this.path);
			if (loaded) this.entries = dropLegacy(loaded);
		} catch {
			// keep existing entries
		}
	}

	private append(entry: ActivityEntry): void {
		this.entries.push(entry);
		if (this.entries.length > ACTIVITY_MAX) this.entries = this.entries.slice(-ACTIVITY_MAX);
		void this.save();
	}

	recordLlm(backend: string, model: string, operation: string, promptTokens: number, completionTokens: number, costUsd: number): void {
		this.append({
			ts: new Date().toISOString(),
			api: backend,
			model,
			operation,
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			tokens: null,
			cost_usd: +costUsd.toFixed(8),
		});
	}

	recordEmbedding(backend: string, model: string, tokens: number, costUsd: number, operation = "embed"): void {
		this.append({
			ts: new Date().toISOString(),
			api: backend,
			model,
			operation,
			prompt_tokens: null,
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
