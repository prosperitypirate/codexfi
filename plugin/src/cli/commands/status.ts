/**
 * `codexfi status` — health check for the memory system.
 *
 * Verifies:
 *   - LanceDB database exists and is readable
 *   - Required API keys are set
 *   - Plugin is registered in OpenCode config
 *   - Data directory permissions
 *
 * Flags:
 *   --json   Output raw JSON instead of formatted display
 */

import { existsSync, accessSync, constants } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { ParsedArgs } from "../args.js";
import * as fmt from "../fmt.js";
import { DATA_DIR, EXTRACTION_PROVIDER, VOYAGE_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, GOOGLE_API_KEY } from "../../config.js";

// ── Check types ─────────────────────────────────────────────────────────────────

interface CheckResult {
	name: string;
	status: "ok" | "warn" | "fail";
	detail: string;
}

// ── Main ────────────────────────────────────────────────────────────────────────

export async function run(args: ParsedArgs): Promise<void> {
	const jsonOutput = args.booleans["json"] ?? false;
	const checks: CheckResult[] = [];

	// 1. Data directory
	checks.push(checkDataDir());

	// 2. LanceDB database
	checks.push(checkDatabase());

	// 3. Voyage AI key (embeddings)
	checks.push(checkVoyageKey());

	// 4. Extraction provider key
	checks.push(checkExtractionKey());

	// 5. Plugin registration
	checks.push(checkPluginRegistered());

	// 6. Log file
	checks.push(checkLogFile());

	// JSON output
	if (jsonOutput) {
		const allOk = checks.every((c) => c.status === "ok");
		console.log(JSON.stringify({ healthy: allOk, checks }, null, 2));
		return;
	}

	// Formatted output
	fmt.header("Status");

	let hasFailure = false;
	for (const check of checks) {
		switch (check.status) {
			case "ok":
				fmt.success(`${check.name} ${fmt.dim(check.detail)}`);
				break;
			case "warn":
				fmt.warn(`${check.name} ${fmt.dim(check.detail)}`);
				break;
			case "fail":
				fmt.error(`${check.name} ${fmt.dim(check.detail)}`);
				hasFailure = true;
				break;
		}
	}

	fmt.blank();
	const okCount = checks.filter((c) => c.status === "ok").length;
	const total = checks.length;

	if (hasFailure) {
		console.log(`  ${fmt.redBold(`${okCount}/${total} checks passed`)} — fix errors above to proceed.`);
	} else {
		console.log(`  ${fmt.greenBold(`${okCount}/${total} checks passed`)} — system healthy.`);
	}
	fmt.blank();
}

// ── Individual checks ───────────────────────────────────────────────────────────

function checkDataDir(): CheckResult {
	const name = "Data directory";
	try {
		if (!existsSync(DATA_DIR)) {
			return { name, status: "warn", detail: `${DATA_DIR} does not exist yet (will be created on first run)` };
		}
		accessSync(DATA_DIR, constants.R_OK | constants.W_OK);
		return { name, status: "ok", detail: DATA_DIR };
	} catch {
		return { name, status: "fail", detail: `${DATA_DIR} — not readable/writable` };
	}
}

function checkDatabase(): CheckResult {
	const name = "LanceDB database";
	const dbPath = join(DATA_DIR, "lancedb");
	try {
		if (!existsSync(dbPath)) {
			return { name, status: "warn", detail: "not initialized yet (will be created on first session)" };
		}
		// Check for the memories.lance directory (table data)
		const tablePath = join(dbPath, "memories.lance");
		if (existsSync(tablePath)) {
			return { name, status: "ok", detail: dbPath };
		}
		return { name, status: "warn", detail: "database exists but no memories table found" };
	} catch {
		return { name, status: "fail", detail: "unable to check database" };
	}
}

function checkVoyageKey(): CheckResult {
	const name = "Voyage API key";
	if (VOYAGE_API_KEY) {
		return { name, status: "ok", detail: `set (${VOYAGE_API_KEY.slice(0, 6)}...)` };
	}
	return { name, status: "fail", detail: "VOYAGE_API_KEY not set — required for embeddings" };
}

function checkExtractionKey(): CheckResult {
	const name = "Extraction API key";
	const provider = EXTRACTION_PROVIDER;

	const keyMap: Record<string, string> = {
		anthropic: ANTHROPIC_API_KEY,
		xai: XAI_API_KEY,
		google: GOOGLE_API_KEY,
	};

	const key = keyMap[provider];
	if (key) {
		return { name, status: "ok", detail: `${provider} (${key.slice(0, 6)}...)` };
	}

	// Check if any key is set even if not for the configured provider
	const anyKey = Object.entries(keyMap).find(([, v]) => !!v);
	if (anyKey) {
		return {
			name,
			status: "warn",
			detail: `EXTRACTION_PROVIDER=${provider} but key missing — ${anyKey[0]} key is available`,
		};
	}

	return { name, status: "fail", detail: "no extraction API key set" };
}

function checkPluginRegistered(): CheckResult {
	const name = "OpenCode plugin";
	const configDir = join(homedir(), ".config", "opencode");

	try {
		const candidates = ["opencode.jsonc", "opencode.json"];
		for (const filename of candidates) {
			const configPath = join(configDir, filename);
			if (!existsSync(configPath)) continue;

			const raw = readFileSync(configPath, "utf-8");
			const stripped = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
			const config = JSON.parse(stripped) as Record<string, unknown>;
			const plugins = (config.plugin as string[]) ?? [];

			// Check if any plugin entry looks like it points to this package
			const hasMemory = plugins.some(
				(p) => p.includes("codexfi") || p.includes("opencode-memory") || p.includes("plugin-v2"),
			);

			if (hasMemory) {
				return { name, status: "ok", detail: `registered in ${filename}` };
			}

			return { name, status: "warn", detail: `${filename} exists but plugin not registered — run 'install'` };
		}

		return { name, status: "warn", detail: "no OpenCode config found — run 'install'" };
	} catch {
		return { name, status: "warn", detail: "unable to read OpenCode config" };
	}
}

function checkLogFile(): CheckResult {
	const name = "Log file";
	const logPath = join(homedir(), ".codexfi.log");

	if (existsSync(logPath)) {
		return { name, status: "ok", detail: logPath };
	}
	return { name, status: "warn", detail: "not created yet (appears after first session)" };
}
