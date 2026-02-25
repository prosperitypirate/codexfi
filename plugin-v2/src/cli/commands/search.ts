/**
 * `opencode-memory search <query>` — semantic search over stored memories.
 *
 * Uses the same vector search pipeline as the plugin: Voyage AI embedding → LanceDB
 * cosine similarity → recency blending → threshold filtering.
 *
 * Flags:
 *   --project <dir>   Project directory scope (default: cwd)
 *   --user            Search user-scoped memories instead of project
 *   --limit <n>       Max results to return (default: 10)
 *   --json            Output raw JSON instead of formatted results
 */

import type { ParsedArgs } from "../args.js";
import { getFlag, getFlagInt } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb, resolveTags } from "../shared.js";
import * as store from "../../store.js";

export async function run(args: ParsedArgs): Promise<void> {
	// The query is the remaining positional args joined together
	const query = args.positional.join(" ").trim();
	if (!query) {
		fmt.error("Missing search query.");
		fmt.blank();
		fmt.info(`Usage: ${fmt.cyan("opencode-memory search")} ${fmt.dim("<query>")} [--limit N] [--project <dir>]`);
		fmt.blank();
		fmt.info("Examples:");
		fmt.info(`  ${fmt.dim("opencode-memory search \"how is auth handled\"")}`);
		fmt.info(`  ${fmt.dim("opencode-memory search \"database migration\" --limit 5")}`);
		process.exit(1);
	}

	const projectDir = getFlag(args, "project") ?? process.cwd();
	const isUser = args.booleans["user"] ?? false;
	const limit = getFlagInt(args, "limit", 10);
	const jsonOutput = args.booleans["json"] ?? false;

	await initDb();
	const tags = resolveTags(projectDir);
	const userId = isUser ? tags.user : tags.project;

	// Run semantic search with spinner — involves embedding API call
	const results = await fmt.spin(
		`Searching ${isUser ? "user" : "project"} memories`,
		() => store.search(query, userId, { limit, threshold: 0.3 }),
	);

	// JSON output mode
	if (jsonOutput) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	fmt.header("Search Results");
	fmt.info(`Query: ${fmt.bold(`"${query}"`)}`);
	fmt.info(`Scope: ${isUser ? "user" : fmt.blue(projectDir)}`);
	fmt.info(`Found ${fmt.bold(String(results.length))} results`);
	fmt.blank();

	if (results.length === 0) {
		fmt.warn("No memories matched this query above the similarity threshold.");
		fmt.blank();
		fmt.info("Try a broader query, or check available memories with:");
		fmt.info(`  ${fmt.dim("opencode-memory list")}`);
		return;
	}

	// Display each result with similarity score, type, and content
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const pct = Math.round(r.score * 100);
		const type = (r.metadata?.type as string) ?? "—";
		const date = r.date ?? "—";

		// Score bar: visual similarity indicator
		const barLen = Math.round(pct / 5); // 0-20 chars for 0-100%
		const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
		const scoreColor = pct >= 70 ? fmt.green : pct >= 50 ? fmt.yellow : fmt.dim;

		console.log(`  ${fmt.bold(`${i + 1}.`)} ${scoreColor(`${pct}%`)} ${fmt.dim(bar)} ${fmt.dim(type)} ${fmt.dim(date)}`);
		console.log(`     ${r.memory}`);

		// Show chunk excerpt if it adds detail beyond the memory text
		if (r.chunk && r.chunk.trim() !== r.memory && r.score >= 0.55) {
			const excerpt = r.chunk.trim().slice(0, 200);
			const lines = excerpt.split("\n").slice(0, 3);
			for (const line of lines) {
				console.log(`     ${fmt.dim(">")} ${fmt.dim(line.trim())}`);
			}
		}

		fmt.blank();
	}
}
