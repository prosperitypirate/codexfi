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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Load benchmark/.env.local regardless of CWD ────────────────────────────
// Bun only auto-loads .env from cwd. When run from project root, benchmark/.env.local
// (which has JUDGE_MODEL, ANSWERING_MODEL, ANTHROPIC_API_KEY, etc.) would be missed.
// .env.local follows standard convention: it OVERRIDES root .env values.
const __benchmarkDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const localEnvPath = join(__benchmarkDir, ".env.local");
const loadedFromLocal: Array<{ key: string; masked: string; overrode: boolean }> = [];

if (existsSync(localEnvPath)) {
	const envContent = readFileSync(localEnvPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		const hadPrevious = key in process.env && process.env[key] !== value;
		// .env.local OVERRIDES root .env — this is standard .env.local semantics
		process.env[key] = value;
		const masked = value.length <= 8
			? value
			: `${value.slice(0, 4)}...${value.slice(-4)}`;
		loadedFromLocal.push({ key, masked, overrode: hadPrevious });
	}
}

// ── Verification: always log what benchmark/.env.local provided ─────────────
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

if (loadedFromLocal.length > 0) {
	console.log(`\n${CYAN}${BOLD}── benchmark/.env.local ${"─".repeat(30)}${RESET}`);
	for (const { key, masked, overrode } of loadedFromLocal) {
		const tag = overrode ? `${YELLOW}(overrode root .env)${RESET}` : `${DIM}(set)${RESET}`;
		console.log(`  ${GREEN}${key}${RESET} = ${masked} ${tag}`);
	}
	console.log();
} else {
	console.log(`${RED}WARNING: benchmark/.env.local not found or empty at ${localEnvPath}${RESET}`);
	console.log(`${RED}JUDGE_MODEL, ANSWERING_MODEL, and ANTHROPIC_API_KEY may be incorrect!${RESET}\n`);
}
import { randomBytes } from "node:crypto";

import type { Checkpoint, UnifiedSession, UnifiedQuestion } from "./types.js";
import { loadConfig } from "./utils/config.js";
import { log } from "./utils/logger.js";
import {
  loadCheckpoint,
  saveCheckpoint,
  isPhaseComplete,
  reportPath,
} from "./utils/checkpoint.js";
import { OpencodeMemoryProvider } from "./providers/opencode-memory.js";
import { runIngest }   from "./pipeline/ingest.js";
import { runSearch }   from "./pipeline/search.js";
import { runAnswer }   from "./pipeline/answer.js";
import { runEvaluate } from "./pipeline/evaluate.js";
import { runReport }   from "./pipeline/report.js";
import { activateLiveMode, emit, isLiveMode } from "./live/emitter.js";
import { startLiveServer }                    from "./live/server.js";

const RUNS_DIR = join(import.meta.dir, "../data/runs");

// ── Dataset loading ─────────────────────────────────────────────────────────────

function loadDataset(): { sessions: UnifiedSession[]; questions: UnifiedQuestion[] } {
  const sessionsPath  = join(import.meta.dir, "dataset/sessions.json");
  const questionsPath = join(import.meta.dir, "dataset/questions.json");
  const sessions  = JSON.parse(readFileSync(sessionsPath,  "utf-8")) as UnifiedSession[];
  const questions = JSON.parse(readFileSync(questionsPath, "utf-8")) as UnifiedQuestion[];
  return { sessions, questions };
}

// ── Commands ────────────────────────────────────────────────────────────────────

async function cmdRun(args: string[]): Promise<void> {
  const noCleanup = args.includes("--no-cleanup");
  const ridIdx    = args.indexOf("-r");
  const runId     = ridIdx !== -1 ? args[ridIdx + 1] : randomBytes(4).toString("hex");
  const limitIdx  = args.indexOf("--limit");
  const limit     = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : undefined;

  // Always start the live dashboard — opens browser automatically via server.ts.
  activateLiveMode();
  startLiveServer();

  const config = loadConfig();
  const { sessions: allSessions, questions: allQuestions } = loadDataset();
  const questions = limit ? allQuestions.slice(0, limit) : allQuestions;
  const sessions  = limit ? allSessions.slice(0, limit)  : allSessions;

  const runStartTime = Date.now();

  console.log(`\n  DevMemBench — Coding Assistant Memory Benchmark`);
  console.log(`  ${"─".repeat(48)}`);
  console.log(`  Run ID  : ${runId}`);
  console.log(`  Provider: opencode-memory`);
  console.log(`  Judge   : ${config.judgeModel}`);
  console.log(`  Sessions: ${sessions.length}   Questions: ${questions.length}\n`);

  emit({ type: "run_start", runId, provider: "opencode-memory", judgeModel: config.judgeModel, sessions: sessions.length, questions: questions.length });

  // Load or create checkpoint
  let cp = loadCheckpoint(runId);
  if (cp) {
    log.info(`Resuming run ${runId} (completed phases: ${cp.completedPhases.join(", ")})`);
  } else {
    cp = {
      runId,
      runTag: `bench_devmem_${runId}`,
      provider: "opencode-memory",
      judgeModel: config.judgeModel,
      answeringModel: config.answeringModel,
      startedAt: new Date().toISOString(),
      completedPhases: [],
    };
    saveCheckpoint(cp);
  }

  const provider = new OpencodeMemoryProvider();
  await provider.initialize();

  // ── Pipeline ──────────────────────────────────────────────────────────────────

  if (!isPhaseComplete(cp, "ingest")) {
    emit({ type: "phase_start", phase: "ingest" });
    await runIngest(provider, sessions, cp);
  } else {
    log.info("Skipping ingest (already complete)");
  }

  if (!isPhaseComplete(cp, "search")) {
    emit({ type: "phase_start", phase: "search" });
    await runSearch(provider, questions, cp);
  } else {
    log.info("Skipping search (already complete)");
  }

  if (!isPhaseComplete(cp, "answer")) {
    emit({ type: "phase_start", phase: "answer" });
    await runAnswer(questions, cp, config);
  } else {
    log.info("Skipping answer (already complete)");
  }

  if (!isPhaseComplete(cp, "evaluate")) {
    emit({ type: "phase_start", phase: "evaluate" });
    await runEvaluate(questions, cp, config);
  } else {
    log.info("Skipping evaluate (already complete)");
  }

  // Record total run duration (before report so it's included in report.json)
  const totalDurationMs = Date.now() - runStartTime;
  cp.completedAt = new Date().toISOString();
  cp.totalDurationMs = totalDurationMs;
  saveCheckpoint(cp);

  if (!isPhaseComplete(cp, "report")) {
    runReport(cp);
  } else {
    log.info("Skipping report (already complete)");
  }

  // Emit final score
  if (cp.evaluations) {
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

  if (!noCleanup) {
    emit({ type: "phase_start", phase: "cleanup" });
    log.phase("CLEANUP");
    await provider.clear(cp.runTag);
  } else {
    log.warn("Skipping cleanup (--no-cleanup). Memories remain in backend.");
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
    const accuracy = cp.evaluations
      ? `${((cp.evaluations.filter((e) => e.score === 1).length / cp.evaluations.length) * 100).toFixed(1)}%`
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
    bun run bench run                   Full pipeline (ingest → search → answer → evaluate → report)
                                        Live dashboard auto-opens at http://localhost:4242
    bun run bench run -r <id>           Named run (resumes if exists)
    bun run bench run --no-cleanup      Keep ingested memories after run
    bun run bench run --limit <n>       Run only first N questions
    bun run bench status -r <id>        Check run progress
    bun run bench serve -r <id>         Open results dashboard in browser
    bun run bench list                  List all runs

  Environment variables:
    MEMORY_BACKEND_URL   Backend URL (default: http://localhost:8020)
    ANTHROPIC_API_KEY    Anthropic API key (for Claude judge)
    OPENAI_API_KEY       OpenAI API key (for GPT judge)
    JUDGE_MODEL          Override judge model
    ANSWERING_MODEL      Override answering model
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
