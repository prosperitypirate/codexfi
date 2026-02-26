#!/usr/bin/env bun
/**
 * CLI entry point — `codexfi <command> [options]`.
 *
 * Zero-dependency command router. Parses args, dispatches to the appropriate
 * command module, and handles top-level errors with formatted output.
 *
 * Commands:
 *   install              Register plugin with OpenCode + create slash commands
 *   list                 Display stored memories in a formatted table
 *   search <query>       Semantic search over memories (requires VOYAGE_API_KEY)
 *   stats                Database statistics, type distribution, API costs
 *   status               Health check — verify DB, API keys, plugin registration
 *   export               Export memories to JSON or CSV
 *   forget <id>          Delete a memory by ID (or short prefix)
 *   dashboard            Launch the on-demand web dashboard
 *   help                 Show this help message
 *
 * Global flags:
 *   --json               Output machine-readable JSON instead of formatted text
 *   --no-tui             Skip interactive prompts (for LLM agent-driven installs)
 *   --help, -h           Show help for the current command
 *   --version            Print version and exit
 */

// Load .env before any config imports — config.ts reads VOYAGE_API_KEY etc. at module level.
// Bun auto-loads .env from CWD, but the CLI may run from a different directory.
// Walk up from CWD to find the nearest .env file.
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

function loadEnvFile(): void {
	let dir = process.cwd();
	// Walk up from CWD to filesystem root, looking for .env
	for (let i = 0; i < 20; i++) {
		const envPath = resolve(dir, ".env");
		if (existsSync(envPath)) {
			try {
				const text = require("node:fs").readFileSync(envPath, "utf-8") as string;
				for (const line of text.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith("#")) continue;
					const eq = trimmed.indexOf("=");
					if (eq === -1) continue;
					const key = trimmed.slice(0, eq).trim();
					const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
					if (!process.env[key]) process.env[key] = val;
				}
			} catch { /* non-fatal */ }
			break;
		}
		const parent = dirname(dir);
		if (parent === dir) break; // reached filesystem root
		dir = parent;
	}
}
loadEnvFile();

import { parseArgs } from "./args.js";
import * as fmt from "./fmt.js";

// ── Version ─────────────────────────────────────────────────────────────────────

const VERSION = "0.3.0";

// ── Command registry ────────────────────────────────────────────────────────────

/**
 * Lazy command imports — each command module is loaded only when invoked.
 * This keeps startup fast for simple commands like --version and --help.
 */
const COMMANDS: Record<string, {
	description: string;
	usage: string;
	load: () => Promise<{ run: (args: import("./args.js").ParsedArgs) => Promise<void> }>;
}> = {
	install: {
		description: "Register plugin with OpenCode and create /memory-init command",
		usage: "codexfi install [--no-tui] [--voyage-key <key>] [--anthropic-key <key>]",
		load: () => import("./commands/install.js"),
	},
	list: {
		description: "Display stored memories in a formatted table",
		usage: "codexfi list [--project <dir>] [--user] [--type <type>] [--limit N] [--all] [--json]",
		load: () => import("./commands/list.js"),
	},
	search: {
		description: "Semantic search over memories",
		usage: "codexfi search <query> [--project <dir>] [--user] [--limit N] [--json]",
		load: () => import("./commands/search.js"),
	},
	stats: {
		description: "Database statistics, type distribution, API costs",
		usage: "codexfi stats [--json]",
		load: () => import("./commands/stats.js"),
	},
	status: {
		description: "Health check — verify DB, API keys, plugin registration",
		usage: "codexfi status [--json]",
		load: () => import("./commands/status.js"),
	},
	export: {
		description: "Export memories to JSON or CSV",
		usage: "codexfi export [--project <dir>] [--user] [--format json|csv] [--all] [--output <file>]",
		load: () => import("./commands/export.js"),
	},
	forget: {
		description: "Delete a memory by ID",
		usage: "codexfi forget <id>",
		load: () => import("./commands/forget.js"),
	},
	dashboard: {
		description: "Launch the web dashboard (Ctrl+C to stop)",
		usage: "codexfi dashboard [--port <N>] [--no-open]",
		load: () => import("./commands/dashboard.js"),
	},
};

// ── Help text ───────────────────────────────────────────────────────────────────

function printHelp(): void {
	fmt.banner(VERSION);
	fmt.blank();
	console.log(fmt.bold("  Commands:"));
	fmt.blank();

	// Calculate padding for alignment
	const maxCmd = Math.max(...Object.keys(COMMANDS).map((k) => k.length));

	for (const [name, cmd] of Object.entries(COMMANDS)) {
		const padded = name.padEnd(maxCmd + 2);
		console.log(`    ${fmt.cyan(padded)} ${fmt.dim(cmd.description)}`);
	}

	fmt.blank();
	console.log(fmt.bold("  Global flags:"));
	fmt.blank();
	console.log(`    ${fmt.cyan("--json".padEnd(maxCmd + 2))} ${fmt.dim("Machine-readable JSON output")}`);
	console.log(`    ${fmt.cyan("--no-tui".padEnd(maxCmd + 2))} ${fmt.dim("Skip interactive prompts (for LLM agents)")}`);
	console.log(`    ${fmt.cyan("--help, -h".padEnd(maxCmd + 2))} ${fmt.dim("Show help for a command")}`);
	console.log(`    ${fmt.cyan("--version".padEnd(maxCmd + 2))} ${fmt.dim("Print version and exit")}`);

	fmt.blank();
	console.log(fmt.bold("  Examples:"));
	fmt.blank();
	console.log(`    ${fmt.dim("$")} codexfi install`);
	console.log(`    ${fmt.dim("$")} codexfi install --no-tui`);
	console.log(`    ${fmt.dim("$")} codexfi list --type architecture`);
	console.log(`    ${fmt.dim("$")} codexfi search "how is auth handled"`);
	console.log(`    ${fmt.dim("$")} codexfi stats`);
	console.log(`    ${fmt.dim("$")} codexfi export --format csv --output backup.csv`);
	fmt.blank();
}

function printCommandHelp(name: string): void {
	const cmd = COMMANDS[name];
	if (!cmd) return;

	fmt.banner(VERSION);
	fmt.blank();
	console.log(`  ${fmt.cyanBold(name)} — ${cmd.description}`);
	fmt.blank();
	console.log(`  ${fmt.bold("Usage:")} ${fmt.dim(cmd.usage)}`);
	fmt.blank();
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs();

	// --version flag
	if (args.booleans["version"]) {
		console.log(VERSION);
		process.exit(0);
	}

	// No command or help requested at top level
	if (!args.command || args.command === "help") {
		printHelp();
		process.exit(0);
	}

	// Look up command
	const cmd = COMMANDS[args.command];
	if (!cmd) {
		fmt.error(`Unknown command: "${args.command}"`);
		fmt.blank();
		fmt.info(`Run ${fmt.cyan("codexfi help")} to see available commands.`);
		fmt.blank();
		process.exit(1);
	}

	// Per-command help
	if (args.booleans["help"]) {
		printCommandHelp(args.command);
		process.exit(0);
	}

	// Load and execute the command
	try {
		const mod = await cmd.load();
		await mod.run(args);
	} catch (err) {
		fmt.blank();
		fmt.error(`Command "${args.command}" failed:`);
		fmt.blank();

		if (err instanceof Error) {
			console.error(`  ${fmt.red(err.message)}`);
			if (err.stack && process.env.DEBUG) {
				fmt.blank();
				console.error(fmt.dim(err.stack));
			}
		} else {
			console.error(`  ${fmt.red(String(err))}`);
		}

		fmt.blank();
		process.exit(1);
	}
}

main();
