import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Checkpoint, Phase } from "../types.js";

const RUNS_DIR = join(import.meta.dir, "../../data/runs");

export function runDir(runId: string): string {
  return join(RUNS_DIR, runId);
}

function checkpointPath(runId: string): string {
  return join(runDir(runId), "checkpoint.json");
}

export function loadCheckpoint(runId: string): Checkpoint | null {
  const path = checkpointPath(runId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as Checkpoint;
}

export function saveCheckpoint(cp: Checkpoint): void {
  const dir = runDir(cp.runId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(checkpointPath(cp.runId), JSON.stringify(cp, null, 2));
}

export function markPhaseComplete(cp: Checkpoint, phase: Phase): void {
  if (!cp.completedPhases.includes(phase)) {
    cp.completedPhases.push(phase);
  }
  saveCheckpoint(cp);
}

export function isPhaseComplete(cp: Checkpoint, phase: Phase): boolean {
  return cp.completedPhases.includes(phase);
}

export function reportPath(runId: string): string {
  return join(runDir(runId), "report.json");
}

/**
 * Throttled checkpoint writer for per-item progress inside a phase: writes at
 * most once per `intervalMs`; call flush() at the end of the phase.
 */
export function throttledSaver(cp: Checkpoint, intervalMs = 2000): { save(): void; flush(): void } {
  let last = 0;
  let dirty = false;
  return {
    save() {
      dirty = true;
      const now = Date.now();
      if (now - last >= intervalMs) { saveCheckpoint(cp); last = now; dirty = false; }
    },
    flush() {
      if (dirty) { saveCheckpoint(cp); dirty = false; last = Date.now(); }
    },
  };
}
