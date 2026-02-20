#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripJsoncComments } from "./services/jsonc.js";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_COMMAND_DIR = join(OPENCODE_CONFIG_DIR, "command");

const MEMORY_INIT_COMMAND = `---
description: Initialize structured project memory across all 6 categories
---

# Initializing Project Memory

You are populating persistent memory for this project. This creates the structured knowledge base that will be injected at the start of every future session — making you immediately effective without re-exploration.

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

After saving, run \`memory(mode:"list", scope:"project")\` and show the user a brief summary of what was stored across each category.
`;

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

function addPluginToConfig(configPath: string, pluginPath: string): boolean {
  try {
    const content = readFileSync(configPath, "utf-8");

    if (content.includes(pluginPath)) {
      console.log("Plugin already registered in config");
      return true;
    }

    const jsonContent = stripJsoncComments(content);
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(jsonContent);
    } catch {
      console.error("Failed to parse config file");
      return false;
    }

    const plugins = (config.plugin as string[]) || [];
    plugins.push(pluginPath);
    config.plugin = plugins;

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Added plugin to ${configPath}`);
    return true;
  } catch (err) {
    console.error("Failed to update config:", err);
    return false;
  }
}

function createNewConfig(pluginPath: string): boolean {
  mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  const configPath = join(OPENCODE_CONFIG_DIR, "opencode.json");
  writeFileSync(configPath, JSON.stringify({ plugin: [pluginPath] }, null, 2));
  console.log(`Created ${configPath}`);
  return true;
}

function createCommands(): void {
  mkdirSync(OPENCODE_COMMAND_DIR, { recursive: true });
  const initPath = join(OPENCODE_COMMAND_DIR, "memory-init.md");
  writeFileSync(initPath, MEMORY_INIT_COMMAND);
  console.log("Created /memory-init command");
}

function install(): void {
  console.log("\nopencode-memory installer\n");

  // Resolve plugin path to the package root.
  // cli.js lives in dist/, so one level up is the repo root.
  // OpenCode reads the main field from package.json — no need to reference dist/ directly.
  const repoRoot = join(import.meta.dirname ?? process.cwd(), "..");
  const pluginPath = `file://${repoRoot}`;

  console.log("Step 1: Register plugin in OpenCode config");
  const configPath = findOpencodeConfig();
  if (configPath) {
    addPluginToConfig(configPath, pluginPath);
  } else {
    createNewConfig(pluginPath);
  }

  console.log("\nStep 2: Create /memory-init command");
  createCommands();

  console.log(`
─────────────────────────────────────────────

Setup complete! Next steps:

1. Make sure both API keys are set in .env:
   XAI_API_KEY=xai-...
   VOYAGE_API_KEY=pa-...

2. Start the memory server:
   docker compose up -d

3. Restart OpenCode to activate the plugin.

─────────────────────────────────────────────
`);
}

function printHelp(): void {
  console.log(`
opencode-memory — Self-hosted persistent memory for OpenCode agents

Commands:
  install    Register plugin in OpenCode config and create /memory-init command

Usage:
  node dist/cli.js install
`);
}

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
  printHelp();
  process.exit(0);
}

if (args[0] === "install") {
  install();
} else {
  console.error(`Unknown command: ${args[0]}`);
  printHelp();
  process.exit(1);
}
