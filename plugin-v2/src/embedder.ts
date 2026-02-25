/**
 * Voyage AI embedding wrapper.
 *
 * Direct fetch() to Voyage AI API — replaces voyageai Python SDK.
 * Records token usage to both the CostLedger and the ActivityLog.
 */

import {
	EMBEDDING_MODEL,
	VOYAGE_API_KEY,
	VOYAGE_PRICE_PER_M,
} from "./config.js";
import { withRetry, EMBED_RETRY } from "./retry.js";
import { ledger, activityLog } from "./telemetry.js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

/**
 * Embed `text` and return a float32 vector (1024 dimensions).
 *
 * @param text - The string to embed.
 * @param inputType - "document" for storage, "query" for search.
 */
export async function embed(
	text: string,
	inputType: "document" | "query" = "document",
): Promise<number[]> {
	if (!VOYAGE_API_KEY) {
		throw new Error("VOYAGE_API_KEY is not set — cannot embed text");
	}

	const result = await withRetry(
		async () => {
			const response = await fetch(VOYAGE_API_URL, {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${VOYAGE_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: EMBEDDING_MODEL,
					input: [text],
					input_type: inputType,
				}),
			});

			if (!response.ok) {
				const body = await response.text();
				throw new Error(`Voyage AI API error ${response.status}: ${body}`);
			}

			return response.json();
		},
		"Voyage AI embed",
		EMBED_RETRY,
	);

	// Record telemetry
	try {
		const tokens = result.usage?.total_tokens ?? 0;
		const cost = tokens * VOYAGE_PRICE_PER_M / 1_000_000;
		await ledger.recordVoyage(tokens);
		activityLog.recordVoyage(tokens, cost);
	} catch {
		// Telemetry failure should never block embedding
	}

	return result.data[0].embedding;
}
