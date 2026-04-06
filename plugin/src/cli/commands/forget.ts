/**
 * `codexfi forget <id>` — delete a memory by ID.
 *
 * Permanently removes a memory from the store.
 * Use `codexfi list` to find memory IDs.
 *
 * The full UUID or the short prefix (from list output) is accepted.
 * If a short prefix matches multiple memories, all matches are shown
 * and the user must provide a longer prefix.
 */

import type { ParsedArgs } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb } from "../shared.js";
import { store } from "../../db.js";
import * as storeApi from "../../store.js";

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
		const match = resolvePrefix(idInput);

		if (match === null) {
			fmt.error(`No memory found matching prefix "${idInput}".`);
			process.exit(1);
		}

		if (Array.isArray(match)) {
			fmt.error(`Prefix "${idInput}" matches ${match.length} memories. Be more specific:`);
			fmt.blank();
			for (const m of match) {
				fmt.info(`${fmt.dim(m.id)} ${m.memory.slice(0, 60)}`);
			}
			process.exit(1);
		}

		// Single match — confirm and delete
		fmt.blank();
		fmt.info(`Deleting: ${fmt.dim(match.id)}`);
		fmt.info(`Content: ${match.memory.slice(0, 80)}`);
		fmt.blank();

		await storeApi.deleteMemory(match.id);
		fmt.success("Memory deleted.");
		fmt.blank();
		return;
	}

	// Full UUID provided — delete directly
	try {
		await storeApi.deleteMemory(idInput);
		fmt.success(`Deleted memory ${fmt.dim(idInput)}`);
	} catch (err) {
		fmt.error(`Failed to delete: ${err}`);
		process.exit(1);
	}

	fmt.blank();
}

// ── Prefix resolution ───────────────────────────────────────────────────────────

import type { MemoryRecord } from "../../vector-store.js";

/**
 * Resolve a short ID prefix to a full memory record.
 *
 * Returns:
 *   - null if no match
 *   - MemoryRecord if exactly one match
 *   - MemoryRecord[] if multiple matches (caller should ask for longer prefix)
 */
function resolvePrefix(
	prefix: string,
): MemoryRecord | MemoryRecord[] | null {
	if (store.countRows() === 0) return null;

	const all = store.scan({});
	const matches = all.filter(r => r.id.startsWith(prefix));

	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0]!;
	return matches;
}
