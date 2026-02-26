/**
 * Plugin-specific user configuration — loaded from ~/.config/opencode/memory.jsonc.
 *
 * API keys can be stored here as a fallback when environment variables aren't set.
 * Environment variables always take precedence over config file values.
 * The `opencode-memory install` command prompts for keys and writes them here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config", "opencode");
const CONFIG_FILES = [
	join(CONFIG_DIR, "memory.jsonc"),
	join(CONFIG_DIR, "memory.json"),
];

interface MemoryConfig {
	// ── API Keys (env vars override these) ──────────────────────────────────────
	/** Voyage AI embedding key — required for all memory operations. */
	voyageApiKey?: string;
	/** Anthropic API key — used for extraction when EXTRACTION_PROVIDER=anthropic. */
	anthropicApiKey?: string;
	/** xAI API key — used for extraction when EXTRACTION_PROVIDER=xai. */
	xaiApiKey?: string;
	/** Google API key — used for extraction when EXTRACTION_PROVIDER=google. */
	googleApiKey?: string;

	// ── Plugin Settings ─────────────────────────────────────────────────────────
	similarityThreshold?: number;
	maxMemories?: number;
	maxProjectMemories?: number;
	maxStructuredMemories?: number;
	maxProfileItems?: number;
	injectProfile?: boolean;
	containerTagPrefix?: string;
	userContainerTag?: string;
	projectContainerTag?: string;
	keywordPatterns?: string[];
	compactionThreshold?: number;
	turnSummaryInterval?: number;
}

const DEFAULT_KEYWORD_PATTERNS = [
	"remember",
	"memorize",
	"save\\s+this",
	"note\\s+this",
	"keep\\s+in\\s+mind",
	"don'?t\\s+forget",
	"learn\\s+this",
	"store\\s+this",
	"record\\s+this",
	"make\\s+a\\s+note",
	"take\\s+note",
	"jot\\s+down",
	"commit\\s+to\\s+memory",
	"remember\\s+that",
	"never\\s+forget",
	"always\\s+remember",
];

const DEFAULTS = {
	similarityThreshold: 0.45,
	maxMemories: 20,
	maxProjectMemories: 20,
	maxStructuredMemories: 30,
	maxProfileItems: 5,
	injectProfile: true,
	containerTagPrefix: "opencode",
	compactionThreshold: 0.80,
	turnSummaryInterval: 5,
} as const;

function isValidRegex(pattern: string): boolean {
	try {
		new RegExp(pattern);
		return true;
	} catch {
		return false;
	}
}

function validateCompactionThreshold(value: number | undefined): number {
	if (value === undefined || typeof value !== "number" || isNaN(value)) {
		return DEFAULTS.compactionThreshold;
	}
	if (value <= 0 || value > 1) return DEFAULTS.compactionThreshold;
	return value;
}

/**
 * Strip single-line (//) and multi-line comments from JSONC text.
 *
 * NOTE: Bun.JSONC.parse is declared in types but not available at runtime
 * in Bun <=1.2.x. We strip comments manually for reliable JSONC support.
 * This handles the common cases (line comments, block comments) but not
 * comments inside JSON string values — which is fine since our config file
 * only has comments on their own lines or after values.
 */
function stripJsoncComments(text: string): string {
	// Remove single-line comments (// ...) — only when not inside a string
	// Safe because our config never has // inside JSON string values
	return text
		.replace(/^\s*\/\/.*$/gm, "")       // full-line comments
		.replace(/\/\*[\s\S]*?\*\//g, "");   // block comments
}

function loadConfig(): MemoryConfig {
	for (const path of CONFIG_FILES) {
		try {
			// Synchronous read at module init — ESM-safe import (no require())
			const text = readFileSync(path, "utf-8");
			const stripped = stripJsoncComments(text);
			return JSON.parse(stripped) as MemoryConfig;
		} catch {
			// File doesn't exist or invalid — try next
		}
	}
	return {};
}

const fileConfig = loadConfig();

export const PLUGIN_CONFIG = {
	// API keys from config file — env vars override these in config.ts
	voyageApiKey: fileConfig.voyageApiKey ?? "",
	anthropicApiKey: fileConfig.anthropicApiKey ?? "",
	xaiApiKey: fileConfig.xaiApiKey ?? "",
	googleApiKey: fileConfig.googleApiKey ?? "",

	// Plugin settings
	similarityThreshold: fileConfig.similarityThreshold ?? DEFAULTS.similarityThreshold,
	maxMemories: fileConfig.maxMemories ?? DEFAULTS.maxMemories,
	maxProjectMemories: fileConfig.maxProjectMemories ?? DEFAULTS.maxProjectMemories,
	maxStructuredMemories: fileConfig.maxStructuredMemories ?? DEFAULTS.maxStructuredMemories,
	maxProfileItems: fileConfig.maxProfileItems ?? DEFAULTS.maxProfileItems,
	injectProfile: fileConfig.injectProfile ?? DEFAULTS.injectProfile,
	containerTagPrefix: fileConfig.containerTagPrefix ?? DEFAULTS.containerTagPrefix,
	userContainerTag: fileConfig.userContainerTag,
	projectContainerTag: fileConfig.projectContainerTag,
	keywordPatterns: [
		...DEFAULT_KEYWORD_PATTERNS,
		...(fileConfig.keywordPatterns ?? []).filter(isValidRegex),
	],
	compactionThreshold: validateCompactionThreshold(fileConfig.compactionThreshold),
	turnSummaryInterval: fileConfig.turnSummaryInterval ?? DEFAULTS.turnSummaryInterval,
};

/**
 * Check if the plugin is configured — requires VOYAGE_API_KEY for embeddings.
 *
 * Checks environment variables first (power users / CI), then falls back to
 * the config file at ~/.config/opencode/memory.jsonc (set by `install` command).
 */
export function isConfigured(): boolean {
	return !!(process.env.VOYAGE_API_KEY || PLUGIN_CONFIG.voyageApiKey);
}

// ── Config file writing (used by `install` command) ─────────────────────────────

/** Fields that `writeApiKeys()` can set in the config file. */
export interface ApiKeyUpdate {
	voyageApiKey?: string;
	anthropicApiKey?: string;
	xaiApiKey?: string;
	googleApiKey?: string;
}

/**
 * Write API keys to ~/.config/opencode/memory.jsonc.
 *
 * Reads the existing config file (if any) to preserve non-key settings,
 * merges in the new keys, and writes a well-commented JSONC file.
 * Empty string values are omitted from the output.
 */
export function writeApiKeys(keys: ApiKeyUpdate): void {
	mkdirSync(CONFIG_DIR, { recursive: true });

	// Read existing config to preserve user's other settings
	const existing = loadConfig();
	const merged: MemoryConfig = { ...existing, ...keys };

	const configPath = join(CONFIG_DIR, "memory.jsonc");
	writeFileSync(configPath, generateConfigJsonc(merged), "utf-8");
}

/**
 * Return the path to the config file that would be read.
 * Returns the first existing file, or the default .jsonc path if none exist.
 */
export function getConfigPath(): string {
	for (const path of CONFIG_FILES) {
		if (existsSync(path)) return path;
	}
	return CONFIG_FILES[0]; // default: memory.jsonc
}

/**
 * Generate a well-commented JSONC config file from a MemoryConfig object.
 *
 * Includes only non-default values for plugin settings, but always includes
 * API key fields (even if empty) so users know what's available.
 */
function generateConfigJsonc(config: MemoryConfig): string {
	const lines: string[] = [];

	lines.push("// OpenCode Memory — plugin configuration");
	lines.push("// Location: ~/.config/opencode/memory.jsonc");
	lines.push("// Docs: https://github.com/anomalyco/opencode-memory");
	lines.push("//");
	lines.push("// Environment variables (VOYAGE_API_KEY, ANTHROPIC_API_KEY, etc.)");
	lines.push("// always override values in this file.");
	lines.push("{");

	// ── API Keys section ────────────────────────────────────────────────────────
	lines.push("\t// ── API Keys ──────────────────────────────────────────────────────────");
	lines.push("");
	lines.push("\t// Required: Voyage AI embedding key (https://dash.voyageai.com/api-keys)");
	lines.push(`\t"voyageApiKey": ${jsonValue(config.voyageApiKey)},`);
	lines.push("");
	lines.push("\t// Extraction LLM key — at least one is required.");
	lines.push("\t// Default provider is Anthropic (Claude Haiku). Set EXTRACTION_PROVIDER");
	lines.push("\t// env var to switch: \"anthropic\" | \"xai\" | \"google\"");
	lines.push(`\t"anthropicApiKey": ${jsonValue(config.anthropicApiKey)},`);
	lines.push(`\t"xaiApiKey": ${jsonValue(config.xaiApiKey)},`);
	lines.push(`\t"googleApiKey": ${jsonValue(config.googleApiKey)}`);

	// ── Plugin settings (only include non-defaults) ─────────────────────────────
	const overrides = collectNonDefaults(config);
	if (overrides.length > 0) {
		// Need trailing comma on last API key line
		const lastIdx = lines.length - 1;
		if (!lines[lastIdx].endsWith(",")) {
			lines[lastIdx] += ",";
		}
		lines.push("");
		lines.push("\t// ── Plugin Settings (only non-default values shown) ─────────────────");
		for (let i = 0; i < overrides.length; i++) {
			const trailing = i < overrides.length - 1 ? "," : "";
			lines.push(`\t${overrides[i]}${trailing}`);
		}
	}

	lines.push("}");
	lines.push(""); // trailing newline

	return lines.join("\n");
}

/** JSON-encode a string value, using empty string for undefined/null. */
function jsonValue(val: string | undefined | null): string {
	return JSON.stringify(val ?? "");
}

/**
 * Collect plugin settings that differ from defaults as "key": value strings.
 * This keeps the generated config file minimal — only user-customized values.
 */
function collectNonDefaults(config: MemoryConfig): string[] {
	const result: string[] = [];

	const numericFields: Array<[keyof MemoryConfig, number]> = [
		["similarityThreshold", DEFAULTS.similarityThreshold],
		["maxMemories", DEFAULTS.maxMemories],
		["maxProjectMemories", DEFAULTS.maxProjectMemories],
		["maxStructuredMemories", DEFAULTS.maxStructuredMemories],
		["maxProfileItems", DEFAULTS.maxProfileItems],
		["compactionThreshold", DEFAULTS.compactionThreshold],
		["turnSummaryInterval", DEFAULTS.turnSummaryInterval],
	];

	for (const [key, defaultVal] of numericFields) {
		const val = config[key];
		if (val !== undefined && val !== defaultVal) {
			result.push(`"${key}": ${JSON.stringify(val)}`);
		}
	}

	if (config.injectProfile !== undefined && config.injectProfile !== DEFAULTS.injectProfile) {
		result.push(`"injectProfile": ${config.injectProfile}`);
	}
	if (config.containerTagPrefix && config.containerTagPrefix !== DEFAULTS.containerTagPrefix) {
		result.push(`"containerTagPrefix": ${JSON.stringify(config.containerTagPrefix)}`);
	}
	if (config.userContainerTag) {
		result.push(`"userContainerTag": ${JSON.stringify(config.userContainerTag)}`);
	}
	if (config.projectContainerTag) {
		result.push(`"projectContainerTag": ${JSON.stringify(config.projectContainerTag)}`);
	}
	if (config.keywordPatterns && config.keywordPatterns.length > 0) {
		result.push(`"keywordPatterns": ${JSON.stringify(config.keywordPatterns)}`);
	}

	return result;
}
