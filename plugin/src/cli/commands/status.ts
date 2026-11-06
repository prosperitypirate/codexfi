/**
 * `codexfi status` — health check for codexfi running inside Claude Code.
 *
 * Verifies (read-only — never creates files, never prints key values):
 *   - Claude Code CLI found (path + version)
 *   - LLM backend resolution (claude-cli / anthropic-api)
 *   - Embedding provider + model (and local model cache, when the embedder reports it)
 *   - Data directory, config file, vector store + memory count
 *   - Background worker (worker.lock pid alive?) and queue length
 *   - Memory Bank detection for the current directory
 *   - Claude Code has the plugin enabled (~/.claude/settings.json "enabledPlugins")
 *
 * Flags:
 *   --json   Output raw JSON instead of formatted display
 */

import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ParsedArgs } from "../args.js";
import * as fmt from "../fmt.js";
import {
	ANTHROPIC_API_KEY,
	DATA_DIR,
	EMBEDDING_PROVIDER,
	LLM_BACKEND,
	LLM_MODEL,
	VOYAGE_API_KEY,
	VOYAGE_EMBEDDING_MODEL,
} from "../../config.js";
import { getConfigPath, PLUGIN_CONFIG } from "../../plugin-config.js";
import { findClaudeBinary, resolveBackend } from "../../llm.js";
import { detectMemoryBank } from "../../services/memory-bank.js";

// ── Check types ─────────────────────────────────────────────────────────────────

interface CheckResult {
	name: string;
	status: "ok" | "warn" | "fail";
	detail: string;
}

// Only presence flags ever leave this module — never key material (not even
// derived strings), so nothing secret can reach stdout or --json output.
const HAS_ANTHROPIC_KEY: boolean = ANTHROPIC_API_KEY.length > 0;
const HAS_VOYAGE_KEY: boolean = VOYAGE_API_KEY.length > 0;
const label = (present: boolean): "set" | "unset" => (present ? "set" : "unset");

// ── Main ────────────────────────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
	const jsonOutput = args.booleans["json"] ?? false;

	const checks: CheckResult[] = [
		checkClaudeCli(),
		checkLlmBackend(),
		await checkEmbeddings(),
		checkDataDir(),
		checkConfigFile(),
		await checkStore(),
		checkWorker(),
		checkMemoryBank(),
		checkPluginEnabled(),
	];

	const failed = checks.filter((c) => c.status === "fail").length;
	const warned = checks.filter((c) => c.status === "warn").length;
	const okCount = checks.length - failed - warned;
	const verdict = failed > 0 ? "unhealthy" : warned > 0 ? "healthy-with-warnings" : "healthy";

	if (jsonOutput) {
		console.log(JSON.stringify({
			healthy: failed === 0,
			verdict,
			keysConfigured: { anthropic: HAS_ANTHROPIC_KEY, voyage: HAS_VOYAGE_KEY },
			checks,
		}, null, 2));
		return;
	}

	fmt.header("Status");
	for (const check of checks) {
		const line = `${check.name} ${fmt.dim(check.detail)}`;
		if (check.status === "ok") fmt.success(line);
		else if (check.status === "warn") fmt.warn(line);
		else fmt.error(line);
	}
	fmt.info(`API keys ${fmt.dim(`anthropic: ${label(HAS_ANTHROPIC_KEY)}, voyage: ${label(HAS_VOYAGE_KEY)} (optional)`)}`);

	fmt.blank();
	const summary = `${okCount}/${checks.length} checks passed`;
	if (failed > 0) {
		console.log(`  ${fmt.redBold(summary)} - fix errors above to proceed.`);
	} else if (warned > 0) {
		console.log(`  ${fmt.greenBold(summary)} - working, see warnings above.`);
	} else {
		console.log(`  ${fmt.greenBold(summary)} - system healthy.`);
	}
	fmt.blank();
}

// ── Individual checks ───────────────────────────────────────────────────────────

function checkClaudeCli(): CheckResult {
	const name = "Claude Code CLI";
	const bin = findClaudeBinary();
	if (!bin) {
		return { name, status: "fail", detail: "`claude` not found - install Claude Code (https://claude.com/claude-code)" };
	}
	const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "pipe"] });
	const version = r.status === 0 ? (r.stdout ?? "").trim().split("\n")[0] : "";
	if (!version) {
		return { name, status: "warn", detail: `${bin} (could not read version)` };
	}
	return { name, status: "ok", detail: `${version} - ${bin}` };
}

function checkLlmBackend(): CheckResult {
	const name = "LLM backend";
	const resolved = resolveBackend();
	const ctx = `configured: ${LLM_BACKEND}, model: ${LLM_MODEL}`;
	if (!resolved) {
		return { name, status: "fail", detail: `none available (${ctx}) - install Claude Code or set anthropicApiKey` };
	}
	if (resolved === "anthropic-api" && !ANTHROPIC_API_KEY) {
		return { name, status: "fail", detail: `anthropic-api selected but no Anthropic API key set (${ctx})` };
	}
	if (resolved === "claude-cli" && !findClaudeBinary()) {
		return { name, status: "fail", detail: `claude-cli selected but \`claude\` not found (${ctx})` };
	}
	return { name, status: "ok", detail: `${resolved} (${ctx})` };
}

/** Embedder metadata — loaded defensively so a broken embedder never breaks `status`. */
interface EmbedderInfo { provider: string; model: string; dims: number; cacheDir?: string }

async function loadEmbedderInfo(): Promise<EmbedderInfo | null> {
	try {
		const mod = (await import("../../embedder.js")) as { embedderInfo?: () => EmbedderInfo };
		return typeof mod.embedderInfo === "function" ? mod.embedderInfo() : null;
	} catch {
		return null;
	}
}

/**
 * Best-effort: transformers.js caches weights at <cacheDir>/<org>/<model>/,
 * so look for a <model> directory one level below the cache root.
 */
function isModelCached(cacheDir: string, model: string): boolean {
	try {
		return readdirSync(cacheDir).some((org) => existsSync(join(cacheDir, org, model)));
	} catch {
		return false;
	}
}

async function checkEmbeddings(): Promise<CheckResult> {
	const name = "Embeddings";
	if (EMBEDDING_PROVIDER === "voyage" && !VOYAGE_API_KEY) {
		return { name, status: "fail", detail: "provider voyage but no Voyage API key set - set voyageApiKey or use local" };
	}
	const info = await loadEmbedderInfo();
	if (!info) {
		const model = EMBEDDING_PROVIDER === "voyage" ? VOYAGE_EMBEDDING_MODEL : "model unknown";
		return { name, status: "warn", detail: `${EMBEDDING_PROVIDER} (${model}; embedder info unavailable)` };
	}
	let detail = `${info.provider} - ${info.model} (${info.dims} dims)`;
	if (info.provider === "local" && info.cacheDir) {
		detail += isModelCached(info.cacheDir, info.model)
			? `, model cached in ${info.cacheDir}`
			: ", model not downloaded yet (fetched on first use)";
	}
	return { name, status: "ok", detail };
}

function checkDataDir(): CheckResult {
	const name = "Data directory";
	try {
		if (!existsSync(DATA_DIR)) {
			return { name, status: "warn", detail: `${DATA_DIR} does not exist yet (created on first session)` };
		}
		accessSync(DATA_DIR, constants.R_OK | constants.W_OK);
		return { name, status: "ok", detail: DATA_DIR };
	} catch {
		return { name, status: "fail", detail: `${DATA_DIR} - not readable/writable` };
	}
}

function checkConfigFile(): CheckResult {
	const name = "Config file";
	const path = getConfigPath();
	return existsSync(path)
		? { name, status: "ok", detail: path }
		: { name, status: "ok", detail: "none (optional - defaults in use)" };
}

async function checkStore(): Promise<CheckResult> {
	const name = "Vector store";
	const storePath = join(DATA_DIR, "store", "store.db");
	if (!existsSync(storePath)) {
		return { name, status: "warn", detail: "not initialized yet (created on first session)" };
	}
	try {
		const { init, store } = await import("../../db.js");
		await init();
		const total = store.countRows();
		const active = store.scan({ superseded_by: "" }).length;
		return { name, status: "ok", detail: `${active} active / ${total} total memories - ${storePath}` };
	} catch (err) {
		return { name, status: "fail", detail: `cannot open ${storePath}: ${err instanceof Error ? err.message : err}` };
	}
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

function checkWorker(): CheckResult {
	const name = "Background worker";
	let pid: number | null = null;
	try {
		pid = (JSON.parse(readFileSync(join(DATA_DIR, "worker.lock"), "utf8")) as { pid?: number }).pid ?? null;
	} catch {
		// no lock file
	}
	let queued = 0;
	try {
		queued = readdirSync(join(DATA_DIR, "queue")).filter((f) => f.endsWith(".json")).length;
	} catch {
		// no queue dir yet
	}
	const running = pid !== null && isAlive(pid);
	const state = running ? `running (pid ${pid})` : "idle";
	if (!running && queued > 0) {
		return { name, status: "warn", detail: `${state}, ${queued} queued job(s) - drained on the next Claude Code hook` };
	}
	return { name, status: "ok", detail: `${state}, ${queued} queued job(s)` };
}

function checkMemoryBank(): CheckResult {
	const name = "Memory Bank";
	const bank = detectMemoryBank(process.cwd());
	if (!bank) return { name, status: "ok", detail: "none for this directory" };
	const saved = new Date(bank.lastSavedAt).toISOString().slice(0, 16).replace("T", " ");
	const mode = PLUGIN_CONFIG.memoryBank === "off" ? "memoryBank: off" : "codexfi complements it";
	return { name, status: "ok", detail: `${bank.dir} (${bank.files.length}/6 files, last saved ${saved}; ${mode})` };
}

/**
 * Best-effort: read ONLY the "enabledPlugins" key of Claude Code's user settings
 * and look for entries containing "codexfi". Nothing else from the file is used.
 */
function checkPluginEnabled(): CheckResult {
	const name = "Claude Code plugin";
	const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
	const settingsPath = join(configDir, "settings.json");
	let enabled: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as { enabledPlugins?: unknown };
		if (parsed.enabledPlugins && typeof parsed.enabledPlugins === "object") {
			enabled = parsed.enabledPlugins as Record<string, unknown>;
		}
	} catch {
		return { name, status: "warn", detail: `could not read ${settingsPath} - run 'codexfi install'` };
	}
	const entries = Object.entries(enabled).filter(([id]) => id.toLowerCase().includes("codexfi"));
	const on = entries.filter(([, v]) => v === true).map(([id]) => id);
	if (on.length > 0) return { name, status: "ok", detail: `enabled (${on.join(", ")})` };
	if (entries.length > 0) {
		return { name, status: "warn", detail: `installed but disabled - run 'claude plugin enable ${entries[0][0]}'` };
	}
	return { name, status: "warn", detail: "not enabled in user settings - run 'codexfi install'" };
}
