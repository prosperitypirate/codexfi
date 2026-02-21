import type { UnifiedQuestion, EvaluationResult, Checkpoint } from "../types.js";
import { getJudgePrompt, formatJudgePrompt } from "../prompts/index.js";
import { judge } from "../judges/llm.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";
import type { Config } from "../utils/config.js";

export async function runEvaluate(
  questions: UnifiedQuestion[],
  cp: Checkpoint,
  config: Config
): Promise<void> {
  log.phase("EVALUATE");
  log.info(`Evaluating ${questions.length} answers with ${config.judgeModel}...`);

  if (!cp.answerResults) throw new Error("Answer phase must complete before evaluate phase");

  const searchMap = new Map(cp.searchResults?.map((r) => [r.questionId, r]) ?? []);
  const answerMap = new Map(cp.answerResults.map((r) => [r.questionId, r]));
  const evaluations: EvaluationResult[] = [];

  let correct = 0;

  for (const q of questions) {
    const answerPhase = answerMap.get(q.questionId);
    const searchPhase = searchMap.get(q.questionId);

    if (!answerPhase) {
      log.warn(`No answer found for ${q.questionId}, skipping`);
      continue;
    }

    const template = getJudgePrompt(q.questionType);
    const prompt = formatJudgePrompt(template, q.question, q.groundTruth, answerPhase.answer);
    const result = await judge(prompt, config);

    if (result.score === 1) correct++;

    const mark = result.score === 1 ? "✓" : "✗";
    log.dim(`  ${mark} ${q.questionId} [${q.questionType}]: ${result.explanation.slice(0, 70)}`);
    emit({ type: "evaluate_question", questionId: q.questionId, questionType: q.questionType, correct: result.score === 1, explanation: result.explanation, done: evaluations.length + 1, total: questions.length, runningCorrect: correct });

    evaluations.push({
      questionId:       q.questionId,
      questionType:     q.questionType,
      question:         q.question,
      groundTruth:      q.groundTruth,
      hypothesis:       answerPhase.answer,
      score:            result.score,
      label:            result.label,
      explanation:      result.explanation,
      searchResults:    searchPhase?.results ?? [],
      searchDurationMs: searchPhase?.durationMs ?? 0,
      answerDurationMs: answerPhase.durationMs,
    });
  }

  cp.evaluations = evaluations;
  markPhaseComplete(cp, "evaluate");

  const accuracy = ((correct / evaluations.length) * 100).toFixed(1);
  log.success(`Evaluation complete: ${correct}/${evaluations.length} correct (${accuracy}%)`);
}
