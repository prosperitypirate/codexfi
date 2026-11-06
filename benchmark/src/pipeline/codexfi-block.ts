/**
 * The ONE place the benchmark builds a codexfi [MEMORY] block for a question.
 *
 * Used by block-quality mode (memoryBankAware=false) and by memory-bank mode's
 * "codexfi-only" (false) and "mb+codexfi" (true) conditions.
 *
 * Mirrors the plugin's per-turn assembly: structured sections from
 * store.listStructured() + semantic hits for the current query, rendered by the
 * production formatContextForPrompt().
 *
 * memoryBankAware=true: a Memory Bank already covers the structured part
 * (brief / architecture / tech / product / progress / active context), so only
 * "Recent Sessions" and "Relevant to Current Task" are kept.
 * → Tuning point for the lead engineer.
 */

import * as db from "../../../plugin/src/db.js";
import * as store from "../../../plugin/src/store.js";
import { activeThresholds } from "../../../plugin/src/embedder.js";
import {
  formatContextForPrompt,
  applyPerTypeCaps,
  RENDERED_STRUCTURAL_TYPES,
  type StructuredMemory,
} from "../../../plugin/src/services/context.js";

/** Types rendered under "Recent Sessions" — mirrors SESSION_SUMMARY_TYPES in plugin/src/services/context.ts. */
const RECENT_SESSION_TYPES = ["session-summary", "conversation"];

export interface CodexfiBlockStats {
  semanticHits: number;
  topScore: number;
  structuredRows: number;
}

/** Structured rows are identical for every question of a run — fetch once per runTag. */
const structuredCache = new Map<string, Promise<Record<string, StructuredMemory[]>>>();

async function getStructuredByType(runTag: string): Promise<Record<string, StructuredMemory[]>> {
  let p = structuredCache.get(runTag);
  if (!p) {
    p = (async () => {
      // Refresh table to see all ingested data
      await db.refresh();
      // Matches the plugin's Turn 1 listStructuredMemories call (index.ts) — scoped
      // to RENDERED_STRUCTURAL_TYPES so non-rendered atomic types (learned-pattern,
      // error-solution, preference) can't starve this fetch. limit 100 matches
      // plugin-config.ts's maxStructuredMemories default. See issue #201.
      const allRows = await store.listStructured(runTag, RENDERED_STRUCTURAL_TYPES, { limit: 100 });
      // Group by metadata.type — identical to index.ts's buildStructuredSections()
      const byType: Record<string, StructuredMemory[]> = {};
      for (const row of allRows) {
        const memType = (row.metadata?.type as string | undefined) ?? "other";
        if (!byType[memType]) byType[memType] = [];
        byType[memType].push({
          id: row.id,
          memory: row.memory,
          similarity: 1,
          metadata: row.metadata,
          createdAt: row.created_at ?? undefined,
        });
      }
      applyPerTypeCaps(byType);
      return byType;
    })();
    structuredCache.set(runTag, p);
  }
  return p;
}

export async function buildCodexfiBlock(
  question: string,
  runTag: string,
  opts: { memoryBankAware?: boolean; onStats?: (s: CodexfiBlockStats) => void } = {},
): Promise<string> {
  const fullByType = await getStructuredByType(runTag);

  const byType: Record<string, StructuredMemory[]> = opts.memoryBankAware
    ? Object.fromEntries(Object.entries(fullByType).filter(([t]) => RECENT_SESSION_TYPES.includes(t)))
    : fullByType;

  // Semantic search using the question as the query — mirrors per-turn refresh
  // (index.ts). Threshold 0.2 matches benchmark's search phase threshold.
  const semanticRows = await store.search(question, runTag, { limit: 20, threshold: activeThresholds().floor });

  // Convert to MemoriesResponseMinimal format expected by formatContextForPrompt
  const semanticResults = {
    results: semanticRows.map((r) => ({
      similarity: r.score,
      memory: r.memory,
      chunk: r.chunk ?? "",
      date: r.date ?? (r.metadata?.date as string | undefined),
    })),
  };

  opts.onStats?.({
    semanticHits: semanticRows.length,
    topScore: semanticRows[0]?.score ?? 0,
    structuredRows: Object.values(fullByType).reduce((s, v) => s + v.length, 0),
  });

  // Assemble the [MEMORY] block — same function used by the plugin in production
  return formatContextForPrompt(
    null,                   // no user profile in benchmark
    { results: [] },        // no user-scoped memories in benchmark
    semanticResults,
    byType,
  );
}
