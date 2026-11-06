/**
 * `codexfi install` — install the codexfi plugin into Claude Code.
 *
 * codexfi is zero-config: the LLM runs through the user's own Claude Code login
 * and embeddings run on-device, so no API keys are prompted for. Install is:
 *
 *   1. claude plugin marketplace add prosperitypirate/codexfi   (skipped if present)
 *   2. claude plugin install codexfi@codexfi                     (skipped if installed)
 *
 * Flags:
 *   --dry-run                  Print what would happen, change nothing
 *   --uninstall                Print the uninstall commands (runs nothing)
 *   --source <repo|path>       Marketplace source (default: prosperitypirate/codexfi)
 *   --anthropic-key <key>      Optional — store an Anthropic API key in codexfi.jsonc
 *   --voyage-key <key>         Optional — store a Voyage AI key in codexfi.jsonc
 *   --llm-backend <b>          auto | claude-cli | anthropic-api
 *   --embedding-provider <p>   local | voyage
 *   --no-tui                   Accepted for agent-driven installs (install never prompts)
 */

import { spawnSync } from "node:child_process";

import type { ParsedArgs } from "../args.js";
import { getFlag } from "../args.js";
import * as fmt from "../fmt.js";
import { findClaudeBinary } from "../../llm.js";
import { getConfigPath, writeApiKeys, type ApiKeyUpdate } from "../../plugin-config.js";

const DEFAULT_SOURCE = "prosperitypirate/codexfi";
const MARKETPLACE = "codexfi";
const PLUGIN_ID = "codexfi@codexfi";

const LLM_BACKENDS = ["auto", "claude-cli", "anthropic-api"] as const;
const EMBEDDING_PROVIDERS = ["local", "voyage"] as const;

// ── claude CLI helpers ──────────────────────────────────────────────────────────

interface RunResult { ok: boolean; out: string }

/** Run `claude <args>` non-interactively (stdin closed) and capture its output. */
function claude(bin: string, args: string[], timeoutMs = 120_000): RunResult {
	const r = spawnSync(bin, args, { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
	return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

/** Parse a `--json` listing; returns [] when the command fails or prints non-JSON. */
function listJson(bin: string, args: string[]): Array<Record<string, unknown>> {
	const r = claude(bin, args, 30_000);
	if (!r.ok) return [];
	try {
		const parsed = JSON.parse(r.out);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function printOutput(out: string): void {
	for (const line of out.split("\n").filter(Boolean)) console.log(`      ${fmt.dim(line)}`);
}

// ── Config flags ────────────────────────────────────────────────────────────────

/** Collect optional config overrides from flags. Exits on an invalid enum value. */
function configFromFlags(args: ParsedArgs): ApiKeyUpdate {
	const update: ApiKeyUpdate = {};
	const anthropic = getFlag(args, "anthropic-key");
	const voyage = getFlag(args, "voyage-key");
	const backend = getFlag(args, "llm-backend");
	const provider = getFlag(args, "embedding-provider");

	if (anthropic) update.anthropicApiKey = anthropic;
	if (voyage) update.voyageApiKey = voyage;
	if (backend !== undefined) {
		if (!(LLM_BACKENDS as readonly string[]).includes(backend)) {
			fmt.error(`Invalid --llm-backend "${backend}" - expected one of: ${LLM_BACKENDS.join(", ")}`);
			process.exit(1);
		}
		update.llmBackend = backend as ApiKeyUpdate["llmBackend"];
	}
	if (provider !== undefined) {
		if (!(EMBEDDING_PROVIDERS as readonly string[]).includes(provider)) {
			fmt.error(`Invalid --embedding-provider "${provider}" - expected one of: ${EMBEDDING_PROVIDERS.join(", ")}`);
			process.exit(1);
		}
		update.embeddingProvider = provider as ApiKeyUpdate["embeddingProvider"];
	}
	return update;
}

/** Describe a config update without ever printing key values. */
function describeUpdate(u: ApiKeyUpdate): string[] {
	const out: string[] = [];
	if (u.anthropicApiKey) out.push("anthropicApiKey = (set)");
	if (u.voyageApiKey) out.push("voyageApiKey = (set)");
	if (u.llmBackend) out.push(`llmBackend = ${u.llmBackend}`);
	if (u.embeddingProvider) out.push(`embeddingProvider = ${u.embeddingProvider}`);
	return out;
}

// ── Uninstall guidance ──────────────────────────────────────────────────────────

function printUninstall(): void {
	fmt.header("Uninstall");
	fmt.info("Run these commands (codexfi does not run them for you):");
	fmt.blank();
	console.log(`    ${fmt.cyan(`claude plugin uninstall ${PLUGIN_ID}`)}`);
	console.log(`    ${fmt.cyan(`claude plugin marketplace remove ${MARKETPLACE}`)}`);
	fmt.blank();
	fmt.info(`Optional - delete all stored memories and usage data: ${fmt.dim("rm -rf ~/.codexfi")}`);
	fmt.blank();
}

// ── Main ────────────────────────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
	if (args.booleans["uninstall"]) return printUninstall();

	const dryRun = args.booleans["dry-run"] ?? false;
	const source = getFlag(args, "source") ?? DEFAULT_SOURCE;
	const update = configFromFlags(args);

	fmt.header(dryRun ? "Install (dry run)" : "Install");

	// ── Claude Code ──────────────────────────────────────────────────────────────
	const bin = findClaudeBinary();
	if (!bin) {
		fmt.error("Claude Code CLI (`claude`) not found on PATH.");
		fmt.info(`Install Claude Code first: ${fmt.cyan("https://claude.com/claude-code")}`);
		fmt.info(`Or point codexfi at it: ${fmt.dim("CODEXFI_CLAUDE_BIN=/path/to/claude codexfi install")}`);
		fmt.blank();
		if (!dryRun) process.exit(1);
	} else {
		fmt.success(`Claude Code CLI ${fmt.dim(bin)}`);
	}

	const hasMarketplace = !!bin && listJson(bin, ["plugin", "marketplace", "list", "--json"])
		.some((m) => m.name === MARKETPLACE);
	const hasPlugin = !!bin && listJson(bin, ["plugin", "list", "--json"])
		.some((p) => p.id === PLUGIN_ID);

	// ── Plan ─────────────────────────────────────────────────────────────────────
	const steps: Array<{ label: string; args: string[]; skip: string | null }> = [
		{
			label: "Add the codexfi marketplace",
			args: ["plugin", "marketplace", "add", source],
			skip: hasMarketplace ? "already added" : null,
		},
		{
			label: "Install the codexfi plugin",
			args: ["plugin", "install", PLUGIN_ID],
			skip: hasPlugin ? `already installed (update with: claude plugin update ${PLUGIN_ID})` : null,
		},
	];
	const changes = describeUpdate(update);

	fmt.blank();
	console.log(fmt.bold(dryRun ? "  Would do:" : "  Plan:"));
	for (const s of steps) {
		const cmd = `claude ${s.args.join(" ")}`;
		console.log(`    ${s.skip ? fmt.dim(`${cmd}  # skip - ${s.skip}`) : fmt.cyan(cmd)}`);
	}
	if (changes.length > 0) {
		console.log(`    ${fmt.cyan(`write ${getConfigPath()}`)} ${fmt.dim(`(${changes.join(", ")})`)}`);
	}
	fmt.blank();

	if (dryRun) {
		fmt.info("Dry run - nothing was changed.");
		fmt.blank();
		return;
	}

	// ── Execute ──────────────────────────────────────────────────────────────────
	for (const s of steps) {
		if (s.skip) {
			fmt.success(`${s.label} ${fmt.dim(`(${s.skip})`)}`);
			continue;
		}
		const r = claude(bin!, s.args);
		if (!r.ok) {
			fmt.error(`${s.label} failed: claude ${s.args.join(" ")}`);
			printOutput(r.out);
			fmt.blank();
			process.exit(1);
		}
		fmt.success(s.label);
	}

	if (changes.length > 0) {
		writeApiKeys(update);
		fmt.success(`Config saved to ${fmt.dim(getConfigPath())} ${fmt.dim(`(${changes.join(", ")})`)}`);
	}

	// ── Next steps ───────────────────────────────────────────────────────────────
	fmt.blank();
	fmt.hr(60);
	fmt.success(fmt.greenBold("codexfi is installed."));
	fmt.blank();
	fmt.info("Restart Claude Code (or start a new session) to activate the plugin.");
	fmt.info("No API keys needed - extraction uses your Claude Code login, embeddings run locally.");
	fmt.info(`Verify with ${fmt.cyan("codexfi status")}; uninstall help: ${fmt.cyan("codexfi install --uninstall")}`);
	fmt.blank();
}
