/**
 * `opencode-memory stats` — display memory database statistics and API costs.
 *
 * Shows:
 *   - Total memory count and database size
 *   - Per-project memory breakdown
 *   - Memory type distribution
 *   - Cumulative API costs by provider
 *
 * Flags:
 *   --json   Output raw JSON instead of formatted display
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ParsedArgs } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb } from "../shared.js";
import { getTable } from "../../db.js";
import { EMBEDDING_DIMS } from "../../config.js";
import { ledger } from "../../telemetry.js";
import { nameRegistry } from "../../names.js";
import { DATA_DIR } from "../../config.js";

export async function run(args: ParsedArgs): Promise<void> {
	const jsonOutput = args.booleans["json"] ?? false;

	await initDb();

	// Initialize telemetry and name registry for cost + display name data
	await ledger.init();
	await nameRegistry.init();

	const table = getTable();
	const names = nameRegistry.snapshot();
	const costs = ledger.snapshot();

	// Count total rows
	const totalCount = await table.countRows();

	// Fetch all rows for breakdown (zero-vector scan — no embedding needed)
	const allRows = totalCount > 0
		? await table
			.search(new Array(EMBEDDING_DIMS).fill(0))
			.limit(100_000)
			.toArray()
		: [];

	// Active (non-superseded) memories
	const active = allRows.filter((r) => !(r.superseded_by as string));
	const superseded = allRows.length - active.length;

	// Per-project breakdown
	const byProject = new Map<string, number>();
	for (const r of active) {
		const uid = r.user_id as string;
		byProject.set(uid, (byProject.get(uid) ?? 0) + 1);
	}

	// Per-type breakdown (active only)
	const byType = new Map<string, number>();
	for (const r of active) {
		const type = (r.type as string) || "untyped";
		byType.set(type, (byType.get(type) ?? 0) + 1);
	}

	// Database size on disk
	const dbSize = getDirSize(join(DATA_DIR, "lancedb"));

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
	fmt.kv("Database size", formatBytes(dbSize));
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
				const bar = "█".repeat(Math.round(count / active.length * 20));
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

	// Cost breakdown
	if (costs.total_cost_usd > 0) {
		fmt.header("API Costs");
		fmt.kv("Total", `$${costs.total_cost_usd.toFixed(4)}`);
		fmt.kv("Last updated", costs.last_updated ? costs.last_updated.slice(0, 19) : "—");
		fmt.blank();

		const costRows: string[][] = [];

		if (costs.anthropic?.calls > 0) {
			costRows.push([
				"Anthropic",
				String(costs.anthropic.calls),
				formatTokens(costs.anthropic.prompt_tokens + costs.anthropic.completion_tokens),
				`$${costs.anthropic.cost_usd.toFixed(4)}`,
			]);
		}
		if (costs.xai?.calls > 0) {
			costRows.push([
				"xAI",
				String(costs.xai.calls),
				formatTokens(costs.xai.prompt_tokens + costs.xai.completion_tokens),
				`$${costs.xai.cost_usd.toFixed(4)}`,
			]);
		}
		if (costs.google?.calls > 0) {
			costRows.push([
				"Google",
				String(costs.google.calls),
				formatTokens(costs.google.prompt_tokens + costs.google.completion_tokens),
				`$${costs.google.cost_usd.toFixed(4)}`,
			]);
		}
		if (costs.voyage?.calls > 0) {
			costRows.push([
				"Voyage AI",
				String(costs.voyage.calls),
				formatTokens(costs.voyage.tokens),
				`$${costs.voyage.cost_usd.toFixed(4)}`,
			]);
		}

		if (costRows.length > 0) {
			fmt.table(
				[
					{ label: "Provider", minWidth: 12 },
					{ label: "Calls", minWidth: 6, align: "right" },
					{ label: "Tokens", minWidth: 10, align: "right" },
					{ label: "Cost", minWidth: 10, align: "right", color: fmt.green },
				],
				costRows,
			);
		}
	} else {
		fmt.header("API Costs");
		fmt.info("No API usage recorded yet.");
	}

	fmt.blank();
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Recursively calculate directory size in bytes.
 * Returns 0 if the directory doesn't exist.
 */
function getDirSize(dirPath: string): number {
	try {
		let total = 0;
		const entries = readdirSync(dirPath, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dirPath, entry.name);
			if (entry.isDirectory()) {
				total += getDirSize(fullPath);
			} else {
				try {
					total += statSync(fullPath).size;
				} catch {
					// Skip unreadable files
				}
			}
		}
		return total;
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
