import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { Config } from "../utils/config.js";

type JudgeResult = {
  score: 0 | 1;
  label: "correct" | "incorrect";
  explanation: string;
};

function createModel(config: Config) {
  if (config.anthropicApiKey && config.judgeModel.includes("claude")) {
    const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
    return anthropic(config.judgeModel);
  }
  if (config.openaiApiKey) {
    const openai = createOpenAI({ apiKey: config.openaiApiKey });
    return openai(config.judgeModel);
  }
  throw new Error("No valid LLM provider configured for judging");
}

export async function judge(prompt: string, config: Config): Promise<JudgeResult> {
  const model = createModel(config);

  const { text } = await generateText({
    model,
    prompt,
    maxOutputTokens: 200,
    temperature: 0,
  });

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

export async function answer(prompt: string, config: Config): Promise<string> {
  const model = createModel(config);

  const { text } = await generateText({
    model,
    prompt,
    // 400 tokens: tight limit forces concise, comprehensive list-style answers.
    // Increasing this causes the model to elaborate narrowly on a few items rather
    // than broadly covering all retrieved facts — hurting enumeration coverage.
    maxOutputTokens: 400,
    temperature: 0,
  });

  return text.trim();
}
