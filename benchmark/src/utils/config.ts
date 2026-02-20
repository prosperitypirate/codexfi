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

  // Default to Anthropic if key is available, else OpenAI
  const defaultModel = anthropicApiKey
    ? "claude-sonnet-4-5"
    : "gpt-4o";

  const judgeModel = process.env.JUDGE_MODEL ?? defaultModel;
  const answeringModel = process.env.ANSWERING_MODEL ?? defaultModel;

  return { backendUrl, anthropicApiKey, openaiApiKey, judgeModel, answeringModel };
}
