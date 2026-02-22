/**
 * Retrieval quality evaluation.
 *
 * For each question, a single LLM call evaluates all top-K search results
 * for relevance, then computes Hit@K, Precision@K, F1@K, MRR, and NDCG.
 *
 * K is derived dynamically from the number of results actually retrieved —
 * so if the pipeline retrieves 20, metrics are reported at K=20. This keeps
 * the evaluation K aligned with the retrieval K regardless of what limit is
 * configured.
 *
 * Designed to run in parallel with the answer judge:
 *   Promise.all([judge(answerPrompt, config), calculateRetrievalMetrics(...)])
 *
 * This adds ~zero wall-clock time because both calls are in flight simultaneously.
 */

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { SearchResult, RetrievalMetrics } from "../types.js";
import type { Config } from "../utils/config.js";

function createModel(config: Config) {
  if (config.anthropicApiKey && config.judgeModel.includes("claude")) {
    const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
    return anthropic(config.judgeModel);
  }
  if (config.openaiApiKey) {
    const openai = createOpenAI({ apiKey: config.openaiApiKey });
    return openai(config.judgeModel);
  }
  throw new Error("No valid LLM provider configured for retrieval evaluation");
}

/**
 * Build the relevance-judge prompt.
 * Evaluates up to K results in a single LLM call.
 */
function buildRelevancePrompt(
  question: string,
  groundTruth: string,
  results: SearchResult[],
  k: number
): string {
  const topK = results.slice(0, k);

  const items = topK
    .map((r, i) => {
      const chunk = r.chunk ? `\n    Chunk: ${r.chunk.slice(0, 200)}` : "";
      return `[${i + 1}] Memory: ${r.memory.slice(0, 300)}${chunk}`;
    })
    .join("\n");

  return `You are evaluating whether retrieved memories are relevant to a question.

Question: ${question}
Expected answer: ${groundTruth}

Retrieved memories (${topK.length} total):
${items}

For each memory, mark it as relevant (1) if it contains information helpful for answering the question, or irrelevant (0) if it does not.

Return ONLY a JSON array with no additional text:
[{"id":1,"relevant":1}, {"id":2,"relevant":0}, ...]

Return exactly ${topK.length} objects.`;
}

/**
 * Parse the relevance JSON from the LLM response.
 * Returns an array of 0|1 values (length = topK.length).
 */
function parseRelevanceScores(text: string, expectedCount: number): number[] {
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return new Array(expectedCount).fill(0);

  try {
    const parsed = JSON.parse(match[0]) as Array<{ id: number; relevant: number }>;
    const scores = new Array(expectedCount).fill(0);
    for (const item of parsed) {
      const idx = item.id - 1;
      if (idx >= 0 && idx < expectedCount) {
        scores[idx] = item.relevant === 1 ? 1 : 0;
      }
    }
    return scores;
  } catch {
    return new Array(expectedCount).fill(0);
  }
}

/**
 * Compute NDCG@K given binary relevance scores.
 */
function computeNDCG(scores: number[]): number {
  if (scores.length === 0) return 0;

  // DCG: sum of rel_i / log2(i+2) for i in 0..K-1
  let dcg = 0;
  for (let i = 0; i < scores.length; i++) {
    dcg += scores[i] / Math.log2(i + 2);
  }

  // Ideal DCG: sort by relevance descending
  const ideal = [...scores].sort((a, b) => b - a);
  let idcg = 0;
  for (let i = 0; i < ideal.length; i++) {
    idcg += ideal[i] / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

/**
 * Main entry point. Call this in parallel with the answer judge.
 *
 * If results are empty (e.g. abstention questions), returns zeroed metrics
 * without making an LLM call.
 */
export async function calculateRetrievalMetrics(
  question: string,
  groundTruth: string,
  results: SearchResult[],
  config: Config
): Promise<RetrievalMetrics> {
  // K matches whatever was actually retrieved — keeps evaluation aligned with retrieval
  const K = results.length;

  // No results — return zero metrics without an LLM call
  if (results.length === 0) {
    return {
      hitAtK: 0,
      precisionAtK: 0,
      f1AtK: 0,
      mrr: 0,
      ndcg: 0,
      k: 0,
      relevanceScores: [],
    };
  }

  const topK = results; // evaluate all retrieved results
  const prompt = buildRelevancePrompt(question, groundTruth, topK, K);

  let relevanceScores: number[];
  try {
    const model = createModel(config);
    const { text } = await generateText({
      model,
      prompt,
      maxOutputTokens: 300,
      temperature: 0,
    });
    relevanceScores = parseRelevanceScores(text, topK.length);
  } catch {
    // On LLM failure, return zero metrics rather than crashing the pipeline
    relevanceScores = new Array(topK.length).fill(0);
  }

  const relevantCount = relevanceScores.reduce((s, v) => s + v, 0);
  const hitAtK = relevantCount > 0 ? 1 : 0;
  const precisionAtK = topK.length > 0 ? relevantCount / topK.length : 0;
  // f1AtK here is a proxy metric: F1(Precision@K, Hit@K).
  // Hit@K acts as a binary recall signal (1 if ≥1 relevant result retrieved).
  // True F1@K would require recall = relevantInResults / totalRelevantInCorpus,
  // but we don't track total relevant docs per question in this benchmark.
  // The proxy rewards both precision (how many retrieved are relevant) and
  // coverage (whether anything relevant was retrieved at all).
  const f1AtK =
    precisionAtK + hitAtK > 0
      ? (2 * precisionAtK * hitAtK) / (precisionAtK + hitAtK)
      : 0;

  // MRR: reciprocal rank of first relevant result
  let mrr = 0;
  for (let i = 0; i < relevanceScores.length; i++) {
    if (relevanceScores[i] === 1) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  const ndcg = computeNDCG(relevanceScores);

  return { hitAtK, precisionAtK, f1AtK, mrr, ndcg, k: topK.length, relevanceScores };
}
