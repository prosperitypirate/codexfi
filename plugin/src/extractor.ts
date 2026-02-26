/**
 * Multi-provider extraction layer — LLM calls, JSON parsing, and memory extraction logic.
 *
 * Supports xAI (Grok), Google (Gemini), and Anthropic (Claude) as extraction providers.
 * All callers use callLlm() which dispatches to the active provider with fallback.
 */

import {
	ANTHROPIC_API_KEY,
	ANTHROPIC_BASE_URL,
	ANTHROPIC_EXTRACTION_MODEL,
	ANTHROPIC_PRICE_INPUT_PER_M,
	ANTHROPIC_PRICE_OUTPUT_PER_M,
	EXTRACTION_PROVIDER,
	GOOGLE_API_KEY,
	GOOGLE_BASE_URL,
	GOOGLE_EXTRACTION_MODEL,
	GOOGLE_PRICE_INPUT_PER_M,
	GOOGLE_PRICE_OUTPUT_PER_M,
	LLM_MAX_TOKENS,
	LLM_TEMPERATURE,
	LLM_TIMEOUT_MS,
	MAX_CONTENT_CHARS,
	MAX_SUMMARY_CHARS,
	XAI_API_KEY,
	XAI_BASE_URL,
	XAI_EXTRACTION_MODEL,
	XAI_PRICE_CACHED_PER_M,
	XAI_PRICE_INPUT_PER_M,
	XAI_PRICE_OUTPUT_PER_M,
	type ExtractionProvider,
} from "./config.js";
import {
	CONDENSE_SYSTEM,
	CONDENSE_USER,
	CONTRADICTION_SYSTEM,
	CONTRADICTION_USER,
	EXTRACTION_SYSTEM,
	EXTRACTION_USER,
	INIT_EXTRACTION_SYSTEM,
	INIT_EXTRACTION_USER,
	SUMMARY_SYSTEM,
	SUMMARY_USER,
} from "./prompts.js";
import { withRetry, EXTRACT_RETRY } from "./retry.js";
import { ledger, activityLog } from "./telemetry.js";
import type { ExtractedFact, ExtractionMode, Message } from "./types.js";

// ── Provider-specific callers ───────────────────────────────────────────────────

async function callXai(system: string, user: string): Promise<string> {
	if (!XAI_API_KEY) {
		throw new Error("XAI_API_KEY is not set");
	}

	const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${XAI_API_KEY}`,
			"Content-Type": "application/json",
		},
		signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
		body: JSON.stringify({
			model: XAI_EXTRACTION_MODEL,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
			max_tokens: LLM_MAX_TOKENS,
			temperature: LLM_TEMPERATURE,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`xAI API error ${response.status}: ${body}`);
	}

	const data = await response.json();

	// Extract content
	let raw = "";
	try {
		raw = data.choices?.[0]?.message?.content ?? "";
	} catch {
		console.warn("xai call: unexpected response structure");
	}

	// Record telemetry
	try {
		const usage = data.usage ?? {};
		const promptTokens = usage.prompt_tokens ?? 0;
		const completionTokens = usage.completion_tokens ?? 0;
		const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
		const cost =
			(promptTokens - cachedTokens) * XAI_PRICE_INPUT_PER_M / 1_000_000 +
			cachedTokens * XAI_PRICE_CACHED_PER_M / 1_000_000 +
			completionTokens * XAI_PRICE_OUTPUT_PER_M / 1_000_000;
		await ledger.recordXai(promptTokens, cachedTokens, completionTokens);
		activityLog.recordXai(promptTokens, cachedTokens, completionTokens, cost);
	} catch {
		// Telemetry failure should never block extraction
	}

	return raw.trim();
}

async function callGoogle(system: string, user: string): Promise<string> {
	if (!GOOGLE_API_KEY) {
		throw new Error("GOOGLE_API_KEY is not set");
	}

	const response = await fetch(
		`${GOOGLE_BASE_URL}/models/${GOOGLE_EXTRACTION_MODEL}:generateContent`,
		{
			method: "POST",
			headers: {
				"x-goog-api-key": GOOGLE_API_KEY,
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
			body: JSON.stringify({
				system_instruction: {
					parts: [{ text: system }],
				},
				contents: [
					{
						parts: [{ text: user }],
					},
				],
				generationConfig: {
					temperature: LLM_TEMPERATURE,
					maxOutputTokens: LLM_MAX_TOKENS,
					responseMimeType: "application/json",
				},
			}),
		},
	);

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Google API error ${response.status}: ${body}`);
	}

	const data = await response.json();

	// Extract content — native API: candidates[0].content.parts[0].text
	let raw = "";
	try {
		raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
	} catch {
		console.warn("google call: unexpected response structure");
	}

	// Record telemetry
	try {
		const usage = data.usageMetadata ?? {};
		const promptTokens = usage.promptTokenCount ?? 0;
		const completionTokens = usage.candidatesTokenCount ?? 0;
		const cost =
			promptTokens * GOOGLE_PRICE_INPUT_PER_M / 1_000_000 +
			completionTokens * GOOGLE_PRICE_OUTPUT_PER_M / 1_000_000;
		await ledger.recordGoogle(promptTokens, completionTokens);
		activityLog.recordGoogle(promptTokens, completionTokens, cost);
	} catch {
		// Telemetry failure should never block extraction
	}

	return raw.trim();
}

async function callAnthropic(system: string, user: string): Promise<string> {
	if (!ANTHROPIC_API_KEY) {
		throw new Error("ANTHROPIC_API_KEY is not set");
	}

	const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
		method: "POST",
		headers: {
			"x-api-key": ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
			"Content-Type": "application/json",
		},
		signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
		body: JSON.stringify({
			model: ANTHROPIC_EXTRACTION_MODEL,
			max_tokens: LLM_MAX_TOKENS,
			temperature: LLM_TEMPERATURE,
			system,
			messages: [{ role: "user", content: user }],
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Anthropic API error ${response.status}: ${body}`);
	}

	const data = await response.json();

	// Extract content — content[0].text
	let raw = "";
	try {
		raw = data.content?.[0]?.text ?? "";
	} catch {
		console.warn("anthropic call: unexpected response structure");
	}

	// Record telemetry
	try {
		const usage = data.usage ?? {};
		const promptTokens = usage.input_tokens ?? 0;
		const completionTokens = usage.output_tokens ?? 0;
		const cost =
			promptTokens * ANTHROPIC_PRICE_INPUT_PER_M / 1_000_000 +
			completionTokens * ANTHROPIC_PRICE_OUTPUT_PER_M / 1_000_000;
		await ledger.recordAnthropic(promptTokens, completionTokens);
		activityLog.recordAnthropic(promptTokens, completionTokens, cost);
	} catch {
		// Telemetry failure should never block extraction
	}

	return raw.trim();
}

// ── Provider dispatcher with fallback ───────────────────────────────────────────

const PROVIDER_FALLBACK_ORDER: ExtractionProvider[] = ["anthropic", "xai", "google"];

const PROVIDER_FN: Record<ExtractionProvider, (s: string, u: string) => Promise<string>> = {
	anthropic: callAnthropic,
	xai: callXai,
	google: callGoogle,
};

/**
 * Route to the configured extraction provider with automatic fallback.
 * Tries the primary provider first, then falls back through remaining providers.
 *
 * @returns Raw LLM response text (string). All callers MUST pass the result through
 *   `parseJsonArray()` to get typed facts. On total failure, returns the string `"[]"`
 *   which `parseJsonArray()` safely parses to an empty array — zero memories extracted
 *   for this turn, but the system continues without error.
 *
 * Silent degradation rationale: extraction failure should never block the user's
 * coding session. The next turn will retry automatically.
 */
export async function callLlm(system: string, user: string): Promise<string> {
	const primary = EXTRACTION_PROVIDER;
	const fallbackOrder = [primary, ...PROVIDER_FALLBACK_ORDER.filter(p => p !== primary)];

	for (const provider of fallbackOrder) {
		try {
			return await withRetry(
				() => PROVIDER_FN[provider](system, user),
				`LLM ${provider}`,
				EXTRACT_RETRY,
			);
		} catch (error) {
			console.warn(
				`Provider ${provider} failed after retries: ${error instanceof Error ? error.message : error}`,
			);
			// Try next provider
		}
	}

	// All providers exhausted — return valid JSON array string so parseJsonArray()
	// returns [] rather than throwing. This is intentionally a string, not an array,
	// because callLlm's contract returns raw LLM text for parseJsonArray() to process.
	console.error("All extraction providers failed — skipping extraction for this turn");
	return "[]";
}

// ── JSON parsing ────────────────────────────────────────────────────────────────

/**
 * Parse a JSON array from raw LLM response, stripping markdown fences.
 */
export function parseJsonArray(raw: string): Array<{ memory: string; type: string }> {
	if (!raw) return [];

	let cleaned = raw;

	// Strip ```json ... ``` fences
	if (cleaned.startsWith("```")) {
		const parts = cleaned.split("```");
		cleaned = parts[1] ?? cleaned;
		if (cleaned.startsWith("json")) {
			cleaned = cleaned.slice(4);
		}
		cleaned = cleaned.trim();
	}

	try {
		const extracted = JSON.parse(cleaned);

		if (Array.isArray(extracted)) {
			const result: Array<{ memory: string; type: string }> = [];
			for (const item of extracted) {
				if (typeof item === "string") {
					result.push({ memory: item.trim(), type: "learned-pattern" });
				} else if (typeof item === "object" && item?.memory) {
					result.push({
						memory: String(item.memory).trim(),
						type: String(item.type ?? "learned-pattern"),
					});
				}
			}
			return result.filter(r => r.memory);
		}

		// Model returned {"memories": [...]} — unwrap
		if (typeof extracted === "object" && extracted !== null) {
			for (const v of Object.values(extracted)) {
				if (Array.isArray(v)) {
					return parseJsonArray(JSON.stringify(v));
				}
			}
		}

		return [];
	} catch {
		console.warn("Failed to parse JSON array:", raw.slice(0, 200));
		return [];
	}
}

// ── Memory extraction ───────────────────────────────────────────────────────────

/**
 * Call the configured LLM provider to extract typed memory facts from messages.
 *
 * @param messages - Conversation messages to extract from.
 * @param mode - "normal" (default), "summary", or "init".
 */
export async function extractMemories(
	messages: Message[],
	mode: ExtractionMode = "normal",
): Promise<ExtractedFact[]> {
	const lines: string[] = [];
	for (const m of messages) {
		const role = m.role ?? "user";
		const content = m.content;
		if (typeof content === "string") {
			lines.push(`[${role}] ${content}`);
		} else if (Array.isArray(content)) {
			for (const part of content) {
				if (typeof part === "object" && part.type === "text") {
					lines.push(`[${role}] ${part.text ?? ""}`);
				}
			}
		}
	}

	const conversation = lines.join("\n");
	if (!conversation.trim()) return [];

	const truncated = conversation.slice(0, MAX_CONTENT_CHARS);

	let raw: string;
	switch (mode) {
		case "init":
			raw = await callLlm(INIT_EXTRACTION_SYSTEM, INIT_EXTRACTION_USER.replace("{content}", truncated));
			break;
		case "summary":
			raw = await callLlm(SUMMARY_SYSTEM, SUMMARY_USER.replace("{conversation}", truncated));
			break;
		default:
			raw = await callLlm(EXTRACTION_SYSTEM, EXTRACTION_USER.replace("{conversation}", truncated));
			break;
	}

	const facts = parseJsonArray(raw);

	// Attach raw source text for hybrid search
	return facts.map(f => ({
		...f,
		chunk: truncated,
	}));
}

// ── Contradiction detection ─────────────────────────────────────────────────────

/**
 * Ask the LLM which candidate IDs are superseded by `newMemory`.
 * Returns a (possibly empty) list of memory IDs to mark as superseded.
 */
export async function detectContradictions(
	newMemory: string,
	candidates: Array<{ id: string; memory: string }>,
): Promise<string[]> {
	if (candidates.length === 0) return [];

	try {
		const candidatesText = candidates
			.map(c => `- ID: ${c.id} | ${c.memory}`)
			.join("\n");

		const raw = await callLlm(
			CONTRADICTION_SYSTEM,
			CONTRADICTION_USER
				.replace("{new_memory}", newMemory)
				.replace("{candidates}", candidatesText),
		);

		if (!raw) return [];

		// Strip markdown fences
		let stripped = raw.trim();
		if (stripped.startsWith("```")) {
			const parts = stripped.split("```");
			stripped = parts[1] ?? stripped;
			if (stripped.startsWith("json")) {
				stripped = stripped.slice(4);
			}
			stripped = stripped.trim();
		}

		const parsed = JSON.parse(stripped);
		if (Array.isArray(parsed)) {
			return parsed.filter((item): item is string => typeof item === "string" && item !== "");
		}
		return [];
	} catch (error) {
		console.warn("detectContradictions failed:", error);
		return [];
	}
}

// ── Condensation ────────────────────────────────────────────────────────────────

/**
 * Condense an old session-summary into a compact learned-pattern memory.
 */
export async function condenseToLearnedPattern(
	summaryText: string,
): Promise<{ memory: string; type: string } | null> {
	try {
		const raw = await callLlm(
			CONDENSE_SYSTEM,
			CONDENSE_USER.replace("{summary}", summaryText.slice(0, MAX_SUMMARY_CHARS)),
		);
		const items = parseJsonArray(raw);
		return items.length > 0 ? items[0] : null;
	} catch (error) {
		console.warn("condenseToLearnedPattern failed:", error);
		return null;
	}
}
