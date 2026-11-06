/**
 * Loads benchmark/.env.local into process.env.
 *
 * MUST be the first import of index.ts: ES modules evaluate every static import
 * before the importing module's body, and plugin/src/config.ts reads env vars
 * (ANTHROPIC_API_KEY, CODEXFI_*) at import time. Loading .env.local inline in
 * index.ts therefore ran too late for the engine to see it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Load benchmark/.env.local regardless of CWD ────────────────────────────
// Bun only auto-loads .env from cwd. When run from project root, benchmark/.env.local
// (which has JUDGE_MODEL, ANSWERING_MODEL, ANTHROPIC_API_KEY, etc.) would be missed.
// .env.local follows standard convention: it OVERRIDES root .env values.
const __benchmarkDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const localEnvPath = join(__benchmarkDir, ".env.local");
const loadedFromLocal: Array<{ key: string; masked: string; overrode: boolean }> = [];

if (existsSync(localEnvPath)) {
	const envContent = readFileSync(localEnvPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		const hadPrevious = key in process.env && process.env[key] !== value;
		// .env.local OVERRIDES root .env — this is standard .env.local semantics
		process.env[key] = value;
		// Log presence and length only — no substrings of secrets in CI logs
		const isSecret = /key|token|secret/i.test(key);
		const masked = isSecret
			? `[${value.length} chars]`
			: (value.length <= 8 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`);
		loadedFromLocal.push({ key, masked, overrode: hadPrevious });
	}
}

// ── Verification: always log what benchmark/.env.local provided ─────────────
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

if (loadedFromLocal.length > 0) {
	console.log(`\n${CYAN}${BOLD}── benchmark/.env.local ${"─".repeat(30)}${RESET}`);
	for (const { key, masked, overrode } of loadedFromLocal) {
		const tag = overrode ? `${YELLOW}(overrode root .env)${RESET}` : `${DIM}(set)${RESET}`;
		console.log(`  ${GREEN}${key}${RESET} = ${masked} ${tag}`);
	}
	console.log();
} else {
	console.log(`${RED}WARNING: benchmark/.env.local not found or empty at ${localEnvPath}${RESET}`);
	console.log(`${RED}JUDGE_MODEL, ANSWERING_MODEL, and ANTHROPIC_API_KEY may be incorrect!${RESET}\n`);
}

export {};
