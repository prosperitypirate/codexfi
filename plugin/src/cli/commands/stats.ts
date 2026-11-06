/**
 * `codexfi stats` — display memory database statistics and API costs.
 *
 * Shows:
 *   - Total memory count and database size
 *   - Per-project memory breakdown
 *   - Memory type distribution
 *   - Cumulative LLM / embedding usage and cost per backend
 *
 * Flags:
 *   --json   Output raw JSON instead of formatted display
 */

import { statSync } from "node:fs";
import { join } from "node:path";

import type { ParsedArgs } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb } from "../shared.js";
import { store } from "../../db.js";
import { ledger } from "../../telemetry.js";
import { nameRegistry } from "../../names.js";
import { DATA_DIR } from "../../config.js";

export async function run(args: ParsedArgs): Promise<void> {
	const jsonOutput = args.booleans["json"] ?? false;

	await initDb();

	// Initialize telemetry and name registry for cost + display name data
	await ledger.init();
	await nameRegistry.init();

	const names = nameRegistry.snapshot();
	const costs = ledger.snapshot();

	// All rows (including superseded)
	const allRows = store.scan({});
	const active = allRows.filter(r => !r.superseded_by);
	const superseded = allRows.length - active.length;

	// Per-project breakdown
	const byProject = new Map<string, number>();
	for (const r of active) {
		byProject.set(r.user_id, (byProject.get(r.user_id) ?? 0) + 1);
	}

	// Per-type breakdown (active only)
	const byType = new Map<string, number>();
	for (const r of active) {
		const type = r.type || "untyped";
		byType.set(type, (byType.get(type) ?? 0) + 1);
	}

	// Store size on disk
	const dbSize = getFileSize(join(DATA_DIR, "store", "store.db"));

	// JSON output mode
	if (jsonOutput) {
		const data = {
			total: allRows.length,
			active: active.length,
			superseded,
			dbSizeBytes: dbSize,
			byProject: Object.fromEntries(byProject),
			byType: Object.fromEntries(byType),
			costs,
		};
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	// ── Formatted output ──────────────────────────────────────────────────────

	fmt.header("Database");
	fmt.kv("Total memories", `${allRows.length}`);
	fmt.kv("Active", `${fmt.green(String(active.length))}`);
	fmt.kv("Superseded", `${fmt.dim(String(superseded))}`);
	fmt.kv("Store size", formatBytes(dbSize));
	fmt.kv("Data directory", fmt.blue(DATA_DIR));

	// Per-project table
	if (byProject.size > 0) {
		fmt.header("Projects");

		const projectRows = [...byProject.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([uid, count]) => {
				const displayName = names[uid] ?? uid;
				const isUser = uid.includes("_user_");
				const scope = isUser ? fmt.dim("user") : "project";
				return [displayName, scope, String(count)];
			});

		fmt.table(
			[
				{ label: "Name", minWidth: 20 },
				{ label: "Scope", minWidth: 8 },
				{ label: "Memories", minWidth: 8, align: "right" },
			],
			projectRows,
		);
	}

	// Per-type table
	if (byType.size > 0) {
		fmt.header("Memory Types");

		const typeRows = [...byType.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([type, count]) => {
				const pct = ((count / active.length) * 100).toFixed(0);
				const bar = "#".repeat(Math.round(count / active.length * 20));
				return [type, String(count), `${pct}%`, bar];
			});

		fmt.table(
			[
				{ label: "Type", minWidth: 18 },
				{ label: "Count", minWidth: 6, align: "right" },
				{ label: "%", minWidth: 5, align: "right" },
				{ label: "Distribution", minWidth: 20 },
			],
			typeRows,
		);
	}

	// Usage / cost breakdown — one row per backend in the ledger
	const backends = Object.entries(costs.backends).filter(([, b]) => b.calls > 0);
	fmt.header("Usage & Costs");
	if (backends.length === 0) {
		fmt.info("No LLM or embedding usage recorded yet.");
	} else {
		fmt.kv("Total", `$${costs.total_cost_usd.toFixed(4)}`);
		fmt.kv("Last updated", costs.last_updated ? costs.last_updated.slice(0, 19) : "-");
		fmt.blank();

		const costRows = backends
			.sort((a, b) => b[1].cost_usd - a[1].cost_usd || b[1].calls - a[1].calls)
			.map(([name, b]) => {
				const meta = backendMeta(name);
				const tokens = b.prompt_tokens + b.completion_tokens + b.tokens;
				const cost = meta.free ? "free" : `$${b.cost_usd.toFixed(4)}${meta.notional ? "*" : ""}`;
				return [meta.label, b.model ?? "-", String(b.calls), formatTokens(tokens), cost];
			});

		fmt.table(
			[
				{ label: "Backend", minWidth: 16 },
				{ label: "Model", minWidth: 10 },
				{ label: "Calls", minWidth: 6, align: "right" },
				{ label: "Tokens", minWidth: 10, align: "right" },
				{ label: "Cost", minWidth: 10, align: "right", color: fmt.green },
			],
			costRows,
		);

		if (backends.some(([name]) => backendMeta(name).notional)) {
			fmt.blank();
			console.log(`  ${fmt.dim("* notional - the cost Claude Code reports; subscription users are not billed per call")}`);
		}
	}

	fmt.blank();
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Display metadata for a ledger backend key. Unknown keys show as-is. */
function backendMeta(name: string): { label: string; notional?: boolean; free?: boolean } {
	switch (name) {
		case "claude-cli": return { label: "Claude Code (subscription)", notional: true };
		case "anthropic-api": return { label: "Anthropic API" };
		case "local": return { label: "Local embeddings", free: true };
		default: return { label: name };
	}
}

/** Get file size in bytes. Returns 0 if file doesn't exist. */
function getFileSize(filePath: string): number {
	try {
		return statSync(filePath).size;
	} catch {
		return 0;
	}
}

/** Format bytes as human-readable string (KB, MB, GB). */
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format token count with K/M suffix. */
function formatTokens(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
	return `${(tokens / 1_000_000).toFixed(2)}M`;
}
