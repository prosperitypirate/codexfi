/**
 * Builds the [MEMORY - DISABLED] warning injected into the system prompt
 * when the plugin is not configured (VOYAGE_API_KEY absent from codexfi.jsonc).
 *
 * Extracted into its own module so it can be unit-tested without importing
 * index.ts (which pulls in @lancedb/lancedb and other heavy native deps).
 */

import {
	VOYAGE_API_KEY,
	ANTHROPIC_API_KEY,
	XAI_API_KEY,
	GOOGLE_API_KEY,
	EXTRACTION_PROVIDER,
} from "../config.js";

export function buildDisabledWarning(): string {
	const keyStatus = (key: string, value: string) =>
		value ? `  ✓ ${key.padEnd(20)} set` : `  ✗ ${key.padEnd(20)} MISSING`;

	const extractionAvailable = ANTHROPIC_API_KEY || XAI_API_KEY || GOOGLE_API_KEY;
	const availableExtraction = ANTHROPIC_API_KEY
		? `ANTHROPIC_API_KEY (${EXTRACTION_PROVIDER === "anthropic" ? "active provider" : "available"})`
		: XAI_API_KEY
			? `XAI_API_KEY (${EXTRACTION_PROVIDER === "xai" ? "active provider" : "available"})`
			: GOOGLE_API_KEY
				? `GOOGLE_API_KEY (${EXTRACTION_PROVIDER === "google" ? "active provider" : "available"})`
				: null;

	return `[MEMORY - DISABLED]
IMPORTANT: Inform the user at the start of this session:
"[codexfi] Memory is disabled - run \`codexfi install\` in your terminal to set it up, then restart OpenCode."
Do not wait for the user to ask. Say it before responding to anything else.

codexfi is NOT active this session. Memories are not being saved or retrieved.

API key status:
${keyStatus("VOYAGE_API_KEY", VOYAGE_API_KEY)}  <- required for embeddings, no fallback
${keyStatus("ANTHROPIC_API_KEY", ANTHROPIC_API_KEY)}
${keyStatus("XAI_API_KEY", XAI_API_KEY)}
${keyStatus("GOOGLE_API_KEY", GOOGLE_API_KEY)}

${!VOYAGE_API_KEY ? `Root cause: VOYAGE_API_KEY is not set. This is required for all memory operations.` : ""}
${extractionAvailable && !VOYAGE_API_KEY ? `Note: ${availableExtraction} is available - extraction would work once VOYAGE_API_KEY is set.` : ""}

Keys must be stored in ~/.config/opencode/codexfi.jsonc.
Run \`codexfi install\` to set them up.

Run \`codexfi status\` for full diagnostics.`;
}
