/**
 * fsx.ts — cross-runtime filesystem helpers.
 *
 * The plugin loads under two runtimes (see store/driver.ts for the full story):
 *   • Bun   — opencode CLI/TUI
 *   • Node  — opencode desktop app (Electron utilityProcess sidecar)
 *
 * Bun-specific globals (`Bun.file`, `Bun.write`) are `undefined` under Node and
 * throw `ReferenceError: Bun is not defined`, which silently broke the name
 * registry and cost/activity telemetry on the desktop app (issue #198). These
 * helpers use `node:fs/promises`, which is implemented by BOTH runtimes, so the
 * plugin behaves identically everywhere.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Read and JSON-parse a file. Returns `undefined` if the file does not exist
 * (mirrors the previous `Bun.file(path).exists()` guard). Malformed JSON throws
 * — callers wrap this in try/catch and fall back to a default.
 */
export async function readJsonFile<T>(path: string): Promise<T | undefined> {
	try {
		const text = await readFile(path, "utf8");
		return JSON.parse(text) as T;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw err;
	}
}

/**
 * Write a string to a file, creating parent directories as needed.
 * Matches `Bun.write`'s directory-creation behaviour.
 */
export async function writeTextFile(path: string, data: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, data, "utf8");
}

/** Promise-based delay — replaces the Bun-only `Bun.sleep`. */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
