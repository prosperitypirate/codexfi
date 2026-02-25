/**
 * Async logger — replaces appendFileSync with Bun.write (non-blocking).
 * See design doc §13.
 */

import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_FILE = join(homedir(), ".opencode-memory-v2.log");

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
