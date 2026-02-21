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

  const result = await provider.ingest(sessions, cp.runTag, (sessionId, added, updated, done) => {
    emit({ type: "ingest_session", sessionId, added, updated, done, total: sessions.length });
  });

  cp.ingestResult = result;
  markPhaseComplete(cp, "ingest");

  log.success(
    `Ingested ${sessions.length} sessions → ${result.memoriesAdded} added, ${result.memoriesUpdated} updated`
  );
}
