/**
 * `codexfi forget <id>` — delete a memory by ID.
 *
 * Permanently removes a memory from the LanceDB store.
 * Use `codexfi list` to find memory IDs.
 *
 * The full UUID or the short prefix (from list output) is accepted.
 * If a short prefix matches multiple memories, all matches are shown
 * and the user must provide a longer prefix.
 */

import type { ParsedArgs } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb } from "../shared.js";
import { getTable } from "../../db.js";
import { EMBEDDING_DIMS } from "../../config.js";
import * as store from "../../store.js";

export async function run(args: ParsedArgs): Promise<void> {
	const idInput = args.positional[0]?.trim();

	if (!idInput) {
		fmt.error("Missing memory ID.");
		fmt.blank();
		fmt.info(`Usage: ${fmt.cyan("codexfi forget")} ${fmt.dim("<id>")}`);
		fmt.info(`Run ${fmt.cyan("codexfi list")} to see memory IDs.`);
		process.exit(1);
	}

	await initDb();

	// If the input looks like a short prefix (< 36 chars), resolve it
	if (idInput.length < 36) {
		const match = await resolvePrefix(idInput);

		if (match === null) {
			fmt.error(`No memory found matching prefix "${idInput}".`);
			process.exit(1);
		}

		if (Array.isArray(match)) {
			fmt.error(`Prefix "${idInput}" matches ${match.length} memories. Be more specific:`);
			fmt.blank();
			for (const m of match) {
				fmt.info(`${fmt.dim(m.id as string)} ${(m.memory as string).slice(0, 60)}`);
			}
			process.exit(1);
		}

		// Single match — confirm and delete
		const fullId = match.id as string;
		const memory = (match.memory as string).slice(0, 80);

		fmt.blank();
		fmt.info(`Deleting: ${fmt.dim(fullId)}`);
		fmt.info(`Content: ${memory}`);
		fmt.blank();

		await store.deleteMemory(fullId);
		fmt.success("Memory deleted.");
		fmt.blank();
		return;
	}

	// Full UUID provided — delete directly
	try {
		await store.deleteMemory(idInput);
		fmt.success(`Deleted memory ${fmt.dim(idInput)}`);
	} catch (err) {
		fmt.error(`Failed to delete: ${err}`);
		process.exit(1);
	}

	fmt.blank();
}

// ── Prefix resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a short ID prefix to a full memory record.
 *
 * Returns:
 *   - null if no match
 *   - Record if exactly one match
 *   - Record[] if multiple matches (caller should ask for longer prefix)
 */
async function resolvePrefix(
	prefix: string,
): Promise<Record<string, unknown> | Record<string, unknown>[] | null> {
	const table = getTable();
	const count = await table.countRows();
	if (count === 0) return null;

	// Scan all IDs — LanceDB doesn't support LIKE queries, so we do a full scan.
	// This is fine for CLI use (<100K rows) but wouldn't scale for a hot path.
	const rows = await table
		.search(new Array(EMBEDDING_DIMS).fill(0))
		.limit(100_000)
		.toArray();

	const matches = rows.filter((r) => (r.id as string).startsWith(prefix));

	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	return matches;
}
