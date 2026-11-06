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

interface Unit {
	kind: "header" | "item" | "other";
	lines: string[];
}

/** Split a [MEMORY] block into headers and memory items (bullet + its continuation lines). */
function toUnits(text: string): Unit[] {
	const units: Unit[] = [];
	for (const line of text.split("\n")) {
		if (line.startsWith("## ") || line.startsWith("[MEMORY]")) {
			units.push({ kind: "header", lines: [line] });
		} else if (line.startsWith("- ") || line.startsWith("> ")) {
			units.push({ kind: "item", lines: [line] });
		} else {
			const cur = units[units.length - 1];
			if (cur && cur.kind === "item") cur.lines.push(line);
			else units.push({ kind: "other", lines: [line] });
		}
	}
	return units;
}

const render = (units: Unit[]) => units.map((u) => u.lines.join("\n")).join("\n");

/**
 * Trim a [MEMORY] block to `limit` chars by dropping whole memories from the end
 * (a bullet together with its continuation lines — never half a fact). Section
 * headers left without items are removed. A single oversized memory is cut
 * with an ellipsis as a last resort.
 */
export function fitToLimit(text: string, limit = HOOK_OUTPUT_LIMIT): string {
	if (text.length <= limit) return text;
	const units = toUnits(text);
	while (render(units).length > limit) {
		let idx = -1;
		for (let i = units.length - 1; i >= 0; i--) {
			if (units[i]!.kind === "item") {
				idx = i;
				break;
			}
		}
		const items = units.filter((u) => u.kind === "item").length;
		if (idx === -1 || items <= 1) break;
		units.splice(idx, 1);
	}
	// Drop headers that no longer introduce any item.
	const kept = units.filter((u, i) => {
		if (u.kind !== "header" || u.lines[0]!.startsWith("[MEMORY]")) return true;
		const next = units.slice(i + 1).find((x) => x.kind !== "other" || x.lines.join("").trim() !== "");
		return !!next && next.kind === "item";
	});
	const out = render(kept);
	return out.length > limit ? out.slice(0, limit - 1) + "…" : out;
}

/**
 * Of the memories offered to a block, return the ids that actually survived
 * fitToLimit() — only those may be recorded as "already shown this session".
 */
export function survivingIds(fitted: string, items: Array<{ id: string; memory: string }>): string[] {
	const norm = (s: string) => s.replace(/\s+/g, " ").trim();
	const hay = norm(fitted);
	return items
		.filter((it) => {
			const probe = norm(it.memory).slice(0, 80);
			return probe.length > 0 && hay.includes(probe);
		})
		.map((it) => it.id);
}
