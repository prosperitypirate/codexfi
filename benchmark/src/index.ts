#!/usr/bin/env bun
/**
 * DevMemBench — Coding Assistant Memory Benchmark
 *
 * Usage:
 *   bun run bench run                   # full pipeline
 *   bun run bench run --no-cleanup      # keep memories after run (for debugging)
 *   bun run bench run -r my-run-id      # named run (resumes if exists)
 *   bun run bench status -r my-run-id   # check run progress
 *   bun run bench serve -r my-run-id    # open results in browser
 *   bun run bench list                  # list all runs
 */

import "./env-preload.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { randomBytes } from "node:crypto";

import { MB_CONDITIONS, type Checkpoint, type MbCondition, type UnifiedSession, type UnifiedQuestion } from "./types.js";
import { loadConfig } from "./utils/config.js";
import { log } from "./utils/logger.js";
import {
  loadCheckpoint,
  saveCheckpoint,
  isPhaseComplete,
  markPhaseComplete,
  reportPath,
} from "./utils/checkpoint.js";
import { OpencodeMemoryProvider } from "./providers/codexfi.js";
import { runIngest }        from "./pipeline/ingest.js";
import { runSearch }        from "./pipeline/search.js";
import { runBlockAssembly } from "./pipeline/block-quality.js";
import { runAnswer }        from "./pipeline/answer.js";
import { runEvaluate }      from "./pipeline/evaluate.js";
import { runReport }        from "./pipeline/report.js";
import { runMemoryBankBuild } from "./pipeline/mb-build.js";
import { runMbContexts, runMbAnswer, runMbEvaluate, needsBank, needsCodexfi } from "./pipeline/mb-conditions.js";
import { runMbReport }      from "./pipeline/mb-report.js";
import { cliCwd }           from "./llm/backend.js";
import * as engineConfig    from "../../plugin/src/config.js";
import { activateLiveMode, emit, isLiveMode } from "./live/emitter.js";
import { startLiveServer }                    from "./live/server.js";

const RUNS_DIR = join(import.meta.dir, "../data/runs");

// ── Dataset loading ─────────────────────────────────────────────────────────────

type DatasetId = "v1" | "v2";
const DATASET_DIRS: Record<DatasetId, string> = { v1: "dataset", v2: "dataset-v2" };

function loadDataset(id: DatasetId): { sessions: UnifiedSession[]; questions: UnifiedQuestion[] } {
  const dir = join(import.meta.dir, DATASET_DIRS[id]);
  const sessionsPath  = join(dir, "sessions.json");
  const questionsPath = join(dir, "questions.json");
  for (const p of [sessionsPath, questionsPath]) {
    if (!existsSync(p)) {
      throw new Error(`Dataset ${id} not found: ${p} is missing (expected ${DATASET_DIRS[id]}/sessions.json + questions.json under benchmark/src/)`);
    }
  }
  const sessions  = JSON.parse(readFileSync(sessionsPath,  "utf-8")) as UnifiedSession[];
  const questions = JSON.parse(readFileSync(questionsPath, "utf-8")) as UnifiedQuestion[];
  return { sessions, questions };
}

// ── Commands ────────────────────────────────────────────────────────────────────

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

async function cmdRun(args: string[]): Promise<void> {
  const noCleanup  = args.includes("--no-cleanup");
  const skipIngest = args.includes("--skip-ingest");
  const runId      = argValue(args, "-r") ?? randomBytes(4).toString("hex");
  const limitArg   = argValue(args, "--limit");
  const limit      = limitArg ? parseInt(limitArg) : undefined;
  const modeArg    = argValue(args, "--mode") ?? "retrieval";
  if (!["retrieval", "block-quality", "memory-bank"].includes(modeArg)) {
    throw new Error(`Unknown --mode "${modeArg}" (expected retrieval | block-quality | memory-bank)`);
  }
  const mode = modeArg as "retrieval" | "block-quality" | "memory-bank";
  const isBlockQuality = mode === "block-quality";
  const isMemoryBank   = mode === "memory-bank";
  const datasetArg = argValue(args, "--dataset");
  if (datasetArg && datasetArg !== "v1" && datasetArg !== "v2") {
    throw new Error(`Unknown --dataset "${datasetArg}" (expected v1 | v2)`);
  }
  const runTagArg = argValue(args, "--run-tag");
  if (skipIngest && !runTagArg) {
    throw new Error("--skip-ingest requires --run-tag <tag> (an already-ingested tag in the store at CODEXFI_DATA_DIR)");
  }
  const conditionsArg = argValue(args, "--conditions");
  let conditionsReq: MbCondition[] | undefined;
  if (conditionsArg) {
    conditionsReq = conditionsArg.split(",").map((c) => c.trim()).filter(Boolean) as MbCondition[];
    const bad = conditionsReq.filter((c) => !(MB_CONDITIONS as readonly string[]).includes(c));
    if (bad.length) throw new Error(`Unknown condition(s): ${bad.join(", ")} (valid: ${MB_CONDITIONS.join(", ")})`);
  }

  // Live dashboard: default on for retrieval/block-quality (opens browser via server.ts).
  // Off for memory-bank mode (the dashboard doesn't know its phases) or BENCH_NO_LIVE=1.
  if (process.env.BENCH_NO_LIVE !== "1" && !isMemoryBank) {
    activateLiveMode();
    startLiveServer();
  }

  const config = loadConfig();

  // Load or create checkpoint
  let cp = loadCheckpoint(runId);
  const dataset: DatasetId = (cp?.dataset ?? datasetArg ?? "v1") as DatasetId;
  if (cp && datasetArg && (cp.dataset ?? "v1") !== datasetArg) {
    throw new Error(`Run ${runId} was created with --dataset ${cp.dataset ?? "v1"}; cannot resume with --dataset ${datasetArg}`);
  }
  if (cp && (cp.mode ?? "retrieval") !== mode) {
    throw new Error(`Run ${runId} was created with --mode ${cp.mode ?? "retrieval"}; cannot resume with --mode ${mode}`);
  }

  const { sessions: allSessions, questions: allQuestions } = loadDataset(dataset);
  const questions = limit ? allQuestions.slice(0, limit) : allQuestions;
  const sessions  = limit ? allSessions.slice(0, limit)  : allSessions;

  const runStartTime = Date.now();
  const engine = engineConfig as Record<string, unknown>;

  console.log(`\n  DevMemBench — Coding Assistant Memory Benchmark`);
  console.log(`  ${"─".repeat(48)}`);
  console.log(`  Run ID  : ${runId}`);
  console.log(`  Mode    : ${isMemoryBank ? "memory-bank (Memory Bank vs codexfi)" : isBlockQuality ? "block-quality (Tier 2)" : "retrieval (Tier 1)"}`);
  console.log(`  Dataset : ${dataset}`);
  console.log(`  Provider: codexfi  (engine extraction: ${String(engine.EXTRACTION_PROVIDER ?? "?")} / ${String(engine.EXTRACTION_MODEL ?? "?")}, store: ${String(engine.DATA_DIR ?? "?")})`);
  console.log(`  LLM     : ${config.llmBackend}${config.llmBackend === "claude-cli" ? ` (cwd ${cliCwd()})` : ""} · concurrency ${config.concurrency}`);
  console.log(`  Answer  : ${config.answeringModel}`);
  console.log(`  Judge   : ${config.judgeModel}`);
  if (isMemoryBank) console.log(`  MB model: ${config.mbModel}`);
  console.log(`  Sessions: ${sessions.length}   Questions: ${questions.length}\n`);

  emit({ type: "run_start", runId, provider: "codexfi", judgeModel: config.judgeModel, sessions: sessions.length, questions: questions.length });

  if (cp) {
    log.info(`Resuming run ${runId} (completed phases: ${cp.completedPhases.join(", ")})`);
    if (isMemoryBank && conditionsReq && conditionsReq.join(",") !== (cp.mbConditions ?? []).join(",")) {
      throw new Error(`Run ${runId} was created with --conditions ${(cp.mbConditions ?? []).join(",")}; start a new run to change conditions`);
    }
  } else {
    cp = {
      runId,
      runTag: skipIngest ? runTagArg! : `bench_devmem_${runId}`,
      provider: "codexfi",
      judgeModel: config.judgeModel,
      answeringModel: config.answeringModel,
      startedAt: new Date().toISOString(),
      completedPhases: [],
      mode,
      dataset,
      llmBackend: config.llmBackend,
      ...(skipIngest ? { skipIngest: true } : {}),
      ...(isMemoryBank ? { mbConditions: conditionsReq ?? [...MB_CONDITIONS] } : {}),
    };
    saveCheckpoint(cp);
  }

  const provider = new OpencodeMemoryProvider();
  await provider.initialize();

  // ── Pipeline ──────────────────────────────────────────────────────────────────

  const wantIngest = !isMemoryBank || needsCodexfi(cp.mbConditions ?? []);
  if (cp.skipIngest && !isPhaseComplete(cp, "ingest")) {
    log.warn(`Skipping ingest (--skip-ingest): reusing existing run tag ${cp.runTag}`);
    markPhaseComplete(cp, "ingest");
  }
  const ingestTask = async (): Promise<void> => {
    if (!wantIngest) {
      log.info("Skipping ingest (no codexfi condition selected)");
    } else if (!isPhaseComplete(cp, "ingest")) {
      emit({ type: "phase_start", phase: "ingest" });
      await runIngest(provider, sessions, cp);
    } else {
      log.info("Skipping ingest (already complete)");
    }
  };
  // In memory-bank mode the bank build (LLM "save bank" per session) and the
  // codexfi ingest are independent — run them concurrently to halve wall time.
  if (isMemoryBank && needsBank(cp.mbConditions ?? []) && !isPhaseComplete(cp, "mb-build")) {
    await Promise.all([ingestTask(), runMemoryBankBuild(sessions, cp, config)]);
  } else {
    await ingestTask();
  }

  if (isMemoryBank) {
    await runMemoryBankPipeline(questions, sessions, cp, config);
  } else {
    if (isBlockQuality) {
      // Block-quality mode: assemble [MEMORY] block per question instead of search
      if (!isPhaseComplete(cp, "block-assembly")) {
        emit({ type: "phase_start", phase: "block-assembly" });
        await runBlockAssembly(questions, cp);
      } else {
        log.info("Skipping block assembly (already complete)");
      }
    } else {
      // Standard retrieval mode: per-question semantic search
      if (!isPhaseComplete(cp, "search")) {
        emit({ type: "phase_start", phase: "search" });
        await runSearch(provider, questions, cp);
      } else {
        log.info("Skipping search (already complete)");
      }
    }

    if (!isPhaseComplete(cp, "answer")) {
      emit({ type: "phase_start", phase: "answer" });
      await runAnswer(questions, cp, config, isBlockQuality ? { blockOnly: true } : undefined);
    } else {
      log.info("Skipping answer (already complete)");
    }

    if (!isPhaseComplete(cp, "evaluate")) {
      emit({ type: "phase_start", phase: "evaluate" });
      await runEvaluate(questions, cp, config);
    } else {
      log.info("Skipping evaluate (already complete)");
    }
  }

  // Record total run duration (before report so it's included in report.json)
  const totalDurationMs = Date.now() - runStartTime;
  cp.completedAt = new Date().toISOString();
  cp.totalDurationMs = totalDurationMs;
  saveCheckpoint(cp);

  if (isMemoryBank) {
    runMbReport(cp, questions);
  } else if (!isPhaseComplete(cp, "report")) {
    runReport(cp);
  } else {
    log.info("Skipping report (already complete)");
  }

  // Emit final score
  if (cp.evaluations && !isMemoryBank) {
    const correct = cp.evaluations.filter(e => e.score === 1).length;
    const total   = cp.evaluations.length;
    const byType: Record<string, { correct: number; total: number }> = {};
    for (const e of cp.evaluations) {
      if (!byType[e.questionType]) byType[e.questionType] = { correct: 0, total: 0 };
      byType[e.questionType].total++;
      if (e.score === 1) byType[e.questionType].correct++;
    }
    emit({ type: "run_complete", accuracy: correct / total, correct, total, byType, durationMs: totalDurationMs });

    // Print retrieval summary to terminal if metrics are available
    const evalsWithR = cp.evaluations.filter(e => e.retrievalMetrics != null);
    if (evalsWithR.length > 0) {
      const n = evalsWithR.length;
      const avg = (key: keyof NonNullable<typeof evalsWithR[0]["retrievalMetrics"]>) =>
        evalsWithR.reduce((s, e) => s + (e.retrievalMetrics![key] as number), 0) / n;
      const k = evalsWithR[0].retrievalMetrics!.k;
      console.log(`  Retrieval (K=${k}, n=${n}):`);
      console.log(`    Hit@${k}:       ${(avg("hitAtK") * 100).toFixed(1)}%`);
      console.log(`    Precision@${k}: ${(avg("precisionAtK") * 100).toFixed(1)}%`);
      console.log(`    F1@${k}:        ${(avg("f1AtK") * 100).toFixed(1)}%`);
      console.log(`    MRR:           ${avg("mrr").toFixed(3)}`);
      console.log(`    NDCG:          ${avg("ndcg").toFixed(3)}`);
      console.log();
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  if (cp.skipIngest) {
    log.warn(`Skipping cleanup: run tag ${cp.runTag} was not ingested by this run (--skip-ingest).`);
  } else if (!wantIngest) {
    // nothing was ingested
  } else if (!noCleanup) {
    emit({ type: "phase_start", phase: "cleanup" });
    log.phase("CLEANUP");
    await provider.clear(cp.runTag);
  } else {
    log.warn(`Skipping cleanup (--no-cleanup). Memories remain in backend under run tag ${cp.runTag}.`);
  }

  emit({ type: "phase_start", phase: "done" });

  if (isLiveMode()) {
    // Give SSE clients time to receive the final event, then exit cleanly.
    // Without this, Bun.serve keeps the process alive and the browser reconnects
    // indefinitely, replaying history on every reconnect.
    await new Promise((r) => setTimeout(r, 1500));
    process.exit(0);
  }
}

async function runMemoryBankPipeline(
  questions: UnifiedQuestion[],
  sessions: UnifiedSession[],
  cp: Checkpoint,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const conditions = cp.mbConditions!;
  log.info(`Conditions: ${conditions.join(", ")}`);

  if (needsBank(conditions)) {
    if (!isPhaseComplete(cp, "mb-build")) await runMemoryBankBuild(sessions, cp, config);
    else log.info("Skipping mb-build (already complete)");
  }
  if (!isPhaseComplete(cp, "mb-contexts")) await runMbContexts(questions, sessions, cp, config);
  else log.info("Skipping mb-contexts (already complete)");
  if (!isPhaseComplete(cp, "mb-answer")) await runMbAnswer(questions, sessions, cp, config);
  else log.info("Skipping mb-answer (already complete)");
  if (!isPhaseComplete(cp, "mb-evaluate")) await runMbEvaluate(questions, cp, config);
  else log.info("Skipping mb-evaluate (already complete)");
}

function cmdStatus(args: string[]): void {
  const ridIdx = args.indexOf("-r");
  if (ridIdx === -1) { log.error("Usage: bench status -r <run-id>"); return; }
  const runId = args[ridIdx + 1];
  const cp = loadCheckpoint(runId);
  if (!cp) { log.error(`Run ${runId} not found`); return; }

  console.log(`\n  Run: ${runId}`);
  console.log(`  Started: ${cp.startedAt}`);
  if (cp.completedAt) console.log(`  Completed: ${cp.completedAt}`);
  if (cp.totalDurationMs) {
    const secs = cp.totalDurationMs / 1000;
    const mins = Math.floor(secs / 60);
    const remSecs = Math.round(secs % 60);
    console.log(`  Duration: ${mins}m ${remSecs}s`);
  }
  console.log(`  Completed phases: ${cp.completedPhases.join(" → ") || "(none)"}`);
  if (cp.ingestResult) {
    console.log(`  Memories: ${cp.ingestResult.memoriesAdded} added, ${cp.ingestResult.memoriesUpdated} updated`);
  }
  if (cp.evaluations) {
    const correct = cp.evaluations.filter((e) => e.score === 1).length;
    console.log(`  Accuracy: ${correct}/${cp.evaluations.length}`);
  }
  if (cp.mode === "memory-bank") {
    console.log(`  Dataset: ${cp.dataset ?? "v1"}   Conditions: ${(cp.mbConditions ?? []).join(", ")}`);
    if (cp.memoryBank) console.log(`  Bank updates applied: ${cp.memoryBank.applied.length}`);
    for (const [c, evals] of Object.entries(cp.mbEvaluations ?? {})) {
      const es = Object.values(evals ?? {});
      console.log(`  ${c.padEnd(14)} ${es.filter((e) => e.score === 1).length}/${es.length}`);
    }
  }
  console.log();
}

function cmdServe(args: string[]): void {
  const ridIdx = args.indexOf("-r");
  if (ridIdx === -1) { log.error("Usage: bench serve -r <run-id>"); return; }
  const runId = args[ridIdx + 1];
  const rPath = reportPath(runId);
  if (!existsSync(rPath)) {
    log.error(`Report not found for run ${runId}. Run the benchmark first.`);
    return;
  }

  const uiPath = join(import.meta.dir, "../ui/index.html");
  const reportData = readFileSync(rPath, "utf-8");

  // Inject report data into the HTML and serve
  const html = readFileSync(uiPath, "utf-8").replace(
    "/* __REPORT_DATA__ */",
    `const REPORT_DATA = ${reportData};`
  );

  Bun.serve({
    port: 4242,
    fetch(req) {
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    },
  });

  log.success(`Dashboard running at http://localhost:4242`);
  log.info("Press Ctrl+C to stop");
}

function cmdList(): void {
  if (!existsSync(RUNS_DIR)) { log.info("No runs yet."); return; }
  const runs = readdirSync(RUNS_DIR);
  if (runs.length === 0) { log.info("No runs yet."); return; }

  console.log("\n  Runs:\n");
  for (const runId of runs.sort().reverse()) {
    const cp = loadCheckpoint(runId);
    if (!cp) continue;
    const hasReport = existsSync(reportPath(runId));
    const mbEval = cp.mode === "memory-bank" ? Object.values(cp.mbEvaluations?.["mb+codexfi"] ?? {}) : [];
    const accuracy = cp.evaluations
      ? `${((cp.evaluations.filter((e) => e.score === 1).length / cp.evaluations.length) * 100).toFixed(1)}%`
      : mbEval.length > 0
        ? `mb+cfx ${((mbEval.filter((e) => e.score === 1).length / mbEval.length) * 100).toFixed(1)}%`
        : "(incomplete)";
    const duration = cp.totalDurationMs
      ? `${Math.floor(cp.totalDurationMs / 60000)}m ${Math.round((cp.totalDurationMs % 60000) / 1000)}s`
      : "";
    console.log(`  ${runId.padEnd(20)} ${cp.completedPhases.at(-1)?.padEnd(10) ?? "started".padEnd(10)} ${accuracy.padEnd(12)} ${duration.padEnd(8)} ${hasReport ? "✓ report" : ""}`);
  }
  console.log();
}

function printHelp(): void {
  console.log(`
  DevMemBench — Coding Assistant Memory Benchmark

  Usage:
    bun run bench run                        Full pipeline (Tier 1: retrieval mode)
                                             Live dashboard auto-opens at http://localhost:4242
    bun run bench run --mode block-quality   Tier 2: block-quality evaluation
                                             (ingest → block-assembly → answer → evaluate → report)
    bun run bench run -r <id>                Named run (resumes if exists)
    bun run bench run --no-cleanup           Keep ingested memories after run
    bun run bench run --limit <n>            Run only first N questions (and first N sessions)
    bun run bench run --dataset v1|v2        Dataset (v1 = src/dataset/, v2 = src/dataset-v2/)
    bun run bench run --mode memory-bank     Memory Bank vs codexfi experiment
          [--conditions a,b,c]               no-memory,mb-only,codexfi-only,mb+codexfi,full-context (default all)
    bun run bench run --skip-ingest --run-tag <tag>
                                             Reuse an already-ingested run tag (no ingest, no cleanup)
    bun run bench status -r <id>             Check run progress
    bun run bench serve -r <id>              Open results dashboard in browser
    bun run bench list                       List all runs

  Modes:
    retrieval      (default) Tier 1: per-question semantic search → answer
    block-quality  Tier 2: assembled [MEMORY] block as system context → answer
                   Measures how well the formatted block serves an agent.
                   Use before/after plugin changes to measure presentation quality.
    memory-bank    Does codexfi add value on top of a Memory Bank? Builds a simulated
                   6-file bank per project ("save bank" after each session), then
                   answers every question under each condition and reports deltas.

  Environment variables:
    MEMORY_BACKEND_URL   Backend URL (default: http://localhost:8020)
    ANTHROPIC_API_KEY    Anthropic API key (for Claude judge)
    OPENAI_API_KEY       OpenAI API key (for GPT judge)
    JUDGE_MODEL          Override judge model
    ANSWERING_MODEL      Override answering model
    BENCH_LLM_BACKEND    api (default) | claude-cli (headless \`claude -p\`, subscription)
    BENCH_CONCURRENCY    Parallel answer/judge calls (default 4)
    BENCH_NO_LIVE=1      Don't start the live dashboard
    MB_MODEL             Memory Bank maintainer model (default claude-sonnet-4-6)
    BENCH_FULL_CONTEXT_MAX_CHARS  full-context condition cap (default 600000)
  `);
}

// ── Main ────────────────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "run":    await cmdRun(rest); break;
  case "status": cmdStatus(rest);    break;
  case "serve":  cmdServe(rest);     break;
  case "list":   cmdList();          break;
  default:       printHelp();
}
