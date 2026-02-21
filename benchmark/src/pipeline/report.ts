import { writeFileSync } from "node:fs";
import type {
  Checkpoint,
  BenchmarkReport,
  QuestionTypeStats,
  LatencyStats,
  AggregateRetrievalStats,
} from "../types.js";
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

  // ── Latency stats ──────────────────────────────────────────────────────────
  const searchMs  = evals.map((e) => e.searchDurationMs).filter(Boolean);
  const answerMs  = evals.map((e) => e.answerDurationMs).filter(Boolean);
  // evaluate latency not tracked per-question yet; use 0 as placeholder
  const evalMs    = new Array(evals.length).fill(0) as number[];

  const latency = {
    search:   calcLatencyStats(searchMs),
    answer:   calcLatencyStats(answerMs),
    evaluate: calcLatencyStats(evalMs),
  };

  // ── Retrieval metrics ──────────────────────────────────────────────────────
  const evalsWithRetrieval = evals.filter((e) => e.retrievalMetrics != null);
  const retrieval = evalsWithRetrieval.length > 0
    ? aggregateRetrieval(evalsWithRetrieval.map((e) => e.retrievalMetrics!))
    : undefined;

  const retrievalByType: Record<string, AggregateRetrievalStats> = {};
  for (const type of Object.keys(QUESTION_TYPES)) {
    const typeEvalsR = evalsWithRetrieval.filter((e) => e.questionType === type);
    if (typeEvalsR.length > 0) {
      retrievalByType[type] = aggregateRetrieval(typeEvalsR.map((e) => e.retrievalMetrics!));
    }
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
    latency,
    retrieval,
    retrievalByType: Object.keys(retrievalByType).length > 0 ? retrievalByType : undefined,
  };

  // Save report.json
  const path = reportPath(cp.runId);
  writeFileSync(path, JSON.stringify(report, null, 2));
  markPhaseComplete(cp, "report");

  // ── Print summary table ────────────────────────────────────────────────────
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

  // ── Retrieval summary ──────────────────────────────────────────────────────
  if (retrieval) {
    console.log(`\n  Retrieval quality (K=${retrieval.k}):`);
    console.log(`  ${"Hit@K".padEnd(12)} ${makeBar(retrieval.hitAtK, 20)} ${(retrieval.hitAtK * 100).toFixed(0).padStart(3)}%`);
    console.log(`  ${"Precision@K".padEnd(12)} ${makeBar(retrieval.precisionAtK, 20)} ${(retrieval.precisionAtK * 100).toFixed(0).padStart(3)}%`);
    console.log(`  ${"MRR".padEnd(12)} ${retrieval.mrr.toFixed(3)}`);
    console.log(`  ${"NDCG".padEnd(12)} ${retrieval.ndcg.toFixed(3)}`);
  }

  // ── Latency summary ────────────────────────────────────────────────────────
  if (searchMs.length > 0) {
    console.log(`\n  Latency (ms)          min   mean  median   p95    p99`);
    printLatency("search", latency.search);
    printLatency("answer", latency.answer);
  }

  console.log(`\n  Report saved to: ${path}`);
  console.log(`  Open the dashboard: bun run bench serve -r ${cp.runId}\n`);

  return report;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBar(ratio: number, width: number): string {
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function printLatency(label: string, s: LatencyStats): void {
  if (s.count === 0) return;
  console.log(
    `  ${label.padEnd(20)}` +
    `${String(Math.round(s.min)).padStart(5)}` +
    `${String(Math.round(s.mean)).padStart(7)}` +
    `${String(Math.round(s.median)).padStart(8)}` +
    `${String(Math.round(s.p95)).padStart(6)}` +
    `${String(Math.round(s.p99)).padStart(7)}`
  );
}

function calcLatencyStats(values: number[]): LatencyStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const percentile = (p: number) => sorted[Math.min(Math.floor(p * n), n - 1)];
  return {
    min:    sorted[0],
    max:    sorted[n - 1],
    mean,
    median: percentile(0.5),
    p95:    percentile(0.95),
    p99:    percentile(0.99),
    count:  n,
  };
}

function aggregateRetrieval(
  metrics: Array<{ hitAtK: number; precisionAtK: number; f1AtK: number; mrr: number; ndcg: number; k: number }>
): AggregateRetrievalStats {
  const n = metrics.length;
  const avg = (key: keyof typeof metrics[0]) =>
    metrics.reduce((s, m) => s + (m[key] as number), 0) / n;
  return {
    hitAtK:       avg("hitAtK"),
    precisionAtK: avg("precisionAtK"),
    f1AtK:        avg("f1AtK"),
    mrr:          avg("mrr"),
    ndcg:         avg("ndcg"),
    k:            metrics[0].k,
  };
}
