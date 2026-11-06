/**
 * Controllable stand-in for plugin/src/llm.ts `callLlm` / `callLlmStrict`.
 *
 * preload.ts replaces those two exports with the fakes below (every other llm.ts
 * export stays real), so no test can ever reach the real `claude` CLI or the
 * Anthropic API. Tests steer responses with setLlmHandler() and inspect llmCalls.
 *
 * The real implementations are kept in `realLlm` for the one test that drives
 * the real CLI code path against the fake `claude` stub binary.
 */

export interface LlmCall {
	system: string;
	user: string;
	opts: Record<string, unknown>;
}

export type LlmHandler = (system: string, user: string, opts: Record<string, unknown>) => string | Promise<string>;

const DEFAULT_HANDLER: LlmHandler = () => "[]";

export const llmCalls: LlmCall[] = [];
let handler: LlmHandler = DEFAULT_HANDLER;

export function setLlmHandler(h: LlmHandler): void {
	handler = h;
}

/** Back to "always return []" and forget recorded calls. */
export function resetFakeLlm(): void {
	handler = DEFAULT_HANDLER;
	llmCalls.length = 0;
}

export async function fakeCallLlm(system: string, user: string, opts: Record<string, unknown> = {}): Promise<string> {
	llmCalls.push({ system, user, opts });
	return await handler(system, user, opts);
}

export async function fakeCallLlmStrict(system: string, user: string, opts: Record<string, unknown> = {}) {
	const text = await fakeCallLlm(system, user, opts);
	return { text, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0, model: "fake" } };
}

/** Real llm.ts exports, captured by preload.ts before the module was mocked. */
export const realLlm: Record<string, unknown> = {};
