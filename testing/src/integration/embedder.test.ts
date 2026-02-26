/**
 * Integration tests for embedder.ts — Voyage AI embedding with mocked HTTP.
 *
 * These tests mock fetch() to avoid real API calls while verifying the
 * embed() function's request format, error handling, and telemetry recording.
 *
 * IMPORTANT: VOYAGE_API_KEY is read at module evaluation time from config.ts.
 * We use Bun's mock.module() to override the config export before embedder loads.
 */

import { describe, test, expect, afterEach, mock } from "bun:test";
import { installFetchMock, restoreFetch, voyageEmbedResponse } from "../helpers/mock-fetch.js";
import { EMBEDDING_DIMS } from "../../../plugin/src/config.js";

// Mock the config module to provide a fake VOYAGE_API_KEY for testing.
// This must happen before embedder.ts is imported.
mock.module("../../../plugin/src/config.js", () => {
	// Re-export everything from the real config, but override VOYAGE_API_KEY
	const realConfig = require("../../../plugin/src/config.js");
	return {
		...realConfig,
		VOYAGE_API_KEY: "test-voyage-key-for-unit-tests",
	};
});

const { embed } = await import("../../../plugin/src/embedder.js");

afterEach(() => {
	restoreFetch();
});

describe("embed", () => {
	test("returns a vector of correct dimensions", async () => {
		const expectedVector = new Array(EMBEDDING_DIMS).fill(0.5);
		installFetchMock({
			"api.voyageai.com": voyageEmbedResponse(expectedVector),
		});

		const result = await embed("hello world", "document");
		expect(result).toEqual(expectedVector);
		expect(result.length).toBe(EMBEDDING_DIMS);
	});

	test("sends correct model and input", async () => {
		let capturedBody: Record<string, unknown> | null = null;
		const originalFetch = globalThis.fetch;

		// @ts-expect-error — Bun's fetch type includes preconnect; test mock omits it
		globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			if (init?.body) {
				capturedBody = JSON.parse(init.body as string);
			}
			return new Response(JSON.stringify({
				data: [{ embedding: new Array(EMBEDDING_DIMS).fill(0) }],
				usage: { total_tokens: 5 },
			}), { status: 200, headers: { "Content-Type": "application/json" } });
		};

		await embed("test text", "document");

		expect(capturedBody).not.toBeNull();
		expect(capturedBody!.model).toBe("voyage-code-3");
		expect(capturedBody!.input).toEqual(["test text"]);
		expect(capturedBody!.input_type).toBe("document");

		globalThis.fetch = originalFetch;
	});

	test("sends query input type for search embeddings", async () => {
		let capturedBody: Record<string, unknown> | null = null;

		// @ts-expect-error — Bun's fetch type includes preconnect; test mock omits it
		globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			if (init?.body) {
				capturedBody = JSON.parse(init.body as string);
			}
			return new Response(JSON.stringify({
				data: [{ embedding: new Array(EMBEDDING_DIMS).fill(0) }],
				usage: { total_tokens: 5 },
			}), { status: 200, headers: { "Content-Type": "application/json" } });
		};

		await embed("search query", "query");

		expect(capturedBody!.input_type).toBe("query");

		restoreFetch();
	});

	test("throws on API error after retries", async () => {
		installFetchMock({
			"api.voyageai.com": () => new Response("Rate limited", { status: 429 }),
		});

		await expect(embed("test", "document")).rejects.toThrow("Voyage AI API error 429");
	});
});
