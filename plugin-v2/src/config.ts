/**
 * Central configuration — environment variables, model identifiers, pricing, and thresholds.
 * All other modules import constants from here; nothing is defined twice.
 */

// ── Input validation ────────────────────────────────────────────────────────────

/** Allowed characters for identifiers used in LanceDB where-clause interpolation. */
const SAFE_ID_RE = /^[a-zA-Z0-9_:.\-]+$/;

/**
 * Validate that `value` is a safe identifier for use in LanceDB queries.
 * Throws if the value contains characters that could break or inject into a where-clause.
 */
export function validateId(value: string, fieldName = "id"): string {
	if (!value || !SAFE_ID_RE.test(value)) {
		throw new Error(
			`Invalid ${fieldName}: must be non-empty and contain only ` +
			`alphanumeric characters, hyphens, underscores, colons, or dots`
		);
	}
	return value;
}

// ── API credentials ─────────────────────────────────────────────────────────────

export const XAI_API_KEY = process.env.XAI_API_KEY ?? "";
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? "";
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY ?? "";

/** Data directory — default follows XDG convention outside project directory. */
export const DATA_DIR = process.env.OPENCODE_MEMORY_DIR ?? `${process.env.HOME}/.opencode-memory`;

// ── Extraction provider ─────────────────────────────────────────────────────────

export type ExtractionProvider = "anthropic" | "xai" | "google";

/**
 * "anthropic" (default) — Claude Haiku 4.5 via Anthropic Messages API (most consistent)
 * "xai"                 — Grok 4.1 Fast via api.x.ai (fastest, higher variance)
 * "google"              — Gemini 3 Flash via native generateContent API
 */
export const EXTRACTION_PROVIDER: ExtractionProvider =
	(process.env.EXTRACTION_PROVIDER as ExtractionProvider) ?? "anthropic";

// ── Model identifiers ───────────────────────────────────────────────────────────

export const XAI_BASE_URL = "https://api.x.ai/v1";
export const XAI_EXTRACTION_MODEL = "grok-4-fast-non-reasoning";

export const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GOOGLE_EXTRACTION_MODEL = "gemini-3-flash-preview";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
export const ANTHROPIC_EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

const MODEL_MAP: Record<string, string> = {
	google: GOOGLE_EXTRACTION_MODEL,
	anthropic: ANTHROPIC_EXTRACTION_MODEL,
	xai: XAI_EXTRACTION_MODEL,
};
export const EXTRACTION_MODEL = MODEL_MAP[EXTRACTION_PROVIDER] ?? XAI_EXTRACTION_MODEL;

export const EMBEDDING_MODEL = "voyage-code-3";
export const EMBEDDING_DIMS = 1024;

// ── Deduplication thresholds ────────────────────────────────────────────────────

/** Cosine distance below which two memories are considered duplicates (~88% similarity). */
export const DEDUP_DISTANCE = 0.12;

/** Wider threshold for structural memories — captures evolved understanding (~75% similarity). */
export const STRUCTURAL_DEDUP_DISTANCE = 0.25;

/** Memory types that use the wider dedup threshold and never accumulate copies. */
export const STRUCTURAL_TYPES = new Set([
	"project-brief", "architecture", "tech-context", "product-context", "project-config",
]);

// ── Relational versioning ───────────────────────────────────────────────────────

/** Cosine distance for contradiction candidate detection (broader than dedup). */
export const CONTRADICTION_CANDIDATE_DISTANCE = 0.5;

/** Wider distance for structural types — captures cross-session evolution. */
export const STRUCTURAL_CONTRADICTION_DISTANCE = 0.75;

/** Max candidates sent to the contradiction-detection LLM per new memory. */
export const CONTRADICTION_CANDIDATE_LIMIT = 25;

/** Types that skip contradiction detection (have dedicated lifecycle rules). */
export const VERSIONING_SKIP_TYPES = new Set(["session-summary", "progress"]);

// ── Memory aging ────────────────────────────────────────────────────────────────

/** Max session-summary entries per project before oldest is condensed → learned-pattern. */
export const MAX_SESSION_SUMMARIES = 3;

// ── Plugin-side constants (from index.ts / auto-save.ts / compaction.ts / client.ts) ────

/** HTTP request timeout (used for external API calls). */
export const TIMEOUT_MS = 30_000;

/** Max conversation characters for extraction. */
export const MAX_CONVERSATION_CHARS = 100_000;

/** Context size threshold for compaction trigger. */
export const DEFAULT_THRESHOLD = 0.80;

/** Minimum token count before compaction considered. */
export const MIN_TOKENS = 50_000;

/** Cooldown between compactions per session (ms). */
export const COMPACTION_COOLDOWN = 30_000;

/** Default max context tokens. */
export const DEFAULT_CONTEXT_LIMIT = 200_000;

/** Cooldown between extractions per session (ms). */
export const EXTRACTION_COOLDOWN_MS = 15_000;

/** Minimum conversation length for extraction. */
export const MIN_EXCHANGE_CHARS = 100;

/** Last N messages for extraction. */
export const MAX_MESSAGES = 8;

/** Max chars read from project files for init. */
export const INIT_TOTAL_CHAR_CAP = 7_000;

/** Minimum similarity threshold for search. */
export const SIMILARITY_THRESHOLD = 0.55;

/**
 * Max chars per memory chunk.
 * Must match Python backend behavior: store the full truncated conversation
 * (up to MAX_CONTENT_CHARS = 8,000). Previous value of 400 silently discarded
 * 95% of source context, causing a 7% benchmark regression.
 */
export const CHUNK_TRUNCATION = 8_000;

/** Hash prefix length for content dedup. */
export const HASH_PREFIX_LENGTH = 16;

// ── Backend-side constants (from store.py / extractor.py / routes/memories.py) ──

/** Max input chars for extraction. */
export const MAX_CONTENT_CHARS = 8_000;

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

/** Base score for type-filtered enum results. */
export const ENUM_BASE_SCORE = 0.25;

/** Activity log ring buffer size. */
export const ACTIVITY_MAX = 200;

// ── Pricing (USD per million tokens) ────────────────────────────────────────────

export const XAI_PRICE_INPUT_PER_M = 0.20;
export const XAI_PRICE_CACHED_PER_M = 0.05;
export const XAI_PRICE_OUTPUT_PER_M = 0.50;

export const GOOGLE_PRICE_INPUT_PER_M = 0.50;
export const GOOGLE_PRICE_OUTPUT_PER_M = 3.00;

export const ANTHROPIC_PRICE_INPUT_PER_M = 1.00;
export const ANTHROPIC_PRICE_OUTPUT_PER_M = 5.00;

export const VOYAGE_PRICE_PER_M = 0.18;
