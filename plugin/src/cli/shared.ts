/**
 * Shared utilities for CLI commands — DB initialization and tag resolution.
 *
 * Extracted here so every command that needs LanceDB access doesn't
 * duplicate the init/error-handling logic.
 */

import { init as initLanceDb } from "../db.js";
import { getTags } from "../services/tags.js";
import * as fmt from "./fmt.js";

/**
 * Initialize the LanceDB connection.
 *
 * Exits with a helpful error if initialization fails (e.g., corrupt DB,
 * missing data directory permissions).
 */
export async function initDb(): Promise<void> {
	try {
		await initLanceDb();
	} catch (err) {
		fmt.error("Failed to initialize LanceDB.");
		fmt.blank();
		fmt.info(`Error: ${err}`);
		fmt.blank();
		fmt.info("This usually means:");
		fmt.info(`  ${fmt.dim("1.")} The data directory (~/.codexfi/) is not writable`);
		fmt.info(`  ${fmt.dim("2.")} The database files are corrupted`);
		fmt.info(`  ${fmt.dim("3.")} LanceDB NAPI bindings are missing (try: bun install)`);
		fmt.blank();
		process.exit(1);
	}
}

/**
 * Resolve project/user container tags for a given directory.
 *
 * Uses the same deterministic hashing as the plugin (git email + directory path).
 */
export function resolveTags(directory: string): { user: string; project: string } {
	return getTags(directory);
}
