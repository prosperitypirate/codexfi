/**
 * Block Quality pipeline phase — Tier 2 benchmark evaluation.
 *
 * Assembles the [MEMORY] block from ingested data using the same
 * `formatContextForPrompt()` function the plugin uses in production,
 * then stores one block per question (using the question as the semantic
 * search query, mirroring the plugin's per-turn refresh behaviour).
 *
 * This measures how well the *formatted block* serves an agent, distinct
 * from Tier 1 which measures raw retrieval quality per question.
 */

import type {
  UnifiedQuestion,
  BlockQualityPhaseResult,
  Checkpoint,
} from "../types.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";

import * as db from "../../../plugin/src/db.js";
import * as store from "../../../plugin/src/store.js";
import {
  formatContextForPrompt,
  type StructuredMemory,
} from "../../../plugin/src/services/context.js";

export async function runBlockAssembly(
  questions: UnifiedQuestion[],
  cp: Checkpoint,
): Promise<void> {
  log.phase("BLOCK ASSEMBLY");
  log.info(`Assembling [MEMORY] blocks for ${questions.length} questions...`);

  // Refresh table to see all ingested data
  await db.refresh();

  // ── Fetch all structured memories once (shared across all questions) ────────
  // Matches the plugin's Turn 1 listMemories call (index.ts:686-774).
  // Using limit 50 to match the Phase 5 target (raised from 30).
  const allRows = await store.list(cp.runTag, { limit: 50 });

  // Group by metadata.type — identical to index.ts:731-743
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

  log.info(`  Structured memories: ${allRows.length} total, ${Object.keys(byType).length} types`);

  // ── Per-question block assembly ──────────────────────────────────────────────
  const results: BlockQualityPhaseResult[] = [];

  for (const q of questions) {
    const start = Date.now();

    // Semantic search using the question as the query — mirrors per-turn refresh
    // (index.ts:874-895). Threshold 0.2 matches benchmark's search phase threshold.
    const semanticRows = await store.search(q.question, cp.runTag, {
      limit: 20,
      threshold: 0.2,
    });

    // Convert to MemoriesResponseMinimal format expected by formatContextForPrompt
    const semanticResults = {
      results: semanticRows.map((r) => ({
        similarity: r.score,
        memory: r.memory,
        chunk: r.chunk ?? "",
        date: r.date ?? (r.metadata?.date as string | undefined),
      })),
    };

    // Assemble the [MEMORY] block — same function used by the plugin in production
    const block = formatContextForPrompt(
      null,                   // no user profile in benchmark
      { results: [] },        // no user-scoped memories in benchmark
      semanticResults,
      byType,
    );

    const durationMs = Date.now() - start;
    results.push({ questionId: q.questionId, block, durationMs });

    log.dim(
      `  ${q.questionId} [${q.questionType}]: block ${block.length} chars, ` +
      `${semanticRows.length} semantic hits`
    );
    emit({
      type: "search_question",
      questionId: q.questionId,
      questionType: q.questionType,
      resultCount: semanticRows.length,
      topScore: semanticRows[0]?.score ?? 0,
      done: results.length,
      total: questions.length,
    });
  }

  cp.blockQualityResults = results;
  markPhaseComplete(cp, "block-assembly");

  const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
  const avgBlockLen = Math.round(results.reduce((s, r) => s + r.block.length, 0) / results.length);
  log.success(`Block assembly complete. Avg latency: ${avgMs}ms, avg block: ${avgBlockLen} chars`);
}
