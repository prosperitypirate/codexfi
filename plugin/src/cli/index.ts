#!/usr/bin/env bun
/**
 * CLI entry point — `codexfi <command> [options]`.
 *
 * Zero-dependency command router. Parses args, dispatches to the appropriate
 * command module, and handles top-level errors with formatted output.
 *
 * Commands:
 *   install              Install the plugin into Claude Code (marketplace + plugin)
 *   list                 Display stored memories in a formatted table
 *   search <query>       Semantic search over memories
 *   stats                Database statistics, type distribution, usage & costs
 *   status               Health check — Claude Code, LLM backend, embeddings, store, worker
 *   export               Export memories to JSON or CSV
 *   forget <id>          Delete a memory by ID (or short prefix)
 *   dashboard            Launch the on-demand web dashboard
 *   help                 Show this help message
 *
 * Internal entrypoints (invoked by the Claude Code plugin, not by people):
 *   hook <event>         Claude Code hook handler (reads hook JSON on stdin)
 *   worker               Background extraction worker (drains ~/.codexfi/queue)
 *   mcp                  MCP stdio server (memory_search / add / list / forget)
 *
 * Global flags:
 *   --json               Output machine-readable JSON instead of formatted text
 *   --no-tui             Never prompt (accepted for agent-driven installs)
 *   --help, -h           Show help for the current command
 *   --version            Print version and exit
 */

import { parseArgs } from "./args.js";
import * as fmt from "./fmt.js";
import pkg from "../../package.json";

// ── Version ─────────────────────────────────────────────────────────────────────

const VERSION = pkg.version;

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
		description: "Install the codexfi plugin into Claude Code",
		usage: "codexfi install [--dry-run] [--uninstall] [--source <repo|path>] [--llm-backend auto|claude-cli|anthropic-api] [--embedding-provider local|voyage] [--anthropic-key <k>] [--voyage-key <k>]",
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
		description: "Database statistics, type distribution, usage & costs",
		usage: "codexfi stats [--json]",
		load: () => import("./commands/stats.js"),
	},
	status: {
		description: "Health check - Claude Code, LLM backend, embeddings, store, worker",
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
	console.log(`    ${fmt.cyan("--no-tui".padEnd(maxCmd + 2))} ${fmt.dim("Never prompt (install is non-interactive anyway)")}`);
	console.log(`    ${fmt.cyan("--help, -h".padEnd(maxCmd + 2))} ${fmt.dim("Show help for a command")}`);
	console.log(`    ${fmt.cyan("--version".padEnd(maxCmd + 2))} ${fmt.dim("Print version and exit")}`);

	fmt.blank();
	console.log(fmt.bold("  Examples:"));
	fmt.blank();
	console.log(`    ${fmt.dim("$")} codexfi install            ${fmt.dim("# add the plugin to Claude Code (no API keys needed)")}`);
	console.log(`    ${fmt.dim("$")} codexfi install --dry-run  ${fmt.dim("# show what install would do")}`);
	console.log(`    ${fmt.dim("$")} codexfi status`);
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
	console.log(`  ${fmt.cyanBold(name)} - ${cmd.description}`);
	fmt.blank();
	console.log(`  ${fmt.bold("Usage:")} ${fmt.dim(cmd.usage)}`);
	fmt.blank();
}

// ── Main ────────────────────────────────────────────────────────────────────────

/**
 * Fast path for the plugin's internal entrypoints — no banner, no arg parsing,
 * stdout reserved for the protocol (hook JSON / MCP JSON-RPC).
 */
async function runInternal(cmd: string, rest: string[]): Promise<boolean> {
	switch (cmd) {
		case "hook": {
			const { runHook } = await import("../claude/hooks.js");
			await runHook((rest[0] ?? "") as import("../claude/hooks.js").HookEvent);
			return true;
		}
		case "worker": {
			const { runWorker } = await import("../claude/worker.js");
			await runWorker();
			return true;
		}
		case "mcp": {
			const { runMcpServer } = await import("../claude/mcp.js");
			await runMcpServer();
			return true;
		}
		default:
			return false;
	}
}

async function main(): Promise<void> {
	const [internalCmd, ...rest] = process.argv.slice(2);
	// Internal entrypoints end by letting the event loop drain (process.exit()
	// could truncate a pending stdout write to a pipe on macOS).
	if (internalCmd && (await runInternal(internalCmd, rest).catch(() => true))) return;

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
