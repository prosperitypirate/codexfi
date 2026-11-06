import type { UnifiedQuestion, AnswerPhaseResult, Checkpoint, SearchResult } from "../types.js";
import { buildAnswerPrompt, buildBlockQualityAnswerPrompt } from "../prompts/index.js";
import { answer as generateAnswer } from "../judges/llm.js";
import { markPhaseComplete, throttledSaver } from "../utils/checkpoint.js";
import { mapPool } from "../utils/concurrency.js";
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
    ` [${config.llmBackend}, concurrency ${config.concurrency}]` +
    (isBlockOnly ? " (block-quality mode)…" : "…")
  );

  if (isBlockOnly && !cp.blockQualityResults) {
    throw new Error("Block assembly phase must complete before answer phase in block-quality mode");
  }
  if (!isBlockOnly && !cp.searchResults) throw new Error("Search phase must complete before answer phase");

  const blockMap  = new Map((cp.blockQualityResults ?? []).map((r) => [r.questionId, r]));
  const searchMap = new Map((cp.searchResults ?? []).map((r) => [r.questionId, r]));

  // Resume support: answers already in the checkpoint (from an interrupted run) are kept.
  const done = new Map((cp.answerResults ?? []).map((r) => [r.questionId, r]));
  const pending = questions.filter((q) => !done.has(q.questionId));
  if (done.size > 0) log.info(`  Resuming: ${questions.length - pending.length} answers already checkpointed`);

  const saver = throttledSaver(cp);
  await mapPool(pending, config.concurrency, async (q) => {
    let prompt: string;
    let system: string | undefined;
    let searchResults: SearchResult[] = [];
    if (isBlockOnly) {
      system = buildContextSystemPrompt(blockMap.get(q.questionId)?.block ?? "");
      prompt = buildBlockQualityAnswerPrompt(q.question, q.questionType);
    } else {
      searchResults = searchMap.get(q.questionId)?.results ?? [];
      prompt = buildAnswerPrompt(q.question, searchResults, q.questionType);
    }
    const ans = await generateAnswer(prompt, config, system ? { system } : undefined);
    const result: AnswerPhaseResult = {
      questionId: q.questionId,
      answer: ans.text,
      durationMs: ans.durationMs,
      searchResults,
      usage: ans.usage,
    };
    return result;
  }, (result) => {
    done.set(result.questionId, result);
    cp.answerResults = [...done.values()];
    saver.save();
    log.dim(`  ${result.questionId}: ${result.answer.slice(0, 80)}${result.answer.length > 80 ? "…" : ""}`);
    emit({ type: "answer_question", questionId: result.questionId, preview: result.answer.slice(0, 100), done: done.size, total: questions.length });
  });

  saver.flush();

  // Restore question order
  const results = questions.map((q) => done.get(q.questionId)).filter((r): r is AnswerPhaseResult => !!r);
  cp.answerResults = results;
  markPhaseComplete(cp, "answer");

  const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / Math.max(1, results.length));
  log.success(`Answers generated. Avg latency: ${avgMs}ms`);
}

/**
 * Build the system prompt for context-as-system-prompt answering (block-quality
 * mode and every memory-bank-mode condition). The context is injected as the
 * system prompt; the model answers from it alone.
 */
export function buildContextSystemPrompt(block: string): string {
  const contextSection = block.trim()
    ? `Your project memory context:\n\n${block}`
    : "(No project memory context available for this question.)";

  return `You are an AI coding agent. ${contextSection}

Answer questions using ONLY the information in your project memory context above.
If the context does not contain the answer, respond with exactly: "I don't know"
Do NOT use external knowledge or make assumptions beyond what the context states.`;
}
