/**
 * Detached worker launcher — kept dependency-light so the Stop / PreCompact /
 * SessionEnd hooks never load the store or embedding model.
 */

import { spawn } from "node:child_process";

import { logLine, workerRunning } from "./state.js";

/**
 * Start a detached `codexfi worker` unless one is already running. Returns
 * immediately. The worker inherits this process's runtime (bun/node) and entry
 * script, so it runs exactly the same codexfi build as the hook.
 */
export function spawnWorker(): void {
	if (process.env.CODEXFI_NO_WORKER === "1") return;
	if (workerRunning()) return;
	const entry = process.argv[1];
	if (!entry) return;
	try {
		const child = spawn(process.execPath, [entry, "worker"], {
			detached: true,
			stdio: "ignore",
			env: { ...process.env, CODEXFI_WORKER: "1" },
		});
		child.unref();
	} catch (e) {
		logLine("hook", "spawnWorker failed", { error: e instanceof Error ? e.message : String(e) });
	}
}
