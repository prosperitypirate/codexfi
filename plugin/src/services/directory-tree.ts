/**
 * Directory tree generator for background enrichment.
 *
 * Produces a tree-formatted string of the project structure,
 * excluding build artifacts, dependencies, and VCS directories.
 * Used by triggerBackgroundEnrichment() in index.ts.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

export const TREE_IGNORE = new Set([
	"node_modules", ".git", ".next", ".nuxt", "dist", "build", "out",
	".cache", ".turbo", "__pycache__", ".venv", "venv", "target",
	".terraform", ".serverless", "coverage", ".nyc_output",
	".svelte-kit", ".output", ".vercel", ".netlify",
]);

/**
 * Generates a text-based directory tree of the given directory.
 * Excludes build artifacts, dependencies, and VCS directories listed in TREE_IGNORE.
 * Includes `.github/` as the sole dotfile exception. Sorts directories before files.
 *
 * @param rootDir - The root directory to traverse
 * @param maxDepth - Maximum recursion depth (typically 3)
 * @returns A string representation with tree connectors (├──, └──), root line ending with /
 */
export function generateDirectoryTree(rootDir: string, maxDepth: number): string {
	const lines: string[] = [];

	function walk(dir: string, prefix: string, depth: number): void {
		if (depth > maxDepth) return;
		try {
			const entries = readdirSync(dir, { withFileTypes: true })
				.filter(e => !e.name.startsWith(".") || e.name === ".github")
				.filter(e => !TREE_IGNORE.has(e.name))
				.sort((a, b) => {
					// Directories first, then files
					if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
					return a.name.localeCompare(b.name);
				});

			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];
				const isLast = i === entries.length - 1;
				const connector = isLast ? "└── " : "├── ";
				const childPrefix = isLast ? "    " : "│   ";

				lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`);

				if (entry.isDirectory()) {
					walk(join(dir, entry.name), prefix + childPrefix, depth + 1);
				}
			}
		} catch {
			// Permission denied or other error — skip
		}
	}

	const projectName = rootDir.split("/").pop() ?? "project";
	lines.push(`${projectName}/`);
	walk(rootDir, "", 1);

	return lines.join("\n");
}
