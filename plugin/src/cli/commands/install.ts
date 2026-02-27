/**
 * `codexfi install` — register plugin with OpenCode, prompt for API keys,
 * and create slash commands.
 *
 * Steps:
 *   1. Register the npm package name "codexfi" in the OpenCode config.
 *   2. Migrate any stale file:// entries from previous installs.
 *   3. Prompt for API keys interactively and store in ~/.config/opencode/codexfi.jsonc.
 *   4. Create the /memory-init slash command in ~/.config/opencode/command/.
 *   5. Print next-steps guidance.
 *
 * OpenCode auto-installs npm plugins at startup and caches them in
 * ~/.cache/opencode/node_modules/. This means users always get the
 * latest version without manual updates.
 *
 * API key storage follows the established OpenCode ecosystem pattern:
 *   - Keys are stored in a plugin-specific JSONC config file (~/.config/opencode/codexfi.jsonc)
 *   - Environment variables always take precedence over config file values
 *   - Install command prompts interactively and writes to the config file
 *
 * Flags:
 *   --no-tui             Skip all interactive prompts (for LLM agent-driven installs)
 *   --voyage-key <key>   Set Voyage API key directly
 *   --anthropic-key <key> Set Anthropic API key directly
 *   --xai-key <key>      Set xAI API key directly
 *   --google-key <key>   Set Google API key directly
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";

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

/** Whether interactive prompts are suppressed (--no-tui or non-TTY). */
let noTui = false;

/**
 * Prompt the user for a line of input. Returns empty string on EOF / non-TTY / --no-tui.
 */
async function ask(question: string): Promise<string> {
	if (noTui || !process.stdin.isTTY) return "";

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
 * Add the plugin npm package name to an existing OpenCode config file.
 *
 * Also migrates any stale file:// entries from previous installs
 * (e.g. bunx temp paths) to the npm package name.
 *
 * @returns true if successful, false on parse/write failure.
 */
function addPluginToConfig(configPath: string, packageName: string): boolean {
	try {
		const raw = readFileSync(configPath, "utf-8");

		// Parse JSONC — strip comments then JSON.parse (Bun.JSONC not available in <=1.2.x)
		let config: Record<string, unknown>;
		try {
			const stripped = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
			config = JSON.parse(stripped) as Record<string, unknown>;
		} catch {
			fmt.error(`Failed to parse ${configPath}`);
			return false;
		}

		let plugins = (config.plugin as string[]) ?? [];
		let migrated = false;

		// Remove stale file:// entries pointing to codexfi (bunx temp paths, old installs)
		const staleEntries = plugins.filter(
			(p) => p.startsWith("file://") && p.includes("codexfi"),
		);
		if (staleEntries.length > 0) {
			plugins = plugins.filter((p) => !staleEntries.includes(p));
			migrated = true;
			for (const entry of staleEntries) {
				fmt.info(`Migrated stale entry: ${fmt.dim(entry)}`);
			}
		}

		// Already registered — nothing to do (after migration cleanup)
		if (plugins.includes(packageName)) {
			config.plugin = plugins;
			if (migrated) {
				writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
				fmt.success(`Migrated to npm package name in ${fmt.dim(configPath)}`);
			} else {
				fmt.success(`Plugin already registered in ${fmt.dim(configPath)}`);
			}
			return true;
		}

		// Add npm package name
		plugins.push(packageName);
		config.plugin = plugins;

		writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
		if (migrated) {
			fmt.success(`Migrated and registered plugin in ${fmt.dim(configPath)}`);
		} else {
			fmt.success(`Registered plugin in ${fmt.dim(configPath)}`);
		}
		return true;
	} catch (err) {
		fmt.error(`Failed to update config: ${err}`);
		return false;
	}
}

/**
 * Create a fresh OpenCode config with just the plugin npm package name.
 */
function createNewConfig(packageName: string): boolean {
	try {
		mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
		const configPath = join(OPENCODE_CONFIG_DIR, "opencode.json");
		const config = {
			"$schema": "https://opencode.ai/config.json",
			plugin: [packageName],
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

	// ── Extraction API keys (at least one required) ─────────────────────────────
	// Walk all 3 providers sequentially. For each:
	//   - If a key is already found (flag/env/config): show masked value and ask to keep or replace
	//   - If no key found: prompt for one, or Enter to skip
	// After all 3: if zero keys collected, error out.

	let extractionKeysCollected = 0;

	for (const p of PROVIDERS) {
		const flagName = p.key + "-key";
		const fromFlag = getFlag(args, flagName);
		const fromEnv = process.env[p.envVar];
		const fromConfig = PLUGIN_CONFIG[p.configKey];
		const existing = fromFlag || fromEnv || fromConfig || "";
		const source = fromFlag ? "flag" : fromEnv ? "env" : fromConfig ? "config" : "";

		fmt.blank();

		if (existing) {
			// Key already found — show it and ask to keep or replace
			console.log(`  ${p.label} API key found: ${fmt.cyan(maskKey(existing))} ${fmt.dim(`[${source}]`)}`);
			const keep = await ask(`  Keep this? ${fmt.dim("[Y/n]")}: `);

			if (!keep || keep.toLowerCase() === "y" || keep.toLowerCase() === "yes") {
				keys[p.configKey] = existing;
				extractionKeysCollected++;
				fmt.success(`${p.label} API key saved`);
			} else {
				// User wants to replace it
				const replacement = await ask(`  Enter new ${p.label} API key ${fmt.dim(`(${p.hint}, or Enter to skip)`)}: `);
				if (replacement) {
					keys[p.configKey] = replacement;
					extractionKeysCollected++;
					fmt.success(`${p.label} API key saved ${fmt.dim(`(${maskKey(replacement)})`)}`);
				} else {
					fmt.warn(`${p.label} skipped.`);
				}
			}
		} else {
			// No key found — prompt for one
			const entered = await ask(`  ${p.label} API key ${fmt.dim(`(${p.hint}, or Enter to skip)`)}: `);
			if (entered) {
				keys[p.configKey] = entered;
				extractionKeysCollected++;
				fmt.success(`${p.label} API key saved ${fmt.dim(`(${maskKey(entered)})`)}`);
			} else {
				fmt.warn(`${p.label} skipped.`);
			}
		}
	}

	fmt.blank();

	if (extractionKeysCollected === 0) {
		fmt.error("No extraction API key configured — at least one of Anthropic, xAI, or Google is required.");
		fmt.info("Re-run `codexfi install` and provide at least one key.");
		process.exit(1);
	}

	return keys;
}

// ── Main ────────────────────────────────────────────────────────────────────────

/** The npm package name used to register with OpenCode. */
const NPM_PACKAGE_NAME = "codexfi";

export async function run(args: ParsedArgs): Promise<void> {
	// --no-tui: suppress all interactive prompts (for LLM agent-driven installs)
	noTui = args.booleans["tui"] === false;

	fmt.header("Install");

	// ── Step 1: Register in OpenCode config ─────────────────────────────────────
	console.log(fmt.bold("  Step 1") + fmt.dim(" — Register plugin with OpenCode"));
	fmt.blank();

	const existingConfig = findOpencodeConfig();
	const configOk = existingConfig
		? addPluginToConfig(existingConfig, NPM_PACKAGE_NAME)
		: createNewConfig(NPM_PACKAGE_NAME);

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
		fmt.info(`  ${fmt.dim("codexfi install")}`);
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


