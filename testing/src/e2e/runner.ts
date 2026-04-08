#!/usr/bin/env bun
/**
 * runner.ts — main entry point for the codexfi e2e test suite
 *
 * Usage:
 *   bun run src/e2e/runner.ts                  — run all scenarios
 *   bun run src/e2e/runner.ts --scenario 01,03 — run specific scenarios
 *
 * The live dashboard opens automatically at http://localhost:4243
 *
 * Prerequisites:
 *   - opencode installed: bun install -g opencode-ai
 *   - VOYAGE_API_KEY set (for embeddings)
 *   - ANTHROPIC_API_KEY or XAI_API_KEY set (for extraction)
 *   - plugin built: cd plugin && bun run build
 */

import { isBackendReady } from "./memory-api.js";
import { printResult, printSummary, saveResults, printDetailedReport, type ScenarioResult } from "./report.js";
import { activateLiveMode, emit, type RunCompleteResult } from "./live/emitter.js";
import { startLiveServer } from "./live/server.js";
import { setCurrentScenario as setScenarioInOpencode } from "./opencode.js";
import { setCurrentScenario as setScenarioInMemoryApi } from "./memory-api.js";
import { run as run01 } from "./scenarios/01-cross-session.js";
import { run as run02 } from "./scenarios/02-readme-seeding.js";
import { run as run03 } from "./scenarios/03-transcript-noise.js";
import { run as run04 } from "./scenarios/04-project-brief-always.js";
import { run as run05 } from "./scenarios/05-memory-aging.js";
import { run as run06 } from "./scenarios/06-existing-codebase.js";
import { run as run07 } from "./scenarios/07-enumeration-retrieval.js";
import { run as run08 } from "./scenarios/08-cross-synthesis.js";
import { run as run09 } from "./scenarios/09-max-memories.js";
import { run as run10 } from "./scenarios/10-knowledge-update.js";
import { run as run11 } from "./scenarios/11-system-prompt-injection.js";
import { run as run12 } from "./scenarios/12-multi-turn-refresh.js";
import { run as run13 } from "./scenarios/13-auto-init-turn1.js";
import { run as run14 } from "./scenarios/14-active-context-singleton.js";
import { run as run15 } from "./scenarios/15-recent-sessions-three.js";

const BOLD  = "\x1b[1m";
const CYAN  = "\x1b[36m";
const DIM   = "\x1b[2m";
const RED   = "\x1b[31m";
const RESET = "\x1b[0m";

/** Scenario name lookup — used by runner to emit scenario_start with name */
const SCENARIO_NAMES: Record<string, string> = {
  "01": "Cross-Session Memory Continuity",
  "02": "README-Based Project-Brief Seeding",
  "03": "Transcript Noise Guard",
  "04": "Project Brief Always Present",
  "05": "Memory Aging",
  "06": "Existing Codebase Auto-Init",
  "07": "Enumeration Hybrid Retrieval",
  "08": "Cross-Synthesis",
  "09": "maxMemories=20 Under Load",
  "10": "Knowledge Update / Superseded",
  "11": "System Prompt Injection",
  "12": "Multi-Turn Refresh",
  "13": "Auto-Init Turn 1",
  "14": "Active-Context Singleton Aging",
  "15": "Recent Sessions Shows Last 3 Summaries",
};

const ALL_SCENARIOS: Array<{ id: string; fn: () => Promise<ScenarioResult> }> = [
  { id: "01", fn: run01 },
  { id: "02", fn: run02 },
  { id: "03", fn: run03 },
  { id: "04", fn: run04 },
  { id: "05", fn: run05 },
  { id: "06", fn: run06 },
  { id: "07", fn: run07 },
  { id: "08", fn: run08 },
  { id: "09", fn: run09 },
  { id: "10", fn: run10 },
  { id: "11", fn: run11 },
  { id: "12", fn: run12 },
  { id: "13", fn: run13 },
  { id: "14", fn: run14 },
  { id: "15", fn: run15 },
];

async function main() {
  console.log();
  console.log(`${BOLD}${CYAN}codexfi E2E Test Suite${RESET}`);
  console.log(`${DIM}Running automated memory system tests against a live opencode agent${RESET}`);
  console.log();

  // ── Start live dashboard ────────────────────────────────────────────────────
  activateLiveMode();
  startLiveServer();
  console.log();

  // ── Preflight checks ────────────────────────────────────────────────────────
  console.log("Preflight checks…");

  const backendReady = await isBackendReady();
  if (!backendReady) {
    console.error(`${RED}✗ Embedded memory store failed to initialize${RESET}`);
    console.error("  Check that VOYAGE_API_KEY is set and the store is accessible");
    process.exit(1);
  }
  console.log("  ✓ Embedded memory store ready");

  // Verify opencode CLI is available
  const probe = Bun.spawn(["opencode", "--version"], {
    env: { ...process.env, OPENCODE_SERVER_PASSWORD: undefined! },
    stdout: "pipe", stderr: "pipe",
  });
  await probe.exited;
  const ver = await new Response(probe.stdout).text();
  if (probe.exitCode !== 0) {
    console.error(`${RED}✗ opencode CLI not found. Install: bun install -g opencode-ai${RESET}`);
    process.exit(1);
  }
  console.log(`  ✓ opencode ${ver.trim()} available`);
  console.log();

  // ── Scenario filter ─────────────────────────────────────────────────────────
  const args = process.argv.slice(2);
  const filterIdx = args.indexOf("--scenario");
  let scenariosToRun = ALL_SCENARIOS;
  let filterLabel: string | undefined;
  if (filterIdx !== -1 && args[filterIdx + 1]) {
    const ids = args[filterIdx + 1].split(",").map((s) => s.trim());
    scenariosToRun = ALL_SCENARIOS.filter((s) => ids.includes(s.id));
    filterLabel = ids.join(",");
    console.log(`${DIM}Running scenarios: ${ids.join(", ")}${RESET}`);
    console.log();
  }

  // ── Emit run_start ──────────────────────────────────────────────────────────
  emit({ type: "run_start", total: scenariosToRun.length, filter: filterLabel });

  console.log(`${BOLD}Running ${scenariosToRun.length} scenario(s)…${RESET}`);
  console.log();

  const results: ScenarioResult[] = [];
  const runStart = Date.now();

  for (let i = 0; i < scenariosToRun.length; i++) {
    const { id, fn } = scenariosToRun[i];
    const scenarioName = SCENARIO_NAMES[id] ?? `Scenario ${id}`;

    // Set current scenario context for live emitters in shared modules
    setScenarioInOpencode(id);
    setScenarioInMemoryApi(id);

    // Emit scenario_start
    emit({
      type: "scenario_start",
      id,
      name: scenarioName,
      index: i + 1,
      total: scenariosToRun.length,
    });

    console.log(`${BOLD}▶ Scenario ${id}${RESET}`);
    const result = await fn();
    results.push(result);
    printResult(result);

    // Emit assertion events by parsing the details lines
    for (const line of result.details) {
      if (line.includes("[✓]")) {
        emit({ type: "scenario_assertion", id, label: line.replace(/\s*\[✓\]\s*/, "").trim(), pass: true });
      } else if (line.includes("[✗]")) {
        emit({ type: "scenario_assertion", id, label: line.replace(/\s*\[✗\]\s*/, "").trim(), pass: false });
      }
    }

    // Emit scenario_end
    emit({
      type: "scenario_end",
      id,
      name: result.name,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
      memoriesCount: result.evidence?.memoriesCount as number | undefined,
    });

    // ── Shutdown server + cleanup test memories ─────────────────────────────
    if (result.testDirs && result.testDirs.length > 0) {
      const { shutdownServer } = await import("./opencode.js");
      const { cleanupTestDirs } = await import("./memory-api.js");
      const { refresh: refreshTable } = await import("../../../plugin/src/db.js");
      // Shut down any cached servers for this scenario's directories
      for (const dir of result.testDirs) {
        await shutdownServer(dir);
      }
      // Wait for file locks to release, refresh table handle, then clean up
      await Bun.sleep(2_000);
      await refreshTable();
      const deleted = await cleanupTestDirs(result.testDirs);
      emit({ type: "cleanup", id, deleted });
      console.log(`       ${DIM}  ✓ Cleaned up ${deleted} test memories from embedded store${RESET}`);
    }
    console.log();
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  printSummary(results);
  printDetailedReport(results);
  saveResults(results);

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status !== "PASS").length;
  const totalMs = Date.now() - runStart;

  // Build per-scenario results for the final event
  const completeResults: RunCompleteResult[] = results.map((r) => {
    const assertions = r.details
      .filter((d) => d.includes("[✓]") || d.includes("[✗]"))
      .map((d) => ({
        label: d.replace(/\s*\[✓\]\s*/, "").replace(/\s*\[✗\]\s*/, ""),
        pass: d.includes("[✓]"),
      }));
    return {
      id: r.id,
      name: r.name,
      status: r.status,
      durationMs: r.durationMs,
      error: r.error,
      assertions: assertions.length > 0 ? assertions : undefined,
    };
  });

  emit({
    type: "run_complete",
    passed,
    failed,
    total: results.length,
    durationMs: totalMs,
    results: completeResults,
  });

  // Keep the server alive briefly so the browser receives the final event
  await Bun.sleep(1500);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
