import type { UnifiedQuestion, AnswerPhaseResult, Checkpoint } from "../types.js";
import { buildAnswerPrompt } from "../prompts/index.js";
import { answer as generateAnswer } from "../judges/llm.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";
import type { Config } from "../utils/config.js";

export async function runAnswer(
  questions: UnifiedQuestion[],
  cp: Checkpoint,
  config: Config
): Promise<void> {
  log.phase("ANSWER");
  log.info(`Generating answers for ${questions.length} questions using ${config.answeringModel}...`);

  if (!cp.searchResults) throw new Error("Search phase must complete before answer phase");

  const searchMap = new Map(cp.searchResults.map((r) => [r.questionId, r]));
  const results: AnswerPhaseResult[] = [];

  for (const q of questions) {
    const searchPhase = searchMap.get(q.questionId);
    const searchResults = searchPhase?.results ?? [];

    const prompt = buildAnswerPrompt(q.question, searchResults, q.questionType);
    const start = Date.now();
    const ans = await generateAnswer(prompt, config);
    const durationMs = Date.now() - start;

    results.push({
      questionId: q.questionId,
      answer: ans,
      durationMs,
      searchResults,
    });

    log.dim(`  ${q.questionId}: ${ans.slice(0, 80)}${ans.length > 80 ? "…" : ""}`);
    emit({ type: "answer_question", questionId: q.questionId, preview: ans.slice(0, 100), done: results.length, total: questions.length });
  }

  cp.answerResults = results;
  markPhaseComplete(cp, "answer");

  const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
  log.success(`Answers generated. Avg latency: ${avgMs}ms`);
}
