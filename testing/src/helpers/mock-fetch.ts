/**
 * Fetch mock utilities for tests that need to intercept HTTP calls
 * to external APIs (Voyage AI, Anthropic, xAI, Google).
 *
 * Uses Bun's native mock() to replace global fetch.
 */

import { mock } from "bun:test";
import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";

/**
 * Create a mock Voyage AI embedding response.
 */
export function voyageEmbedResponse(vector?: number[]): Response {
	const v = vector ?? new Array(EMBEDDING_DIMS).fill(0.1);
	return new Response(JSON.stringify({
		data: [{ embedding: v }],
		usage: { total_tokens: 10 },
	}), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Create a mock Anthropic extraction response.
 */
export function anthropicExtractionResponse(memories: Array<{ memory: string; type: string }>): Response {
	return new Response(JSON.stringify({
		content: [{
			type: "text",
			text: JSON.stringify(memories.map(m => ({
				memory: m.memory,
				type: m.type,
			}))),
		}],
		usage: { input_tokens: 100, output_tokens: 50 },
	}), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Install a global fetch mock that routes by URL pattern.
 * Returns the mock function for assertions.
 *
 * @example
 * ```ts
 * const fetchMock = installFetchMock({
 *   "api.voyageai.com": voyageEmbedResponse(),
 *   "api.anthropic.com": anthropicExtractionResponse([...]),
 * });
 * ```
 */
export function installFetchMock(routes: Record<string, Response | (() => Response)>): ReturnType<typeof mock> {
	const mockFn = mock((input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

		for (const [pattern, response] of Object.entries(routes)) {
			if (url.includes(pattern)) {
				const res = typeof response === "function" ? response() : response.clone();
				return Promise.resolve(res);
			}
		}

		return Promise.reject(new Error(`Unmocked fetch: ${url}`));
	});

	globalThis.fetch = mockFn as unknown as typeof fetch;
	return mockFn;
}

/**
 * Restore the original global fetch. Call in afterAll/afterEach.
 */
const originalFetch = globalThis.fetch;
export function restoreFetch(): void {
	globalThis.fetch = originalFetch;
}
