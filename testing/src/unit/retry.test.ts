/**
 * Unit tests for retry.ts — exponential backoff, jitter, timeout.
 */

import { describe, test, expect } from "bun:test";
import { withRetry, type RetryConfig } from "../../../plugin/src/retry.js";

// Suppress retry warning logs during tests
const silent = () => {};

describe("withRetry", () => {
	test("returns result on first success", async () => {
		const result = await withRetry(async () => 42, "test-op", {
			maxRetries: 3,
			baseDelayMs: 1,
			maxDelayMs: 10,
			jitter: 0,
		}, silent);
		expect(result).toBe(42);
	});

	test("retries on failure then succeeds", async () => {
		let attempts = 0;
		const result = await withRetry(async () => {
			attempts++;
			if (attempts < 3) throw new Error("not yet");
			return "ok";
		}, "test-op", {
			maxRetries: 5,
			baseDelayMs: 1,
			maxDelayMs: 10,
			jitter: 0,
		}, silent);

		expect(result).toBe("ok");
		expect(attempts).toBe(3);
	});

	test("throws after exhausting retries", async () => {
		let attempts = 0;
		const config: RetryConfig = {
			maxRetries: 2,
			baseDelayMs: 1,
			maxDelayMs: 10,
			jitter: 0,
		};

		await expect(
			withRetry(async () => {
				attempts++;
				throw new Error("always fails");
			}, "test-op", config, silent)
		).rejects.toThrow("always fails");

		// 1 initial + 2 retries = 3 total attempts
		expect(attempts).toBe(3);
	});

	test("respects maxRetries = 0 (no retries)", async () => {
		let attempts = 0;
		const config: RetryConfig = {
			maxRetries: 0,
			baseDelayMs: 1,
			maxDelayMs: 10,
			jitter: 0,
		};

		await expect(
			withRetry(async () => {
				attempts++;
				throw new Error("fail");
			}, "test-op", config, silent)
		).rejects.toThrow("fail");

		expect(attempts).toBe(1);
	});

	test("timeout rejects slow operations", async () => {
		const config: RetryConfig = {
			maxRetries: 0,
			baseDelayMs: 1,
			maxDelayMs: 10,
			jitter: 0,
			timeoutMs: 50,
		};

		await expect(
			withRetry(async () => {
				await Bun.sleep(500);
				return "too late";
			}, "slow-op", config, silent)
		).rejects.toThrow("timed out");
	});

	test("exponential backoff increases delay", async () => {
		const delays: number[] = [];
		let lastTime = Date.now();
		let attempts = 0;

		const config: RetryConfig = {
			maxRetries: 3,
			baseDelayMs: 20,
			maxDelayMs: 1000,
			jitter: 0,
		};

		try {
			await withRetry(async () => {
				const now = Date.now();
				if (attempts > 0) {
					delays.push(now - lastTime);
				}
				lastTime = now;
				attempts++;
				throw new Error("fail");
			}, "test-op", config, silent);
		} catch {
			// Expected
		}

		// With jitter=0 and baseDelay=20: delays should be ~20, ~40, ~80
		// Allow generous tolerance for timing
		expect(delays.length).toBe(3);
		expect(delays[0]!).toBeGreaterThan(10);
		// Each delay should generally increase (with some timing tolerance)
		expect(delays[2]!).toBeGreaterThan(delays[0]!);
	});
});
