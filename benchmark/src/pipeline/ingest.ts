import type { Provider, UnifiedSession, Checkpoint } from "../types.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";

export async function runIngest(
  provider: Provider,
  sessions: UnifiedSession[],
  cp: Checkpoint
): Promise<void> {
  log.phase("INGEST");
  log.info(`Ingesting ${sessions.length} sessions into ${provider.name}...`);
  log.info(`Run tag: ${cp.runTag}`);

  const result = await provider.ingest(sessions, cp.runTag, (sessionId, added, updated, done, durationMs) => {
    const avgMs = durationMs; // per-session, not cumulative
    log.dim(`    +${added} added ~${updated} updated  (${(durationMs / 1000).toFixed(1)}s)`);
    emit({ type: "ingest_session", sessionId, added, updated, done, total: sessions.length, durationMs });
  });

  cp.ingestResult = result;
  markPhaseComplete(cp, "ingest");

  // Print ingest timing summary
  const durations = result.sessionDurations;
  if (durations.length > 0) {
    const sorted = [...durations].sort((a, b) => a - b);
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    log.success(
      `Ingested ${sessions.length} sessions → ${result.memoriesAdded} added, ${result.memoriesUpdated} updated`
    );
    log.info(
      `Ingest timing: total ${(result.totalDurationMs / 1000).toFixed(1)}s · ` +
      `mean ${(mean / 1000).toFixed(1)}s · median ${(median / 1000).toFixed(1)}s · ` +
      `min ${(sorted[0] / 1000).toFixed(1)}s · max ${(sorted[sorted.length - 1] / 1000).toFixed(1)}s per session`
    );
  } else {
    log.success(
      `Ingested ${sessions.length} sessions → ${result.memoriesAdded} added, ${result.memoriesUpdated} updated`
    );
  }
}
