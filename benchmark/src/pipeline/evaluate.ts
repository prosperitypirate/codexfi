import type { UnifiedQuestion, EvaluationResult, Checkpoint } from "../types.js";
import { getJudgePrompt, formatJudgePrompt } from "../prompts/index.js";
import { judge } from "../judges/llm.js";
import { calculateRetrievalMetrics } from "./retrieval-eval.js";
import { markPhaseComplete, throttledSaver } from "../utils/checkpoint.js";
import { mapPool } from "../utils/concurrency.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";
import type { Config } from "../utils/config.js";

export async function runEvaluate(
  questions: UnifiedQuestion[],
  cp: Checkpoint,
  config: Config
): Promise<void> {
  log.phase("EVALUATE");
  log.info(`Evaluating ${questions.length} answers with ${config.judgeModel} [${config.llmBackend}, concurrency ${config.concurrency}]...`);

  if (!cp.answerResults) throw new Error("Answer phase must complete before evaluate phase");

  const searchMap = new Map(cp.searchResults?.map((r) => [r.questionId, r]) ?? []);
  const answerMap = new Map(cp.answerResults.map((r) => [r.questionId, r]));

  // Resume support: evaluations already checkpointed are kept.
  const done = new Map((cp.evaluations ?? []).map((e) => [e.questionId, e]));
  const pending = questions.filter((q) => {
    if (done.has(q.questionId)) return false;
    if (!answerMap.has(q.questionId)) {
      log.warn(`No answer found for ${q.questionId}, skipping`);
      return false;
    }
    return true;
  });
  let correct = [...done.values()].filter((e) => e.score === 1).length;

  const saver = throttledSaver(cp);
  await mapPool(pending, config.concurrency, async (q) => {
    const answerPhase = answerMap.get(q.questionId)!;
    const searchPhase = searchMap.get(q.questionId);

    const template = getJudgePrompt(q.questionType);
    const prompt = formatJudgePrompt(template, q.question, q.groundTruth, answerPhase.answer);

    // Run answer judge and retrieval metrics in parallel — zero extra wall-clock time
    const [result, retrievalMetrics] = await Promise.all([
      judge(prompt, config),
      calculateRetrievalMetrics(
        q.question,
        q.groundTruth,
        searchPhase?.results ?? [],
        config
      ),
    ]);

    const evaluation: EvaluationResult = {
      questionId:        q.questionId,
      questionType:      q.questionType,
      question:          q.question,
      groundTruth:       q.groundTruth,
      hypothesis:        answerPhase.answer,
      score:             result.score,
      label:             result.label,
      explanation:       result.explanation,
      searchResults:     searchPhase?.results ?? [],
      searchDurationMs:  searchPhase?.durationMs ?? 0,
      answerDurationMs:  answerPhase.durationMs,
      retrievalMetrics,
    };
    return evaluation;
  }, (evaluation) => {
    done.set(evaluation.questionId, evaluation);
    if (evaluation.score === 1) correct++;
    cp.evaluations = [...done.values()];
    saver.save();

    const rm = evaluation.retrievalMetrics!;
    const mark = evaluation.score === 1 ? "✓" : "✗";
    const precisionLabel = `P=${Math.round(rm.precisionAtK * (rm.k || 8))}/${rm.k || 8}`;
    const mrrLabel = `MRR=${rm.mrr.toFixed(2)}`;
    log.dim(`  ${mark} ${evaluation.questionId} [${evaluation.questionType}]: ${evaluation.explanation.slice(0, 60)} | ${precisionLabel} ${mrrLabel}`);
    emit({
      type: "evaluate_question",
      questionId: evaluation.questionId,
      questionType: evaluation.questionType,
      correct: evaluation.score === 1,
      explanation: evaluation.explanation,
      done: done.size,
      total: questions.length,
      runningCorrect: correct,
      retrievalMetrics: rm,
    });
  });

  saver.flush();

  // Restore question order
  const evaluations = questions.map((q) => done.get(q.questionId)).filter((e): e is EvaluationResult => !!e);
  cp.evaluations = evaluations;
  markPhaseComplete(cp, "evaluate");

  const finalCorrect = evaluations.filter((e) => e.score === 1).length;
  const accuracy = ((finalCorrect / Math.max(1, evaluations.length)) * 100).toFixed(1);
  log.success(`Evaluation complete: ${finalCorrect}/${evaluations.length} correct (${accuracy}%)`);
}
