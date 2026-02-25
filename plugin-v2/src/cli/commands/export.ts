/**
 * `opencode-memory export` — export memories to JSON or CSV.
 *
 * Exports all active memories for a given scope to stdout or a file.
 * Useful for backup, migration, or external analysis.
 *
 * Flags:
 *   --project <dir>   Project directory scope (default: cwd)
 *   --user            Export user-scoped memories instead of project
 *   --format <fmt>    Output format: "json" (default) or "csv"
 *   --all             Include superseded memories
 *   --output <file>   Write to file instead of stdout
 */

import { writeFileSync } from "node:fs";

import type { ParsedArgs } from "../args.js";
import { getFlag } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb, resolveTags } from "../shared.js";
import * as store from "../../store.js";

export async function run(args: ParsedArgs): Promise<void> {
	const projectDir = getFlag(args, "project") ?? process.cwd();
	const isUser = args.booleans["user"] ?? false;
	const format = getFlag(args, "format", "json") as "json" | "csv";
	const includeSuperseded = args.booleans["all"] ?? false;
	const outputFile = getFlag(args, "output");

	if (format !== "json" && format !== "csv") {
		fmt.error(`Unknown format: "${format}". Supported: json, csv`);
		process.exit(1);
	}

	await initDb();
	const tags = resolveTags(projectDir);
	const userId = isUser ? tags.user : tags.project;

	// Fetch all memories (high limit)
	const memories = await store.list(userId, { limit: 10_000, includeSuperseded });

	let output: string;

	if (format === "csv") {
		output = toCsv(memories);
	} else {
		output = JSON.stringify(memories, null, 2);
	}

	// Write to file or stdout
	if (outputFile) {
		writeFileSync(outputFile, output);
		fmt.success(`Exported ${memories.length} memories to ${fmt.blue(outputFile)}`);
	} else {
		// Direct to stdout — no formatting, just data
		process.stdout.write(output + "\n");
	}
}

// ── CSV formatter ───────────────────────────────────────────────────────────────

/**
 * Convert memory records to RFC 4180 CSV.
 *
 * Handles quoting of fields containing commas, quotes, or newlines.
 */
function toCsv(memories: Array<Record<string, unknown>>): string {
	const headers = ["id", "memory", "type", "user_id", "created_at", "updated_at"];
	const rows = [headers.join(",")];

	for (const m of memories) {
		const meta = (m.metadata ?? {}) as Record<string, unknown>;
		const type = (meta.type as string) ?? "";

		const cells = [
			csvEscape(m.id as string ?? ""),
			csvEscape(m.memory as string ?? ""),
			csvEscape(type),
			csvEscape(m.user_id as string ?? ""),
			csvEscape(m.created_at as string ?? ""),
			csvEscape(m.updated_at as string ?? ""),
		];

		rows.push(cells.join(","));
	}

	return rows.join("\n");
}

/** Escape a value for CSV: quote if it contains comma, quote, or newline. */
function csvEscape(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}
