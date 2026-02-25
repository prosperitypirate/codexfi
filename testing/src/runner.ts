#!/usr/bin/env bun
/**
 * runner.ts — main entry point for the opencode-memory e2e test suite
 *
 * Usage:
 *   bun run src/runner.ts             — run all scenarios
 *   bun run src/runner.ts --scenario 01,03  — run specific scenarios
 *
 * Prerequisites:
 *   - opencode installed: bun install -g opencode-ai
 *   - VOYAGE_API_KEY set (for embeddings)
 *   - ANTHROPIC_API_KEY or XAI_API_KEY set (for extraction)
 *   - plugin-v2 built: cd plugin-v2 && bun run build
 */

import { isBackendReady } from "./memory-api.js";
import { printResult, printSummary, saveResults, printDetailedReport, type ScenarioResult } from "./report.js";
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

const BOLD  = "\x1b[1m";
const CYAN  = "\x1b[36m";
const DIM   = "\x1b[2m";
const RED   = "\x1b[31m";
const RESET = "\x1b[0m";

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
];

async function main() {
  console.log();
  console.log(`${BOLD}${CYAN}opencode-memory E2E Test Suite${RESET}`);
  console.log(`${DIM}Running automated memory system tests against a live opencode agent${RESET}`);
  console.log();

  // ── Preflight checks ────────────────────────────────────────────────────────
  console.log("Preflight checks…");

  const backendReady = await isBackendReady();
  if (!backendReady) {
    console.error(`${RED}✗ Embedded memory store failed to initialize${RESET}`);
    console.error("  Check that VOYAGE_API_KEY is set and LanceDB is working");
    process.exit(1);
  }
  console.log("  ✓ Embedded memory store ready (LanceDB)");

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
  if (filterIdx !== -1 && args[filterIdx + 1]) {
    const ids = args[filterIdx + 1].split(",").map((s) => s.trim());
    scenariosToRun = ALL_SCENARIOS.filter((s) => ids.includes(s.id));
    console.log(`${DIM}Running scenarios: ${ids.join(", ")}${RESET}`);
    console.log();
  }

  // ── Run scenarios ───────────────────────────────────────────────────────────
  console.log(`${BOLD}Running ${scenariosToRun.length} scenario(s)…${RESET}`);
  console.log();

  const results: ScenarioResult[] = [];

  for (const { id, fn } of scenariosToRun) {
    console.log(`${BOLD}▶ Scenario ${id}${RESET}`);
    const result = await fn();
    results.push(result);
    printResult(result);

    // ── Shutdown server + cleanup test memories ─────────────────────────────
    if (result.testDirs && result.testDirs.length > 0) {
      const { shutdownServer } = await import("./opencode.js");
      const { cleanupTestDirs } = await import("./memory-api.js");
      const { refresh: refreshTable } = await import("../../plugin-v2/src/db.js");
      // Shut down any cached servers for this scenario's directories
      for (const dir of result.testDirs) {
        await shutdownServer(dir);
      }
      // Wait for file locks to release, refresh table handle, then clean up
      await Bun.sleep(2_000);
      await refreshTable();
      const deleted = await cleanupTestDirs(result.testDirs);
      console.log(`       ${DIM}  ✓ Cleaned up ${deleted} test memories from backend${RESET}`);
    }
    console.log();
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  printSummary(results);
  printDetailedReport(results);
  saveResults(results);

  const failed = results.filter((r) => r.status === "FAIL" || r.status === "ERROR").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
