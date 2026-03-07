/**
 * auto-init-config.ts — constants for the project auto-init system.
 *
 * Extracted from index.ts so that tests can import them without polluting
 * the plugin's top-level exports. opencode calls every export of the plugin
 * entry point as a plugin function — non-function exports (arrays, numbers)
 * cause "fn is not a function" runtime errors.
 */

/** Files to read during auto-init, with per-file character caps. */
export const INIT_FILES = [
	// ── Primary: project identity & description ────────────────
	{ name: "README.md",              maxChars: 3000 },
	{ name: "README.rst",             maxChars: 3000 },

	// ── Build system & dependencies ────────────────────────────
	{ name: "package.json",           maxChars: 2000 },
	{ name: "Cargo.toml",             maxChars: 2000 },
	{ name: "go.mod",                 maxChars: 1000 },
	{ name: "pyproject.toml",         maxChars: 2000 },
	{ name: "deno.json",              maxChars: 1000 },
	{ name: "deno.jsonc",             maxChars: 1000 },

	// ── Build/run commands ─────────────────────────────────────
	{ name: "Makefile",               maxChars: 2000 },
	{ name: "Justfile",               maxChars: 1500 },
	{ name: "Taskfile.yml",           maxChars: 1500 },

	// ── Infrastructure ─────────────────────────────────────────
	{ name: "Dockerfile",             maxChars: 1500 },
	{ name: "docker-compose.yml",     maxChars: 1500 },
	{ name: "docker-compose.yaml",    maxChars: 1500 },

	// ── TypeScript/JS config ───────────────────────────────────
	{ name: "tsconfig.json",          maxChars: 1000 },
	{ name: "biome.json",             maxChars: 1000 },
	{ name: "biome.jsonc",            maxChars: 1000 },

	// ── Monorepo ───────────────────────────────────────────────
	{ name: "pnpm-workspace.yaml",    maxChars: 500  },
	{ name: "lerna.json",             maxChars: 500  },
	{ name: "turbo.json",             maxChars: 1000 },
	{ name: "nx.json",                maxChars: 1000 },

	// ── Agent instructions ─────────────────────────────────────
	{ name: "AGENTS.md",              maxChars: 2000 },
	{ name: "CLAUDE.md",              maxChars: 2000 },
	{ name: "CONTRIBUTING.md",        maxChars: 2000 },
	{ name: "CONVENTIONS.md",         maxChars: 2000 },
	{ name: "CODING_CONVENTIONS.md",  maxChars: 2000 },

	// ── Environment ────────────────────────────────────────────
	{ name: ".env.example",           maxChars: 500  },
	{ name: ".env.template",          maxChars: 500  },
];

/**
 * Total character cap across all files read during auto-init.
 * Prevents sending too much context to the extraction LLM.
 */
export const INIT_TOTAL_CHAR_CAP = 15000;
