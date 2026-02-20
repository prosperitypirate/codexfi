import type { Provider, UnifiedSession, Checkpoint } from "../types.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";

export async function runIngest(
  provider: Provider,
  sessions: UnifiedSession[],
  cp: Checkpoint
): Promise<void> {
  log.phase("INGEST");
  log.info(`Ingesting ${sessions.length} sessions into ${provider.name}...`);
  log.info(`Run tag: ${cp.runTag}`);

  const result = await provider.ingest(sessions, cp.runTag);

  cp.ingestResult = result;
  markPhaseComplete(cp, "ingest");

  log.success(
    `Ingested ${sessions.length} sessions → ${result.memoriesAdded} added, ${result.memoriesUpdated} updated`
  );
}
