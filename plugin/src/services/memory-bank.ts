/**
 * Memory Bank detection.
 *
 * A "Memory Bank" is a curated, human-maintained set of markdown files in
 * <project>/memory-bank/ (projectbrief, productContext, systemPatterns,
 * techContext, activeContext, progress) that the agent loads at session start.
 *
 * When one exists, codexfi acts as its complement instead of duplicating it:
 * the bank already carries the structured project picture, so codexfi skips
 * its own structured sections and contributes what a curated bank cannot —
 * per-turn retrieval of specific facts, sessions since the bank was last saved,
 * and cross-project user preferences.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const MEMORY_BANK_CORE_FILES = [
	"projectbrief.md",
	"productContext.md",
	"systemPatterns.md",
	"techContext.md",
	"activeContext.md",
	"progress.md",
] as const;

export interface MemoryBankInfo {
	dir: string;
	files: string[];
	/** Most recent mtime of any core file (ms since epoch) — "last save bank". */
	lastSavedAt: number;
}

/**
 * Find <dir>/memory-bank, walking up at most `maxDepth` parents (so a session
 * started in a subdirectory still sees the repo-root bank). A directory counts
 * as a bank when it contains at least one core file.
 */
export function detectMemoryBank(startDir: string, maxDepth = 4): MemoryBankInfo | null {
	let dir = startDir;
	for (let i = 0; i <= maxDepth; i++) {
		const bank = join(dir, "memory-bank");
		try {
			if (existsSync(bank) && statSync(bank).isDirectory()) {
				const present = readdirSync(bank).filter((f) =>
					(MEMORY_BANK_CORE_FILES as readonly string[]).includes(f),
				);
				if (present.length > 0) {
					const lastSavedAt = Math.max(...present.map((f) => statSync(join(bank, f)).mtimeMs));
					return { dir: bank, files: present, lastSavedAt };
				}
			}
		} catch {
			// unreadable — keep walking
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}
