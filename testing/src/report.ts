/**
 * report.ts — test result formatting and file output
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export type Status = "PASS" | "FAIL" | "SKIP" | "ERROR";

export interface ScenarioResult {
  id: string;
  name: string;
  status: Status;
  durationMs: number;
  details: string[];
  evidence?: Record<string, unknown>;
  error?: string;
  /** Test directories created by this scenario — runner uses these for cleanup */
  testDirs?: string[];
}

const RESULTS_DIR = join(import.meta.dir, "../results");

// ANSI colours
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

function statusColour(s: Status): string {
  if (s === "PASS")  return GREEN  + BOLD + s + RESET;
  if (s === "FAIL")  return RED    + BOLD + s + RESET;
  if (s === "SKIP")  return YELLOW + BOLD + s + RESET;
  return RED + BOLD + s + RESET;
}

export function printResult(r: ScenarioResult): void {
  const pad = r.id.padEnd(3, " ");
  const dur = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(7, " ");
  console.log(
    `  ${CYAN}[${pad}]${RESET} ${r.name.padEnd(50, ".")}${statusColour(r.status)}${DIM}${dur}${RESET}`
  );
  for (const line of r.details) {
    console.log(`       ${DIM}${line}${RESET}`);
  }
  if (r.error) {
    console.log(`       ${RED}ERROR: ${r.error}${RESET}`);
  }
}

export function printSummary(results: ScenarioResult[]): void {
  const pass  = results.filter((r) => r.status === "PASS").length;
  const fail  = results.filter((r) => r.status === "FAIL").length;
  const skip  = results.filter((r) => r.status === "SKIP").length;
  const error = results.filter((r) => r.status === "ERROR").length;
  const total = results.length;

  console.log();
  console.log(`${BOLD}━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`  ${GREEN}PASS${RESET}  ${pass}/${total}`);
  if (fail  > 0) console.log(`  ${RED}FAIL${RESET}  ${fail}`);
  if (error > 0) console.log(`  ${RED}ERROR${RESET} ${error}`);
  if (skip  > 0) console.log(`  ${YELLOW}SKIP${RESET}  ${skip}`);
  console.log();

  if (fail + error > 0) {
    console.log(`${BOLD}━━━ Failed Details ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    for (const r of results.filter((r) => r.status === "FAIL" || r.status === "ERROR")) {
      console.log(`  ${RED}[${r.id}] ${r.name}${RESET}`);
      for (const d of r.details) console.log(`      ${d}`);
      if (r.error) console.log(`      ERROR: ${r.error}`);
    }
    console.log();
  }
}

/**
 * Print a detailed per-scenario timing and assertion breakdown at the end of the run.
 * Shows a compact table plus individual assertion checklist for failed scenarios.
 */
export function printDetailedReport(results: ScenarioResult[]): void {
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`${BOLD}━━━ Detailed Report ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log();

  // ── Timing table ────────────────────────────────────────────────────────────
  console.log(`${BOLD}  Scenario timings:${RESET}`);
  for (const r of results) {
    const icon  = r.status === "PASS" ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const dur   = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(7);
    const pct   = `${Math.round((r.durationMs / totalMs) * 100)}%`.padStart(4);
    const label = `[${r.id}] ${r.name}`;
    console.log(`    ${icon}  ${label.padEnd(52)} ${DIM}${dur}  ${pct}${RESET}`);
  }
  console.log(`       ${"─".repeat(60)}`);
  console.log(`       Total: ${(totalMs / 1000).toFixed(1)}s`);
  console.log();

  // ── Assertion checklist for failed/error scenarios ──────────────────────────
  const badResults = results.filter((r) => r.status === "FAIL" || r.status === "ERROR");
  if (badResults.length > 0) {
    console.log(`${BOLD}  Failed scenario details:${RESET}`);
    for (const r of badResults) {
      console.log();
      console.log(`  ${RED}${BOLD}[${r.id}] ${r.name}${RESET}`);
      if (r.error) {
        console.log(`    ${RED}Error: ${r.error}${RESET}`);
      }
      // Print assertion lines (lines with ✓/✗)
      const assertionLines = r.details.filter((d) => d.includes("[✓]") || d.includes("[✗]"));
      if (assertionLines.length > 0) {
        console.log(`    Assertions:`);
        for (const line of assertionLines) {
          const colour = line.includes("[✓]") ? GREEN : RED;
          console.log(`      ${colour}${line.trim()}${RESET}`);
        }
      }
    }
    console.log();
  }

  // ── Evidence summary for passing scenarios ──────────────────────────────────
  const evidenceResults = results.filter((r) => r.status === "PASS" && r.evidence);
  if (evidenceResults.length > 0) {
    console.log(`${BOLD}  Evidence (passing scenarios):${RESET}`);
    for (const r of evidenceResults) {
      if (!r.evidence) continue;
      const kv = Object.entries(r.evidence)
        .filter(([k]) => k !== "responsePreview")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join("  ");
      if (kv) console.log(`    [${r.id}] ${DIM}${kv}${RESET}`);
    }
    console.log();
  }
}

export function saveResults(results: ScenarioResult[]): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(RESULTS_DIR, `run-${ts}.json`);

  // Include run metadata in saved output
  const output = {
    runAt: new Date().toISOString(),
    totalDurationMs: results.reduce((s, r) => s + r.durationMs, 0),
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status !== "PASS").length,
    total: results.length,
    scenarios: results,
  };

  writeFileSync(path, JSON.stringify(output, null, 2), "utf-8");
  console.log(`${DIM}  Results saved → ${path}${RESET}`);
}
