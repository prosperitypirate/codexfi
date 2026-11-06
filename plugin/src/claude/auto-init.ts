/**
 * Project auto-init — seeds a brand-new project's memory from its own files
 * (README, manifests, build files, agent instructions, recent git log) so the
 * very next session already knows what the project is.
 *
 * Runs in the background worker, never in a hook.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as store from "../store.js";
import { INIT_FILES, INIT_TOTAL_CHAR_CAP } from "../services/auto-init-config.js";
import { stripPrivateContent } from "../services/privacy.js";

/** Collect the init corpus for `directory`. Exported for tests. */
export function collectInitContent(directory: string): string {
	const sections: string[] = [];
	let total = 0;

	for (const { name, maxChars } of INIT_FILES) {
		if (total >= INIT_TOTAL_CHAR_CAP) break;
		const p = join(directory, name);
		if (!existsSync(p)) continue;
		try {
			const raw = readFileSync(p, "utf8").slice(0, Math.min(maxChars, INIT_TOTAL_CHAR_CAP - total));
			sections.push(`=== ${name} ===\n${raw}`);
			total += raw.length;
		} catch {
			// unreadable — skip
		}
	}

	if (total < INIT_TOTAL_CHAR_CAP) {
		try {
			const gitLog = execFileSync("git", ["log", "--oneline", "-20", "--no-decorate"], {
				cwd: directory,
				encoding: "utf8",
				timeout: 3000,
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();
			if (gitLog) sections.push(`=== git log (recent) ===\n${gitLog.slice(0, Math.min(2000, INIT_TOTAL_CHAR_CAP - total))}`);
		} catch {
			// not a git repo
		}
	}

	return stripPrivateContent(sections.join("\n\n"));
}

/** Extract init memories for a project. Returns the number stored. */
export async function runAutoInit(directory: string, projectTag: string): Promise<number> {
	const content = collectInitContent(directory);
	if (!content.trim()) return 0;
	const results = await store.ingest([{ role: "user", content }], projectTag, {
		mode: "init",
		metadata: { source: "auto-init", date: new Date().toISOString().slice(0, 10) },
	});
	return results.length;
}
