/**
 * `opencode-memory install` — register plugin with OpenCode, prompt for API keys,
 * and create slash commands.
 *
 * Steps:
 *   1. Resolve the plugin's absolute path from the CLI binary location.
 *   2. Find or create the OpenCode config (~/.config/opencode/opencode.json[c]).
 *   3. Register the plugin's file:// URI in the config's `plugin` array.
 *   4. Prompt for API keys interactively and store in ~/.config/opencode/memory.jsonc.
 *   5. Create the /memory-init slash command in ~/.config/opencode/command/.
 *   6. Print next-steps guidance.
 *
 * API key storage follows the established OpenCode ecosystem pattern (Supermemory, etc.):
 *   - Keys are stored in a plugin-specific JSONC config file (~/.config/opencode/memory.jsonc)
 *   - Environment variables always take precedence over config file values
 *   - Install command prompts interactively and writes to the config file
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import type { ParsedArgs } from "../args.js";
import { getFlag } from "../args.js";
import * as fmt from "../fmt.js";
import {
	PLUGIN_CONFIG,
	getConfigPath,
	writeApiKeys,
	type ApiKeyUpdate,
} from "../../plugin-config.js";

// ── Constants ───────────────────────────────────────────────────────────────────

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_COMMAND_DIR = join(OPENCODE_CONFIG_DIR, "command");

/** Extraction provider choices shown during install. */
const PROVIDERS = [
	{ key: "anthropic", label: "Anthropic", envVar: "ANTHROPIC_API_KEY", configKey: "anthropicApiKey" as const, hint: "sk-ant-..." },
	{ key: "xai", label: "xAI (Grok)", envVar: "XAI_API_KEY", configKey: "xaiApiKey" as const, hint: "xai-..." },
	{ key: "google", label: "Google (Gemini)", envVar: "GOOGLE_API_KEY", configKey: "googleApiKey" as const, hint: "AIza..." },
] as const;

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

// ── Interactive prompt helpers ───────────────────────────────────────────────────

/**
 * Prompt the user for a line of input. Returns empty string on EOF / non-TTY.
 */
async function ask(question: string): Promise<string> {
	if (!process.stdin.isTTY) return "";

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise<string>((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

/**
 * Mask an API key for display — show first 6 chars + last 3.
 */
function maskKey(key: string): string {
	if (key.length <= 8) return key.slice(0, 3) + "...";
	return key.slice(0, 6) + "..." + key.slice(-3);
}

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
 * Parses JSONC (strips comments, then JSON.parse), checks for duplicates, adds the plugin URI,
 * and writes back as formatted JSON.
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

		// Parse JSONC — strip comments then JSON.parse (Bun.JSONC not available in <=1.2.x)
		let config: Record<string, unknown>;
		try {
			const stripped = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
			config = JSON.parse(stripped) as Record<string, unknown>;
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

// ── API key prompting ───────────────────────────────────────────────────────────

/**
 * Resolve API keys from: CLI flags > env vars > config file > interactive prompt.
 *
 * Returns the keys to be written to the config file (only non-empty values).
 */
async function resolveApiKeys(args: ParsedArgs): Promise<ApiKeyUpdate> {
	const keys: ApiKeyUpdate = {};

	// ── Voyage API key (required) ───────────────────────────────────────────────
	const voyageFromFlag = getFlag(args, "voyage-key");
	const voyageFromEnv = process.env.VOYAGE_API_KEY;
	const voyageFromConfig = PLUGIN_CONFIG.voyageApiKey;

	let voyageKey = voyageFromFlag || voyageFromEnv || voyageFromConfig || "";

	if (voyageKey) {
		const source = voyageFromFlag ? "flag" : voyageFromEnv ? "env" : "config";
		fmt.success(`VOYAGE_API_KEY ${fmt.dim(`set (${maskKey(voyageKey)}) [${source}]`)}`);
	} else {
		fmt.warn(`VOYAGE_API_KEY ${fmt.dim("not set — required for embeddings")}`);
		fmt.blank();
		fmt.info("Get your Voyage AI key at: " + fmt.cyan("https://dash.voyageai.com/api-keys"));
		fmt.blank();
		voyageKey = await ask(`  Enter Voyage API key ${fmt.dim("(pa-...)")}: `);
		if (voyageKey) {
			fmt.success(`VOYAGE_API_KEY ${fmt.dim(`saved (${maskKey(voyageKey)})`)}`);
		} else {
			fmt.warn("Skipped — plugin will be disabled until VOYAGE_API_KEY is set.");
		}
	}
	if (voyageKey) keys.voyageApiKey = voyageKey;

	fmt.blank();

	// ── Extraction API key (at least one required) ──────────────────────────────
	// Check what's already available from any source
	const existingExtraction = resolveExistingExtraction(args);

	if (existingExtraction) {
		fmt.success(`${existingExtraction.label} API key ${fmt.dim(`set (${maskKey(existingExtraction.key)}) [${existingExtraction.source}]`)}`);
		// Store the key in config so it persists across restarts
		keys[existingExtraction.configKey] = existingExtraction.key;
	} else {
		fmt.warn("No extraction API key set — need one of: ANTHROPIC_API_KEY, XAI_API_KEY, GOOGLE_API_KEY");
		fmt.blank();

		// Ask which provider
		fmt.info("Which extraction provider would you like to use?");
		fmt.blank();
		for (let i = 0; i < PROVIDERS.length; i++) {
			const p = PROVIDERS[i];
			const defaultTag = i === 0 ? fmt.dim(" (default)") : "";
			console.log(`    ${fmt.cyan(`${i + 1}`)}. ${p.label}${defaultTag}`);
		}
		fmt.blank();

		const choice = await ask(`  Choose provider ${fmt.dim("[1-3, default 1]")}: `);
		const providerIdx = choice ? parseInt(choice, 10) - 1 : 0;
		const provider = PROVIDERS[Math.max(0, Math.min(providerIdx, PROVIDERS.length - 1))];

		fmt.blank();
		const extractionKey = await ask(`  Enter ${provider.label} API key ${fmt.dim(`(${provider.hint})`)}: `);

		if (extractionKey) {
			fmt.success(`${provider.envVar} ${fmt.dim(`saved (${maskKey(extractionKey)})`)}`);
			keys[provider.configKey] = extractionKey;
		} else {
			fmt.warn("Skipped — extraction will fail until an API key is configured.");
		}
	}

	return keys;
}

/**
 * Check all sources (flags, env, config) for an existing extraction key.
 * Returns the first one found with its metadata, or null.
 */
function resolveExistingExtraction(args: ParsedArgs): {
	label: string;
	key: string;
	source: string;
	configKey: "anthropicApiKey" | "xaiApiKey" | "googleApiKey";
} | null {
	for (const p of PROVIDERS) {
		// Flag name: anthropicApiKey → anthropic-key
		const flagName = p.key + "-key";
		const fromFlag = getFlag(args, flagName);
		if (fromFlag) return { label: p.label, key: fromFlag, source: "flag", configKey: p.configKey };

		const fromEnv = process.env[p.envVar];
		if (fromEnv) return { label: p.label, key: fromEnv, source: "env", configKey: p.configKey };

		const fromConfig = PLUGIN_CONFIG[p.configKey];
		if (fromConfig) return { label: p.label, key: fromConfig, source: "config", configKey: p.configKey };
	}
	return null;
}

// ── Main ────────────────────────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
	fmt.header("Install");

	// Resolve plugin root: cli.ts is at src/cli/commands/, so 3 levels up = package root.
	// At runtime (compiled), dist/cli.js is 1 level below root. We handle both.
	const scriptDir = import.meta.dirname ?? process.cwd();
	const pluginRoot = resolvePluginRoot(scriptDir);
	// pathToFileURL() produces correct file:///absolute/path (3 slashes for POSIX)
	const pluginUri = pathToFileURL(pluginRoot).toString();

	fmt.info(`Plugin path: ${fmt.blue(pluginRoot)}`);
	fmt.blank();

	// ── Step 1: Register in OpenCode config ─────────────────────────────────────
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

	// ── Step 2: Create slash commands ───────────────────────────────────────────
	console.log(fmt.bold("  Step 2") + fmt.dim(" — Create slash commands"));
	fmt.blank();
	createSlashCommands();

	// ── Step 3: Configure API keys ──────────────────────────────────────────────
	fmt.blank();
	console.log(fmt.bold("  Step 3") + fmt.dim(" — Configure API keys"));
	fmt.blank();

	const keys = await resolveApiKeys(args);

	// Write keys to config file if we have any
	if (Object.keys(keys).length > 0) {
		fmt.blank();
		writeApiKeys(keys);
		const configPath = getConfigPath();
		fmt.success(`API keys saved to ${fmt.dim(configPath)}`);
	}

	// ── Final guidance ──────────────────────────────────────────────────────────
	fmt.blank();
	fmt.hr(60);
	fmt.blank();

	const hasVoyage = !!(keys.voyageApiKey || process.env.VOYAGE_API_KEY || PLUGIN_CONFIG.voyageApiKey);
	const hasExtraction = !!(
		keys.anthropicApiKey || keys.xaiApiKey || keys.googleApiKey ||
		process.env.ANTHROPIC_API_KEY || process.env.XAI_API_KEY || process.env.GOOGLE_API_KEY ||
		PLUGIN_CONFIG.anthropicApiKey || PLUGIN_CONFIG.xaiApiKey || PLUGIN_CONFIG.googleApiKey
	);

	if (hasVoyage && hasExtraction) {
		fmt.success(fmt.greenBold("Setup complete!"));
	} else {
		fmt.warn(fmt.yellow("Setup complete with warnings — see above."));
	}

	fmt.blank();
	console.log(fmt.bold("  Next steps:"));
	fmt.blank();

	if (!hasVoyage || !hasExtraction) {
		fmt.info("Set missing API keys by re-running:");
		fmt.info(`  ${fmt.dim("opencode-memory install")}`);
		fmt.blank();
		fmt.info("Or set environment variables in your shell:");
		if (!hasVoyage) {
			fmt.info(`  ${fmt.dim("export VOYAGE_API_KEY=pa-...")}`);
		}
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
