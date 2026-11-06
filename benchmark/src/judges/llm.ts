import type { Config } from "../utils/config.js";
import { complete, type LlmUsage } from "../llm/backend.js";

export type JudgeResult = {
  score: 0 | 1;
  label: "correct" | "incorrect";
  explanation: string;
  durationMs?: number;
  usage?: LlmUsage;
};

export async function judge(prompt: string, config: Config): Promise<JudgeResult> {
  const res = await complete({ model: config.judgeModel, prompt, maxOutputTokens: 200 }, config);
  return { ...parseJudge(res.text), durationMs: res.durationMs, usage: res.usage };
}

function parseJudge(text: string): Omit<JudgeResult, "durationMs" | "usage"> {
  // Extract JSON from the response
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    // Fallback: try to infer from text
    const lower = text.toLowerCase();
    if (lower.includes("correct") && !lower.includes("incorrect")) {
      return { score: 1, label: "correct", explanation: text.trim() };
    }
    return { score: 0, label: "incorrect", explanation: text.trim() };
  }

  try {
    const parsed = JSON.parse(match[0]) as JudgeResult;
    return {
      score: parsed.score === 1 ? 1 : 0,
      label: parsed.score === 1 ? "correct" : "incorrect",
      explanation: parsed.explanation ?? "",
    };
  } catch {
    return { score: 0, label: "incorrect", explanation: "Failed to parse judge response" };
  }
}

export interface AnswerResponse {
  text: string;
  durationMs: number;
  usage?: LlmUsage;
}

export async function answer(
  prompt: string,
  config: Config,
  options?: { system?: string },
): Promise<AnswerResponse> {
  const res = await complete({
    model: config.answeringModel,
    system: options?.system,
    prompt,
    // 400 tokens: tight limit forces concise, comprehensive list-style answers.
    // Increasing this causes the model to elaborate narrowly on a few items rather
    // than broadly covering all retrieved facts — hurting enumeration coverage.
    // (api backend only — the claude CLI errors instead of truncating at a cap.)
    maxOutputTokens: 400,
  }, config);

  return { text: res.text.trim(), durationMs: res.durationMs, usage: res.usage };
}
