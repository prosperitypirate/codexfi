/**
 * `codexfi list` — display stored memories in a formatted table.
 *
 * Flags:
 *   --project <dir>   Project directory to list (default: cwd)
 *   --user            List user-scoped memories instead of project
 *   --type <type>     Filter by memory type (e.g. "architecture", "error-solution")
 *   --limit <n>       Max memories to display (default: 20)
 *   --all             Include superseded memories
 *   --json            Output raw JSON instead of formatted table
 */

import type { ParsedArgs } from "../args.js";
import { getFlag, getFlagInt } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb, resolveTags } from "../shared.js";
import * as store from "../../store.js";

// ── Memory type → display color mapping ─────────────────────────────────────────

const TYPE_COLORS: Record<string, (s: string) => string> = {
	"project-brief": fmt.cyan,
	"architecture": fmt.blue,
	"tech-context": fmt.magenta,
	"product-context": fmt.green,
	"progress": fmt.yellow,
	"session-summary": fmt.dim,
	"error-solution": fmt.red,
	"preference": fmt.green,
	"learned-pattern": fmt.magenta,
	"project-config": fmt.cyan,
	"conversation": fmt.dim,
};

function colorType(type: string): string {
	const colorFn = TYPE_COLORS[type] ?? fmt.dim;
	return colorFn(type);
}

// ── Main ────────────────────────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
	const projectDir = getFlag(args, "project") ?? process.cwd();
	const isUser = args.booleans["user"] ?? false;
	const typeFilter = getFlag(args, "type");
	const limit = getFlagInt(args, "limit", 20);
	const includeSuperseded = args.booleans["all"] ?? false;
	const jsonOutput = args.booleans["json"] ?? false;

	await initDb();
	const tags = resolveTags(projectDir);
	const userId = isUser ? tags.user : tags.project;
	const scopeLabel = isUser ? "user" : `project (${fmt.blue(projectDir)})`;

	// Fetch memories — filtered by type if requested
	const memories = typeFilter
		? await store.listByType(userId, [typeFilter], { limit })
		: await store.list(userId, { limit, includeSuperseded });

	// JSON output mode — print raw and exit
	if (jsonOutput) {
		console.log(JSON.stringify(memories, null, 2));
		return;
	}

	fmt.header("Memories");
	fmt.info(`Scope: ${scopeLabel}`);
	if (typeFilter) fmt.info(`Filter: type = ${colorType(typeFilter)}`);
	if (includeSuperseded) fmt.info("Including superseded memories");
	fmt.info(`Showing ${fmt.bold(String(memories.length))} of ${limit} max`);
	fmt.blank();

	if (memories.length === 0) {
		fmt.warn("No memories found for this scope.");
		fmt.blank();
		fmt.info(`Try ${fmt.cyan("codexfi install")} and start an OpenCode session,`);
		fmt.info("or use /memory-init to seed project memory manually.");
		return;
	}

	// Format table rows
	const rows: string[][] = memories.map((m) => {
		const meta = "metadata" in m
			? (m.metadata as Record<string, unknown>)
			: {};
		const type = (meta.type as string) ?? (m as Record<string, unknown>).type as string ?? "—";
		const id = ("id" in m ? m.id as string : "").slice(0, 8);
		const memory = ("memory" in m ? m.memory as string : "").slice(0, 80);
		const date = formatDate("updated_at" in m
			? m.updated_at as string
			: "created_at" in m
				? m.created_at as string
				: null
		);

		return [id, colorType(type), memory, date];
	});

	fmt.table(
		[
			{ label: "ID", minWidth: 8, color: fmt.dim },
			{ label: "Type", minWidth: 16 },
			{ label: "Memory", minWidth: 30 },
			{ label: "Updated", minWidth: 10, align: "right" },
		],
		rows,
	);

	fmt.blank();
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string as a short relative or absolute date.
 */
function formatDate(iso: string | null): string {
	if (!iso) return fmt.dim("—");

	const date = new Date(iso);
	if (isNaN(date.getTime())) return fmt.dim("—");

	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return fmt.green("today");
	if (diffDays === 1) return "yesterday";
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

	// Older than a month — show YYYY-MM-DD
	return iso.slice(0, 10);
}
