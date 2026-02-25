export interface Config {
  backendUrl: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  judgeModel: string;
  answeringModel: string;
}

export function loadConfig(): Config {
  const backendUrl = process.env.MEMORY_BACKEND_URL ?? "http://localhost:8020";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!anthropicApiKey && !openaiApiKey) {
    throw new Error(
      "At least one of ANTHROPIC_API_KEY or OPENAI_API_KEY must be set"
    );
  }

  // FIX: Default was "claude-sonnet-4-5" — caused embedded-v2 run to score 85% vs
  // haiku-run1's 92% because the answering/judge model was weaker. Updated to 4-6.
  // benchmark/.env.local also sets JUDGE_MODEL and ANSWERING_MODEL explicitly,
  // loaded by the .env.local loader in index.ts (overrides root .env).
  const defaultModel = anthropicApiKey
    ? "claude-sonnet-4-6"
    : "gpt-4o";

  const judgeModel = process.env.JUDGE_MODEL ?? defaultModel;
  const answeringModel = process.env.ANSWERING_MODEL ?? defaultModel;

  return { backendUrl, anthropicApiKey, openaiApiKey, judgeModel, answeringModel };
}
