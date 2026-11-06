/**
 * Central configuration — environment variables, model identifiers, pricing, and thresholds.
 * All other modules import constants from here; nothing is defined twice.
 */

import { homedir } from "node:os";

// ── Input validation ────────────────────────────────────────────────────────────

/** Allowed characters for identifiers used in vector store where-clause interpolation. */
const SAFE_ID_RE = /^[a-zA-Z0-9_:.\-]+$/;

/**
 * Validate and sanitize `value` for safe use in filter expressions.
 *
 * ARCHITECTURE NOTE: The vector store uses string interpolation for filter
 * expressions. This function provides two layers of defense:
 *
 * 1. **Allowlist regex**: Only permits alphanumeric, hyphens, underscores, colons, dots.
 *    This blocks all SQL/filter injection characters (quotes, semicolons, parens, etc.)
 * 2. **Single-quote escaping**: Defense-in-depth — escapes any `'` to `''` (SQL-standard
 *    escape) in case the regex is ever relaxed or bypassed.
 *
 * All filter calls in store.ts MUST use `validateId()` on every interpolated
 * value. See store.ts lines 51, 91, 110, 166, 229, 273, 327, 414, 536, 581.
 *
 * @throws Error if value is empty or contains disallowed characters.
 */
export function validateId(value: string, fieldName = "id"): string {
	if (!value || !SAFE_ID_RE.test(value)) {
		throw new Error(
			`Invalid ${fieldName}: must be non-empty and contain only ` +
			`alphanumeric characters, hyphens, underscores, colons, or dots`
		);
	}
	// Defense-in-depth: escape single quotes even though regex blocks them.
	// Prevents injection if regex is ever relaxed in a future change.
	return value.replace(/'/g, "''");
}

// ── API credentials ─────────────────────────────────────────────────────────────
// codexfi needs NO API keys by default: LLM work runs through the user's own
// Claude Code login (`claude -p`) and embeddings run locally. Keys are optional:
//   anthropicApiKey — use the Anthropic Messages API directly instead of the CLI
//   voyageApiKey    — use Voyage AI `voyage-code-3` embeddings instead of local
// Keys come from ~/.codexfi/codexfi.jsonc first, then the standard env vars.

import { PLUGIN_CONFIG } from "./plugin-config.js";

export const ANTHROPIC_API_KEY = PLUGIN_CONFIG.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
export const VOYAGE_API_KEY = PLUGIN_CONFIG.voyageApiKey || process.env.VOYAGE_API_KEY || "";

/** Data directory — default follows XDG convention outside project directory. */
export const DATA_DIR = process.env.CODEXFI_DATA_DIR ?? process.env.OPENCODE_MEMORY_DIR ?? `${homedir()}/.codexfi`;

// ── LLM backend (extraction, contradiction detection, summaries) ────────────────

/**
 * "auto"          — claude CLI if installed (uses the Claude Code login), else API key.
 * "claude-cli"    — always `claude -p` (subscription or whatever Claude Code uses).
 * "anthropic-api" — always the Messages API with anthropicApiKey.
 */
export type LlmBackend = "auto" | "claude-cli" | "anthropic-api";

const VALID_BACKENDS = new Set<string>(["auto", "claude-cli", "anthropic-api"]);

function pickBackend(): LlmBackend {
	const env = process.env.CODEXFI_LLM_BACKEND;
	if (env && VALID_BACKENDS.has(env)) return env as LlmBackend;
	const cfg = PLUGIN_CONFIG.llmBackend;
	if (cfg && VALID_BACKENDS.has(cfg)) return cfg;
	return "auto";
}

export const LLM_BACKEND: LlmBackend = pickBackend();

/**
 * Model used for all background LLM work. CLI aliases ("haiku", "sonnet") resolve
 * to the newest model of that tier the user's Claude Code offers; full ids work too.
 */
export const LLM_MODEL: string = process.env.CODEXFI_LLM_MODEL ?? PLUGIN_CONFIG.llmModel ?? "haiku";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

// ── Embeddings ──────────────────────────────────────────────────────────────────

export type EmbeddingProvider = "local" | "voyage";

export const EMBEDDING_PROVIDER: EmbeddingProvider =
	(process.env.CODEXFI_EMBEDDING_PROVIDER as EmbeddingProvider | undefined) === "voyage" ||
	(PLUGIN_CONFIG.embeddingProvider === "voyage" && process.env.CODEXFI_EMBEDDING_PROVIDER !== "local")
		? "voyage"
		: "local";

export const VOYAGE_EMBEDDING_MODEL = "voyage-code-3";
export const VOYAGE_EMBEDDING_DIMS = 1024;

// ── Deduplication thresholds ────────────────────────────────────────────────────

/** Cosine distance below which two memories are considered duplicates (~88% similarity). */
export const DEDUP_DISTANCE = 0.12;

/** Wider threshold for structural memories — captures evolved understanding (~75% similarity). */
export const STRUCTURAL_DEDUP_DISTANCE = 0.25;

/** Memory types that use the wider dedup threshold and never accumulate copies. */
export const STRUCTURAL_TYPES = new Set([
	"project-brief", "architecture", "architecture-pattern", "tech-context", "product-context", "project-config",
]);

// ── Relational versioning ───────────────────────────────────────────────────────

/** Cosine distance for contradiction candidate detection (broader than dedup). */
export const CONTRADICTION_CANDIDATE_DISTANCE = 0.5;

/** Wider distance for structural types — captures cross-session evolution. */
export const STRUCTURAL_CONTRADICTION_DISTANCE = 0.75;

/** Max candidates sent to the contradiction-detection LLM per new memory. */
export const CONTRADICTION_CANDIDATE_LIMIT = 25;

/** Types that skip contradiction detection (have dedicated lifecycle rules). */
export const VERSIONING_SKIP_TYPES = new Set(["session-summary", "progress", "active-context"]);

// ── Memory aging ────────────────────────────────────────────────────────────────

/** Max session-summary entries per project before oldest is condensed → learned-pattern. */
export const MAX_SESSION_SUMMARIES = 3;

// ── Plugin constants ────────────────────────────────────────────────────────────

/** HTTP request timeout (used for external API calls). */
export const TIMEOUT_MS = 30_000;

/** Minimum conversation length for extraction. */
export const MIN_EXCHANGE_CHARS = 100;

/** Minimum similarity threshold for search. */
export const SIMILARITY_THRESHOLD = 0.55;

/**
 * Max chars per memory chunk — stores the full truncated conversation context
 * attached to each memory (up to MAX_CONTENT_CHARS = 8,000). The answering LLM
 * uses these chunks for detail queries. Display truncation for the [MEMORY] block
 * is separate (context.ts:126).
 */
export const CHUNK_TRUNCATION = 8_000;

/** Hash prefix length for content dedup. */
export const HASH_PREFIX_LENGTH = 16;

// ── Store & extraction constants ────────────────────────────────────────────────

/**
 * Max input chars per extraction call. Longer turns are split into windows of
 * this size on message boundaries (claude/transcript.ts) instead of truncated.
 */
export const MAX_CONTENT_CHARS = 12_000;

/** Max input chars for summary extraction. */
export const MAX_SUMMARY_CHARS = 4_000;

/** Max output tokens for LLM calls. */
export const LLM_MAX_TOKENS = 2_000;

/** LLM temperature (deterministic). */
export const LLM_TEMPERATURE = 0;

/** LLM API call timeout (ms). */
export const LLM_TIMEOUT_MS = 60_000;

/** Recency weight decay factor (per day). */
export const RECENCY_DECAY = 0.1;

/** Activity log ring buffer size. */
export const ACTIVITY_MAX = 200;

// ── Pricing (USD per million tokens) ────────────────────────────────────────────
// Only used to show a notional cost for anthropic-api / voyage calls. claude-cli
// calls report Claude Code's own notional cost (subscription users are not billed).

export const ANTHROPIC_PRICE_INPUT_PER_M = 1.00;
export const ANTHROPIC_PRICE_OUTPUT_PER_M = 5.00;

export const VOYAGE_PRICE_PER_M = 0.18;
