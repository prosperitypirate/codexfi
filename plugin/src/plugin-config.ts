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
	// ── Optional API keys (codexfi needs none by default) ────────────────────────
	/** Anthropic API key — only used when llmBackend is "anthropic-api" (or "auto" without Claude Code). */
	anthropicApiKey?: string;
	/** Voyage AI key — only used when embeddingProvider is "voyage". */
	voyageApiKey?: string;

	// ── Backends ─────────────────────────────────────────────────────────────────
	/** "auto" (default) | "claude-cli" | "anthropic-api". */
	llmBackend?: "auto" | "claude-cli" | "anthropic-api";
	/** Model for background extraction. Default "haiku" (CLI alias → newest Haiku). */
	llmModel?: string;
	/** "local" (default, on-device, no key) | "voyage". */
	embeddingProvider?: "local" | "voyage";
	/** Local embedding model: "jina-v2-base-code" (default) | "all-MiniLM-L6-v2" (lightweight). */
	localModel?: string;

	// ── Behaviour ────────────────────────────────────────────────────────────────
	/**
	 * Memory Bank coexistence: "auto" (default) — when <project>/memory-bank/ exists,
	 * skip the structured sections the bank already covers and inject only
	 * per-turn relevant memories + recent sessions. "off" — always inject everything.
	 */
	memoryBank?: "auto" | "off";
	/** Seed memory from README/package.json/git log on a project's first session. Default true. */
	autoInit?: boolean;
	/** Absolute directory prefixes where codexfi stays completely silent (privacy). */
	excludePaths?: string[];

	// ── Retrieval / rendering ────────────────────────────────────────────────────
	/** Minimum similarity for retrieval (controls search depth). Default: model-specific. */
	similarityThreshold?: number;
	/**
	 * Minimum similarity to *display* in the ## Relevant to Current Task section.
	 * Separate from similarityThreshold (retrieval depth) — this is a display-only filter.
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
	maxMemories: 20,
	maxProjectMemories: 20,
	// Raised from 30 → 50 → 100: the structural fetch is now scoped to only
	// rendered types (RENDERED_STRUCTURAL_TYPES, see services/context.ts) so
	// this no longer needs to double as a global anti-starvation cap — 100
	// gives comfortable headroom over PER_TYPE_CAPS' ~56 theoretical max so
	// per-type caps are the binding constraint, not this pre-fetch limit.
	// See issue #201. Zero LanceDB scan performance impact (scan already
	// reads up to 10K rows).
	maxStructuredMemories: 100,
	// Raised from 5 → 8: User Preferences section was too sparse.
	maxProfileItems: 8,
	injectProfile: true,
	// Legacy prefix kept on purpose: every memory stored since v0.1 is keyed
	// "opencode_project_<hash>" / "opencode_user_<hash>". Changing it would orphan
	// existing stores. It is an internal key, never shown to the model.
	containerTagPrefix: "opencode",
	memoryBank: "auto",
	autoInit: true,
} as const;

function isValidRegex(pattern: string): boolean {
	try {
		new RegExp(pattern);
		return true;
	} catch {
		return false;
	}
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
	// Optional keys (env fallbacks are resolved in config.ts)
	voyageApiKey: fileConfig.voyageApiKey ?? "",
	anthropicApiKey: fileConfig.anthropicApiKey ?? "",

	// Backends
	llmBackend: fileConfig.llmBackend,
	llmModel: fileConfig.llmModel,
	embeddingProvider: fileConfig.embeddingProvider,
	localModel: fileConfig.localModel,

	// Behaviour
	memoryBank: fileConfig.memoryBank === "off" ? "off" as const : DEFAULTS.memoryBank,
	autoInit: fileConfig.autoInit ?? DEFAULTS.autoInit,
	excludePaths: (fileConfig.excludePaths ?? []).filter((p) => typeof p === "string" && p.length > 0),

	// Retrieval / rendering
	// Model-specific defaults live in embedder.ts (activeThresholds); these are overrides.
	similarityThreshold: fileConfig.similarityThreshold,
	displaySimilarityThreshold: fileConfig.displaySimilarityThreshold,
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
};

/**
 * codexfi works with zero configuration — LLM via Claude Code, embeddings local.
 * Kept for callers that gate on configuration; always true now.
 */
export function isConfigured(): boolean {
	return true;
}

// ── Config file writing (used by `install` command) ─────────────────────────────

/** Fields that `writeApiKeys()` can set in the config file. */
export interface ApiKeyUpdate {
	voyageApiKey?: string;
	anthropicApiKey?: string;
	llmBackend?: "auto" | "claude-cli" | "anthropic-api";
	embeddingProvider?: "local" | "voyage";
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

	// ── Backends + optional keys ─────────────────────────────────────────────────
	lines.push("\t// -- Backends -------------------------------------------------------------------");
	lines.push("\t// codexfi needs no API keys: background LLM work runs through your Claude Code");
	lines.push("\t// login (claude -p) and embeddings run on-device.");
	lines.push("\t// llmBackend: \"auto\" | \"claude-cli\" | \"anthropic-api\"");
	lines.push(`\t"llmBackend": ${jsonValue(config.llmBackend ?? "auto")},`);
	lines.push("\t// embeddingProvider: \"local\" | \"voyage\"");
	lines.push(`\t"embeddingProvider": ${jsonValue(config.embeddingProvider ?? "local")},`);
	lines.push("");
	lines.push("\t// Optional: only needed for llmBackend \"anthropic-api\" / embeddingProvider \"voyage\"");
	lines.push(`\t"anthropicApiKey": ${jsonValue(config.anthropicApiKey)},`);
	lines.push(`\t"voyageApiKey": ${jsonValue(config.voyageApiKey)}`);

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
		["maxMemories", DEFAULTS.maxMemories],
		["maxProjectMemories", DEFAULTS.maxProjectMemories],
		["maxStructuredMemories", DEFAULTS.maxStructuredMemories],
		["maxProfileItems", DEFAULTS.maxProfileItems],
	];

	for (const key of ["similarityThreshold", "displaySimilarityThreshold"] as const) {
		if (typeof config[key] === "number") result.push(`"${key}": ${JSON.stringify(config[key])}`);
	}
	if (config.localModel) result.push(`"localModel": ${JSON.stringify(config.localModel)}`);

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
	if (config.llmModel) {
		result.push(`"llmModel": ${JSON.stringify(config.llmModel)}`);
	}
	if (config.memoryBank === "off") {
		result.push(`"memoryBank": "off"`);
	}
	if (config.autoInit === false) {
		result.push(`"autoInit": false`);
	}
	if (config.excludePaths && config.excludePaths.length > 0) {
		result.push(`"excludePaths": ${JSON.stringify(config.excludePaths)}`);
	}
	if (config.keywordPatterns && config.keywordPatterns.length > 0) {
		result.push(`"keywordPatterns": ${JSON.stringify(config.keywordPatterns)}`);
	}

	return result;
}
