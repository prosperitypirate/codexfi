/**
 * Shared runtime helpers for hook / worker / MCP processes.
 */

import * as db from "../db.js";
import { nameRegistry } from "../names.js";
import { PLUGIN_CONFIG } from "../plugin-config.js";
import { getDisplayNames, getTags } from "../services/tags.js";
import { activityLog, ledger } from "../telemetry.js";

let inited = false;

/** Open the store + telemetry once per process. */
export async function ensureInit(): Promise<void> {
	if (inited) return;
	await db.init();
	await ledger.init();
	await activityLog.init();
	await nameRegistry.init();
	inited = true;
}

export interface Tags {
	user: string;
	project: string;
}

/** Container tags for a working directory; also records human-readable names for the dashboard. */
export function tagsFor(cwd: string): Tags {
	const tags = getTags(cwd);
	try {
		const names = getDisplayNames(cwd);
		nameRegistry.register(tags.project, names.project);
		nameRegistry.register(tags.user, names.user);
	} catch {
		// cosmetic only
	}
	return tags;
}

/**
 * True when codexfi must stay completely silent in this process:
 *  - CODEXFI_DISABLE=1 (set on our own `claude -p` children → no recursion)
 *  - cwd under a configured excludePaths prefix (privacy)
 */
export function isDisabled(cwd?: string): boolean {
	if (process.env.CODEXFI_DISABLE === "1") return true;
	if (cwd && PLUGIN_CONFIG.excludePaths.some((p) => cwd === p || cwd.startsWith(p.endsWith("/") ? p : `${p}/`))) {
		return true;
	}
	return false;
}

/** Claude Code replaces hook output above 10,000 chars with a stub — stay under it. */
export const HOOK_OUTPUT_LIMIT = 9_500;

/**
 * Trim a [MEMORY] block to `limit` chars by dropping whole trailing bullet
 * lines (never cutting mid-fact). Section headers left without bullets are
 * removed too.
 */
export function fitToLimit(text: string, limit = HOOK_OUTPUT_LIMIT): string {
	if (text.length <= limit) return text;
	const lines = text.split("\n");
	while (lines.join("\n").length > limit && lines.length > 1) {
		// drop the last bullet (or continuation line) we can find
		let idx = -1;
		for (let i = lines.length - 1; i >= 0; i--) {
			const l = lines[i]!;
			if (l.startsWith("- ") || l.startsWith("> ") || l.startsWith("  >")) {
				idx = i;
				break;
			}
		}
		if (idx === -1) {
			lines.pop();
			continue;
		}
		lines.splice(idx, 1);
		// drop continuation lines that belonged to the removed bullet
		while (idx < lines.length && lines[idx]!.startsWith("  >")) lines.splice(idx, 1);
	}
	// remove headers with no remaining content
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const l = lines[i]!;
		if (l.startsWith("## ")) {
			const next = lines.slice(i + 1).find((x) => x.trim() !== "");
			if (!next || next.startsWith("## ")) continue;
		}
		out.push(l);
	}
	return out.join("\n");
}
