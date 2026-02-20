import { writeFileSync } from "node:fs";
import type { Checkpoint, BenchmarkReport, QuestionTypeStats } from "../types.js";
import { QUESTION_TYPES } from "../types.js";
import { markPhaseComplete, reportPath } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";

export function runReport(cp: Checkpoint): BenchmarkReport {
  log.phase("REPORT");

  if (!cp.evaluations) throw new Error("Evaluate phase must complete before report");

  const evals = cp.evaluations;
  const totalQuestions = evals.length;
  const correctCount = evals.filter((e) => e.score === 1).length;
  const accuracy = correctCount / totalQuestions;

  // Per-type breakdown
  const byQuestionType: Record<string, QuestionTypeStats> = {};

  for (const type of Object.keys(QUESTION_TYPES)) {
    const typeEvals = evals.filter((e) => e.questionType === type);
    if (typeEvals.length === 0) continue;
    const typeCorrect = typeEvals.filter((e) => e.score === 1).length;
    byQuestionType[type] = {
      total:    typeEvals.length,
      correct:  typeCorrect,
      accuracy: typeCorrect / typeEvals.length,
    };
  }

  const report: BenchmarkReport = {
    runId:          cp.runId,
    provider:       cp.provider,
    judgeModel:     cp.judgeModel,
    answeringModel: cp.answeringModel,
    timestamp:      new Date().toISOString(),
    summary: { totalQuestions, correctCount, accuracy },
    byQuestionType,
    evaluations:    evals,
  };

  // Save report.json
  const path = reportPath(cp.runId);
  writeFileSync(path, JSON.stringify(report, null, 2));
  markPhaseComplete(cp, "report");

  // Print summary table
  log.success(`\nRun: ${cp.runId}`);
  console.log(`\n  Overall accuracy: ${(accuracy * 100).toFixed(1)}%  (${correctCount}/${totalQuestions})\n`);
  console.log("  By category:");

  const rows = Object.entries(byQuestionType).sort((a, b) =>
    b[1].accuracy - a[1].accuracy
  );
  for (const [type, stats] of rows) {
    const bar = makeBar(stats.accuracy, 20);
    const pct = (stats.accuracy * 100).toFixed(0).padStart(3);
    const alias = (QUESTION_TYPES as Record<string, { alias: string }>)[type]?.alias ?? type;
    console.log(`  ${alias.padEnd(12)} ${bar} ${pct}%  (${stats.correct}/${stats.total})`);
  }

  console.log(`\n  Report saved to: ${path}`);
  console.log(`  Open the dashboard: bun run bench serve -r ${cp.runId}\n`);

  return report;
}

function makeBar(ratio: number, width: number): string {
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
