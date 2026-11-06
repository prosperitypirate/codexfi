/**
 * Memory extraction layer — prompt dispatch, JSON parsing, and memory extraction logic.
 *
 * All LLM calls go through llm.ts (Claude via the user's Claude Code login, or an
 * Anthropic API key). callLlm() never throws — on failure it returns "[]".
 */

import { MAX_CONTENT_CHARS, MAX_SUMMARY_CHARS } from "./config.js";
import { callLlm } from "./llm.js";
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
import type { ExtractedFact, ExtractionMode, Message } from "./types.js";

export { callLlm };

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
		// Models occasionally wrap the array in prose ("Here are the memories: [...]").
		const start = cleaned.indexOf("[");
		const end = cleaned.lastIndexOf("]");
		if (start !== -1 && end > start && (start > 0 || end < cleaned.length - 1)) {
			return parseJsonArray(cleaned.slice(start, end + 1));
		}
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
			raw = await callLlm(INIT_EXTRACTION_SYSTEM, INIT_EXTRACTION_USER.replace("{content}", truncated), { operation: "init" });
			break;
		case "summary":
			raw = await callLlm(SUMMARY_SYSTEM, SUMMARY_USER.replace("{conversation}", truncated), { operation: "summary" });
			break;
		default:
			raw = await callLlm(EXTRACTION_SYSTEM, EXTRACTION_USER.replace("{conversation}", truncated), { operation: "extraction" });
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
			{ operation: "contradiction" },
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
			{ operation: "condense" },
		);
		const items = parseJsonArray(raw);
		return items.length > 0 ? items[0] : null;
	} catch (error) {
		console.warn("condenseToLearnedPattern failed:", error);
		return null;
	}
}
