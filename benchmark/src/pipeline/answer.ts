import type { UnifiedQuestion, AnswerPhaseResult, Checkpoint } from "../types.js";
import { buildAnswerPrompt, buildBlockQualityAnswerPrompt } from "../prompts/index.js";
import { answer as generateAnswer } from "../judges/llm.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";
import type { Config } from "../utils/config.js";

export async function runAnswer(
  questions: UnifiedQuestion[],
  cp: Checkpoint,
  config: Config,
  options?: { blockOnly?: boolean },
): Promise<void> {
  const isBlockOnly = options?.blockOnly ?? false;
  log.phase("ANSWER");
  log.info(
    `Generating answers for ${questions.length} questions using ${config.answeringModel}` +
    (isBlockOnly ? " (block-quality mode)…" : "…")
  );

  if (isBlockOnly) {
    if (!cp.blockQualityResults) throw new Error("Block assembly phase must complete before answer phase in block-quality mode");
    const blockMap = new Map(cp.blockQualityResults.map((r) => [r.questionId, r]));
    const results: AnswerPhaseResult[] = [];

    for (const q of questions) {
      const blockResult = blockMap.get(q.questionId);
      const block = blockResult?.block ?? "";

      const system = buildBlockQualitySystemPrompt(block);
      const prompt = buildBlockQualityAnswerPrompt(q.question, q.questionType);
      const start = Date.now();
      const ans = await generateAnswer(prompt, config, { system });
      const durationMs = Date.now() - start;

      results.push({
        questionId: q.questionId,
        answer: ans,
        durationMs,
        searchResults: [],
      });

      log.dim(`  ${q.questionId}: ${ans.slice(0, 80)}${ans.length > 80 ? "…" : ""}`);
      emit({ type: "answer_question", questionId: q.questionId, preview: ans.slice(0, 100), done: results.length, total: questions.length });
    }

    cp.answerResults = results;
    markPhaseComplete(cp, "answer");
    const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
    log.success(`Answers generated. Avg latency: ${avgMs}ms`);
    return;
  }

  // ── Standard retrieval mode ──────────────────────────────────────────────────
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

/**
 * Build the system prompt for block-quality mode.
 * The [MEMORY] block is injected as the system context; the model answers from it alone.
 */
function buildBlockQualitySystemPrompt(block: string): string {
  const contextSection = block.trim()
    ? `Your project memory context:\n\n${block}`
    : "(No project memory context available for this question.)";

  return `You are an AI coding agent. ${contextSection}

Answer questions using ONLY the information in your project memory context above.
If the context does not contain the answer, respond with exactly: "I don't know"
Do NOT use external knowledge or make assumptions beyond what the context states.`;
}
