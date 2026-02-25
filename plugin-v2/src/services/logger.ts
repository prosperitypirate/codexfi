/**
 * Async file logger — non-blocking appendFile from node:fs/promises.
 *
 * Fire-and-forget pattern: logging never blocks plugin execution.
 */

import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_FILE = join(homedir(), ".opencode-memory.log");

// Write session header (fire-and-forget)
appendFile(LOG_FILE, `\n--- Session started: ${new Date().toISOString()} ---\n`)
	.catch(() => {});

export function log(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	const line = data
		? `[${timestamp}] ${message}: ${JSON.stringify(data)}\n`
		: `[${timestamp}] ${message}\n`;
	// Fire-and-forget — logging should never block plugin execution
	appendFile(LOG_FILE, line).catch(() => {});
}
