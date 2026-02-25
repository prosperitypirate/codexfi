/**
 * `opencode-memory install` — register plugin with OpenCode and create slash commands.
 *
 * Steps:
 *   1. Resolve the plugin's absolute path from the CLI binary location.
 *   2. Find or create the OpenCode config (~/.config/opencode/opencode.json[c]).
 *   3. Register the plugin's file:// URI in the config's `plugin` array.
 *   4. Create the /memory-init slash command in ~/.config/opencode/command/.
 *   5. Print next-steps guidance (API keys, restart).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { ParsedArgs } from "../args.js";
import * as fmt from "../fmt.js";

// ── Constants ───────────────────────────────────────────────────────────────────

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_COMMAND_DIR = join(OPENCODE_CONFIG_DIR, "command");

/**
 * Slash command: /memory-init
 *
 * Guides the agent through a structured project memory initialization:
 * check existing, detect project type, explore or ask, save by category, confirm.
 */
const MEMORY_INIT_COMMAND = `---
description: Initialize structured project memory across all categories
---

# Initializing Project Memory

You are populating persistent memory for this project. This creates the structured knowledge base
that will be injected at the start of every future session — making you immediately effective
without re-exploration.

## Step 1 — Check what exists

\`\`\`
memory(mode: "list", scope: "project")
\`\`\`

If memories already exist, review them and only fill gaps. Don't duplicate.

## Step 2 — Detect project type

Check whether this is an existing codebase or a blank project:
- If files/code exist → proceed to Step 3 (explore and extract)
- If directory is empty → proceed to Step 4 (ask founding questions)

---

## Step 3 — Existing codebase: explore and extract

Take 30–50 tool calls to genuinely understand the project. Read:

- README.md, CONTRIBUTING.md, AGENTS.md, CLAUDE.md
- Package manifests: package.json, Cargo.toml, pyproject.toml, go.mod
- Config files: tsconfig.json, .eslintrc, docker-compose.yml, CI/CD configs
- Key source entry points (main, index, app)
- \`git log --oneline -30\` — Recent history and commit style
- \`git shortlog -sn --all | head -10\` — Main contributors

Then save one memory per category below. Be specific and concrete — vague memories are useless.

### Category memories to create:

**project-brief** — What this project is
\`\`\`
memory(mode:"add", scope:"project", type:"project-brief",
  content:"[Project name]: [1-2 sentence description]. Core goals: [list]. Main users: [who].")
\`\`\`

**architecture** — How it's built
\`\`\`
memory(mode:"add", scope:"project", type:"architecture",
  content:"[Key architectural decisions, patterns in use, component structure, critical paths].")
\`\`\`

**tech-context** — Tech stack and setup
\`\`\`
memory(mode:"add", scope:"project", type:"tech-context",
  content:"Stack: [languages/frameworks]. Build: [command]. Run: [command]. Test: [command]. Key deps: [list].")
\`\`\`

**product-context** — Why it exists
\`\`\`
memory(mode:"add", scope:"project", type:"product-context",
  content:"[Problem being solved]. [Target users]. [Key UX goals or product constraints].")
\`\`\`

**progress** — Current state
\`\`\`
memory(mode:"add", scope:"project", type:"progress",
  content:"Status: [working/in-progress/early]. What works: [list]. In progress: [list]. Known issues: [list].")
\`\`\`

---

## Step 4 — Blank project: ask founding questions

If the directory is empty or has no meaningful code, ask the user all at once:

1. What are we building? (brief description)
2. What tech stack / language are you planning to use?
3. What's the core goal or problem being solved?
4. Any known constraints or requirements upfront?

Then save from their answers:

\`\`\`
memory(mode:"add", scope:"project", type:"project-brief", content:"...")
memory(mode:"add", scope:"project", type:"product-context", content:"...")
memory(mode:"add", scope:"project", type:"tech-context", content:"...")
\`\`\`

Leave architecture and progress empty — they'll populate automatically as work begins.

---

## Step 5 — User preferences (optional)

If the user hasn't been asked before, ask:
- Any communication style preferences? (terse vs. detailed, emoji vs. plain, etc.)
- Any cross-project workflow preferences? (always use X, never do Y)

Save as: \`memory(mode:"add", scope:"user", type:"preference", content:"...")\`

---

## Step 6 — Confirm

After saving, run \`memory(mode:"list", scope:"project")\` and show the user a brief
summary of what was stored across each category.
`;

// ── Config file helpers ─────────────────────────────────────────────────────────

/**
 * Find the existing OpenCode config file (supports .json and .jsonc).
 * Returns the path if found, null otherwise.
 */
function findOpencodeConfig(): string | null {
	const candidates = [
		join(OPENCODE_CONFIG_DIR, "opencode.jsonc"),
		join(OPENCODE_CONFIG_DIR, "opencode.json"),
	];
	for (const path of candidates) {
		if (existsSync(path)) return path;
	}
	return null;
}

/**
 * Add the plugin URI to an existing OpenCode config file.
 *
 * Parses JSONC (via Bun.JSONC.parse if available, else strips comments manually),
 * checks for duplicates, adds the plugin URI, and writes back as formatted JSON.
 *
 * @returns true if successful, false on parse/write failure.
 */
function addPluginToConfig(configPath: string, pluginUri: string): boolean {
	try {
		const raw = readFileSync(configPath, "utf-8");

		// Already registered — nothing to do
		if (raw.includes(pluginUri)) {
			fmt.success(`Plugin already registered in ${fmt.dim(configPath)}`);
			return true;
		}

		// Parse JSONC — Bun provides Bun.JSONC.parse() natively
		let config: Record<string, unknown>;
		try {
			config = Bun.JSONC.parse(raw) as Record<string, unknown>;
		} catch {
			fmt.error(`Failed to parse ${configPath}`);
			return false;
		}

		// Add plugin to array
		const plugins = (config.plugin as string[]) ?? [];
		plugins.push(pluginUri);
		config.plugin = plugins;

		writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
		fmt.success(`Registered plugin in ${fmt.dim(configPath)}`);
		return true;
	} catch (err) {
		fmt.error(`Failed to update config: ${err}`);
		return false;
	}
}

/**
 * Create a fresh OpenCode config with just the plugin URI.
 */
function createNewConfig(pluginUri: string): boolean {
	try {
		mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
		const configPath = join(OPENCODE_CONFIG_DIR, "opencode.json");
		const config = {
			"$schema": "https://opencode.ai/config.json",
			plugin: [pluginUri],
		};
		writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
		fmt.success(`Created ${fmt.dim(configPath)}`);
		return true;
	} catch (err) {
		fmt.error(`Failed to create config: ${err}`);
		return false;
	}
}

/**
 * Create the /memory-init slash command file.
 */
function createSlashCommands(): void {
	mkdirSync(OPENCODE_COMMAND_DIR, { recursive: true });
	const initPath = join(OPENCODE_COMMAND_DIR, "memory-init.md");
	writeFileSync(initPath, MEMORY_INIT_COMMAND);
	fmt.success(`Created ${fmt.cyan("/memory-init")} slash command`);
}

// ── Main ────────────────────────────────────────────────────────────────────────

export async function run(_args: ParsedArgs): Promise<void> {
	fmt.header("Install");

	// Resolve plugin root: cli.ts is at src/cli/commands/, so 3 levels up = package root.
	// At runtime (compiled), dist/cli.js is 1 level below root. We handle both.
	const scriptDir = import.meta.dirname ?? process.cwd();
	const pluginRoot = resolvePluginRoot(scriptDir);
	const pluginUri = `file://${pluginRoot}`;

	fmt.info(`Plugin path: ${fmt.blue(pluginRoot)}`);
	fmt.blank();

	// Step 1: Register in OpenCode config
	console.log(fmt.bold("  Step 1") + fmt.dim(" — Register plugin with OpenCode"));
	fmt.blank();

	const existingConfig = findOpencodeConfig();
	const configOk = existingConfig
		? addPluginToConfig(existingConfig, pluginUri)
		: createNewConfig(pluginUri);

	if (!configOk) {
		fmt.blank();
		fmt.error("Installation failed. Fix the error above and try again.");
		process.exit(1);
	}

	fmt.blank();

	// Step 2: Create slash commands
	console.log(fmt.bold("  Step 2") + fmt.dim(" — Create slash commands"));
	fmt.blank();
	createSlashCommands();

	// Step 3: Check API keys
	fmt.blank();
	console.log(fmt.bold("  Step 3") + fmt.dim(" — Verify environment"));
	fmt.blank();

	const voyageKey = process.env.VOYAGE_API_KEY;
	const anthropicKey = process.env.ANTHROPIC_API_KEY;
	const xaiKey = process.env.XAI_API_KEY;
	const googleKey = process.env.GOOGLE_API_KEY;

	if (voyageKey) {
		fmt.success(`VOYAGE_API_KEY ${fmt.dim("set (" + voyageKey.slice(0, 6) + "...)")}`);
	} else {
		fmt.warn(`VOYAGE_API_KEY ${fmt.dim("not set — required for embeddings")}`);
	}

	const hasExtraction = !!(anthropicKey || xaiKey || googleKey);
	if (anthropicKey) {
		fmt.success(`ANTHROPIC_API_KEY ${fmt.dim("set — extraction ready")}`);
	} else if (xaiKey) {
		fmt.success(`XAI_API_KEY ${fmt.dim("set — extraction ready")}`);
	} else if (googleKey) {
		fmt.success(`GOOGLE_API_KEY ${fmt.dim("set — extraction ready")}`);
	} else {
		fmt.warn("No extraction API key set — need one of: ANTHROPIC_API_KEY, XAI_API_KEY, GOOGLE_API_KEY");
	}

	// Final guidance
	fmt.blank();
	fmt.hr(60);
	fmt.blank();

	if (voyageKey && hasExtraction) {
		fmt.success(fmt.greenBold("Setup complete!"));
	} else {
		fmt.warn(fmt.yellow("Setup complete with warnings — see above."));
	}

	fmt.blank();
	console.log(fmt.bold("  Next steps:"));
	fmt.blank();

	if (!voyageKey || !hasExtraction) {
		fmt.info("Set the missing API keys in your shell environment:");
		fmt.info(`  ${fmt.dim("export VOYAGE_API_KEY=pa-...")}`);
		if (!hasExtraction) {
			fmt.info(`  ${fmt.dim("export ANTHROPIC_API_KEY=sk-ant-...")}`);
		}
		fmt.blank();
	}

	fmt.info("Restart OpenCode to activate the plugin.");
	fmt.info(`Use ${fmt.cyan("/memory-init")} in a project to seed structured memory.`);
	fmt.blank();
}

/**
 * Resolve the plugin package root from the CLI script's location.
 *
 * Handles both development (src/cli/commands/) and compiled (dist/) paths.
 */
function resolvePluginRoot(scriptDir: string): string {
	// Development: scriptDir = .../plugin-v2/src/cli/commands → go up 3 levels
	if (scriptDir.endsWith("cli/commands") || scriptDir.includes("src/cli")) {
		return join(scriptDir, "..", "..", "..");
	}
	// Compiled: scriptDir = .../plugin-v2/dist → go up 1 level
	if (scriptDir.endsWith("dist")) {
		return join(scriptDir, "..");
	}
	// Fallback: assume CWD is the plugin root
	return process.cwd();
}
