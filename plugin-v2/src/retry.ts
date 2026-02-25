/**
 * Retry utilities with exponential backoff and jitter.
 *
 * Used by store.ts (LanceDB write conflicts) and extractor.ts (provider fallback).
 */

export interface RetryConfig {
	/** Maximum number of retry attempts (not counting the first attempt). */
	maxRetries: number;
	/** Base delay in milliseconds. */
	baseDelayMs: number;
	/** Maximum delay cap in milliseconds. */
	maxDelayMs: number;
	/** Jitter factor (0.25 = ±25%). */
	jitter: number;
	/** Per-attempt timeout in milliseconds (optional). */
	timeoutMs?: number;
}

/** Default retry config for LanceDB write operations. */
export const DB_RETRY: RetryConfig = {
	maxRetries: 5,
	baseDelayMs: 50,
	maxDelayMs: 5_000,
	jitter: 0.25,
	timeoutMs: 5_000,
};

/** Default retry config for LanceDB search operations (longer timeout than writes). */
export const DB_SEARCH_RETRY: RetryConfig = {
	maxRetries: 3,
	baseDelayMs: 100,
	maxDelayMs: 5_000,
	jitter: 0.25,
	timeoutMs: 30_000,
};

/** Default retry config for embedding API calls. */
export const EMBED_RETRY: RetryConfig = {
	maxRetries: 3,
	baseDelayMs: 500,
	maxDelayMs: 10_000,
	jitter: 0.25,
	timeoutMs: 10_000,
};

/**
 * Default retry config for extraction LLM calls.
 *
 * No per-attempt timeoutMs — the provider functions already apply
 * AbortSignal.timeout(LLM_TIMEOUT_MS = 60_000). Adding a second timeout here
 * would silently reduce the effective timeout for longer extraction calls.
 */
export const EXTRACT_RETRY: RetryConfig = {
	maxRetries: 3,
	baseDelayMs: 500,
	maxDelayMs: 10_000,
	jitter: 0.25,
};

/**
 * Execute an async operation with exponential backoff retry.
 *
 * @param operation - The async function to execute.
 * @param label - Human-readable label for logging.
 * @param config - Retry configuration.
 * @param log - Optional log function (defaults to console.warn).
 * @returns The result of the operation.
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	label: string,
	config: RetryConfig = DB_RETRY,
	log?: (msg: string) => void,
): Promise<T> {
	const logFn = log ?? console.warn;

	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		try {
			if (config.timeoutMs) {
				return await withTimeout(operation(), config.timeoutMs, label);
			}
			return await operation();
		} catch (error) {
			if (attempt === config.maxRetries) throw error;

			const baseDelay = Math.min(
				config.baseDelayMs * Math.pow(2, attempt),
				config.maxDelayMs,
			);
			const jitterRange = baseDelay * config.jitter;
			const delay = baseDelay + (Math.random() * 2 - 1) * jitterRange;

			logFn(`${label} attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms`);
			await Bun.sleep(delay);
		}
	}

	throw new Error("unreachable");
}

/**
 * Wrap a promise with a timeout.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout>;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		clearTimeout(timeoutId!);
	}
}
