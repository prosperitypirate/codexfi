import { resolveBackend, type LlmBackend } from "../llm/backend.js";

export interface Config {
  backendUrl: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  judgeModel: string;
  answeringModel: string;
  /** LLM backend for answer / judge / retrieval-relevance / memory-bank build (BENCH_LLM_BACKEND). */
  llmBackend: LlmBackend;
  /** Parallel workers for answer + evaluate phases (BENCH_CONCURRENCY, default 4). */
  concurrency: number;
  /** Model that maintains the simulated Memory Bank (MB_MODEL). */
  mbModel: string;
}

export function loadConfig(): Config {
  const backendUrl = process.env.MEMORY_BACKEND_URL ?? "http://localhost:8020";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const llmBackend = resolveBackend();

  if (llmBackend === "api" && !anthropicApiKey && !openaiApiKey) {
    throw new Error(
      "At least one of ANTHROPIC_API_KEY or OPENAI_API_KEY must be set (or use BENCH_LLM_BACKEND=claude-cli)"
    );
  }

  // FIX: Default was "claude-sonnet-4-5" — caused embedded-v2 run to score 85% vs
  // haiku-run1's 92% because the answering/judge model was weaker. Updated to 4-6.
  // benchmark/.env.local also sets JUDGE_MODEL and ANSWERING_MODEL explicitly,
  // loaded by the .env.local loader in index.ts (overrides root .env).
  const defaultModel = anthropicApiKey || llmBackend === "claude-cli"
    ? "claude-sonnet-4-6"
    : "gpt-4o";

  const judgeModel = process.env.JUDGE_MODEL ?? defaultModel;
  const answeringModel = process.env.ANSWERING_MODEL ?? defaultModel;
  const mbModel = process.env.MB_MODEL ?? "claude-sonnet-4-6";

  const concurrency = Math.max(1, parseInt(process.env.BENCH_CONCURRENCY ?? "4", 10) || 4);

  return { backendUrl, anthropicApiKey, openaiApiKey, judgeModel, answeringModel, llmBackend, concurrency, mbModel };
}
