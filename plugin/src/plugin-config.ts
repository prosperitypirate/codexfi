/**
 * Plugin-specific user configuration — loaded from ~/.codexfi/codexfi.jsonc.
 *
 * API keys are stored in codexfi.jsonc only — environment variables are NOT read
 * by the plugin at runtime. The `codexfi install` command prompts for keys and
 * writes them here.
 *
 * History: config was previously at ~/.config/opencode/codexfi.jsonc, but
 * OpenCode app deletes unrecognized files from that directory (#155).
 * Moved to ~/.codexfi/ which is already used for the SQLite store.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".codexfi");
const CONFIG_FILE = join(CONFIG_DIR, "codexfi.jsonc");

interface MemoryConfig {
	// ── API Keys (stored in config file only) ─────────────────────────────────────
	/** Voyage AI embedding key — required for all memory operations. */
	voyageApiKey?: string;
	/** Anthropic API key — used for extraction when extractionProvider is "anthropic". */
	anthropicApiKey?: string;
	/** xAI API key — used for extraction when extractionProvider is "xai". */
	xaiApiKey?: string;
	/** Google API key — used for extraction when extractionProvider is "google". */
	googleApiKey?: string;

	// ── Extraction Provider ──────────────────────────────────────────────────────
	/** Primary extraction provider: "anthropic" | "xai" | "google". Default: "anthropic". */
	extractionProvider?: "anthropic" | "xai" | "google";

	// ── Plugin Settings ─────────────────────────────────────────────────────────
	/** Minimum similarity for LanceDB retrieval (controls search depth). Default: 0.45. */
	similarityThreshold?: number;
	/**
	 * Minimum similarity to *display* in the ## Relevant to Current Task section.
	 * Separate from similarityThreshold (retrieval depth) — this is a display-only filter.
	 * Raise to reduce noise; lower to show more results. Default: 0.60.
	 */
	displaySimilarityThreshold?: number;
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

/**
 * Default extraction provider — single source of truth.
 * Imported by config.ts for runtime resolution and used here for JSONC generation.
 * Defined in plugin-config.ts (not config.ts) to avoid circular imports.
 */
export const DEFAULT_EXTRACTION_PROVIDER = "anthropic" as const;

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
	displaySimilarityThreshold: 0.60,
	maxMemories: 20,
	maxProjectMemories: 20,
	// Raised from 30 → 50: active-context and architecture-pattern need budget room.
	// Zero LanceDB scan performance impact (scan already reads up to 10K rows).
	maxStructuredMemories: 50,
	// Raised from 5 → 8: User Preferences section was too sparse.
	maxProfileItems: 8,
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
	try {
		const text = readFileSync(CONFIG_FILE, "utf-8");
		const stripped = stripJsoncComments(text);
		return JSON.parse(stripped) as MemoryConfig;
	} catch {
		// File doesn't exist or invalid
		return {};
	}
}

const fileConfig = loadConfig();

export const PLUGIN_CONFIG = {
	// API keys from config file only — no env var fallback
	voyageApiKey: fileConfig.voyageApiKey ?? "",
	anthropicApiKey: fileConfig.anthropicApiKey ?? "",
	xaiApiKey: fileConfig.xaiApiKey ?? "",
	googleApiKey: fileConfig.googleApiKey ?? "",

	// Extraction provider
	extractionProvider: fileConfig.extractionProvider,

	// Plugin settings
	similarityThreshold: fileConfig.similarityThreshold ?? DEFAULTS.similarityThreshold,
	displaySimilarityThreshold: fileConfig.displaySimilarityThreshold ?? DEFAULTS.displaySimilarityThreshold,
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
 * Returns true if the plugin has the minimum configuration to operate.
 *
 * Checks for voyageApiKey in ~/.codexfi/codexfi.jsonc only.
 * Environment variables are not read for API keys — use `codexfi install`
 * to store keys in the config file.
 */
export function isConfigured(): boolean {
	return !!PLUGIN_CONFIG.voyageApiKey;
}

// ── Config file writing (used by `install` command) ─────────────────────────────

/** Fields that `writeApiKeys()` can set in the config file. */
export interface ApiKeyUpdate {
	voyageApiKey?: string;
	anthropicApiKey?: string;
	xaiApiKey?: string;
	googleApiKey?: string;
	extractionProvider?: "anthropic" | "xai" | "google";
}

/**
 * Write API keys to ~/.codexfi/codexfi.jsonc.
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

	writeFileSync(CONFIG_FILE, generateConfigJsonc(merged), "utf-8");
}

/**
 * Return the path to the config file.
 * Always returns ~/.codexfi/codexfi.jsonc.
 */
export function getConfigPath(): string {
	return CONFIG_FILE;
}

/**
 * Generate a well-commented JSONC config file from a MemoryConfig object.
 *
 * Includes only non-default values for plugin settings, but always includes
 * API key fields (even if empty) so users know what's available.
 */
function generateConfigJsonc(config: MemoryConfig): string {
	const lines: string[] = [];

	lines.push("// Codexfi - plugin configuration");
	lines.push("// Location: ~/.codexfi/codexfi.jsonc");
	lines.push("// Docs: https://github.com/prosperitypirate/codexfi");
	lines.push("{");

	// ── API Keys section ────────────────────────────────────────────────────────
	lines.push("\t// -- API Keys ------------------------------------------------------------------");
	lines.push("");
	lines.push("\t// Required: Voyage AI embedding key (https://dash.voyageai.com/api-keys)");
	lines.push(`\t"voyageApiKey": ${jsonValue(config.voyageApiKey)},`);
	lines.push("");
	lines.push("\t// Extraction LLM key - at least one is required.");
	lines.push("\t// Provider is set via extractionProvider below (default: \"anthropic\").");
	lines.push(`\t"anthropicApiKey": ${jsonValue(config.anthropicApiKey)},`);
	lines.push(`\t"xaiApiKey": ${jsonValue(config.xaiApiKey)},`);
	lines.push(`\t"googleApiKey": ${jsonValue(config.googleApiKey)},`);
	lines.push("");
	lines.push("\t// -- Extraction Provider -----------------------------------------------------");
	lines.push("\t// Which LLM provider to use for memory extraction.");
	lines.push("\t// Options: \"anthropic\" (Claude Haiku) | \"xai\" (Grok) | \"google\" (Gemini)");
	lines.push(`\t"extractionProvider": ${jsonValue(config.extractionProvider ?? DEFAULT_EXTRACTION_PROVIDER)}`);

	// ── Plugin settings (only include non-defaults) ─────────────────────────────
	const overrides = collectNonDefaults(config);
	if (overrides.length > 0) {
		// Need trailing comma on last API key line
		const lastIdx = lines.length - 1;
		if (!lines[lastIdx].endsWith(",")) {
			lines[lastIdx] += ",";
		}
		lines.push("");
		lines.push("\t// -- Plugin Settings (only non-default values shown) -------------------");
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
		["displaySimilarityThreshold", DEFAULTS.displaySimilarityThreshold],
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
