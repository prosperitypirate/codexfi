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
 *
 * Block construction lives in ./codexfi-block.ts (shared with memory-bank mode).
 */

import type {
  UnifiedQuestion,
  BlockQualityPhaseResult,
  Checkpoint,
} from "../types.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";
import { buildCodexfiBlock, type CodexfiBlockStats } from "./codexfi-block.js";

export async function runBlockAssembly(
  questions: UnifiedQuestion[],
  cp: Checkpoint,
): Promise<void> {
  log.phase("BLOCK ASSEMBLY");
  log.info(`Assembling [MEMORY] blocks for ${questions.length} questions...`);

  // ── Per-question block assembly ──────────────────────────────────────────────
  const results: BlockQualityPhaseResult[] = [];

  for (const q of questions) {
    const start = Date.now();
    let stats: CodexfiBlockStats = { semanticHits: 0, topScore: 0, structuredRows: 0 };
    const block = await buildCodexfiBlock(q.question, cp.runTag, {
      memoryBankAware: false,
      onStats: (s) => { stats = s; },
    });
    const durationMs = Date.now() - start;

    if (results.length === 0) log.info(`  Structured memories (after per-type caps): ${stats.structuredRows}`);
    results.push({ questionId: q.questionId, block, durationMs });

    log.dim(
      `  ${q.questionId} [${q.questionType}]: block ${block.length} chars, ` +
      `${stats.semanticHits} semantic hits`
    );
    emit({
      type: "search_question",
      questionId: q.questionId,
      questionType: q.questionType,
      resultCount: stats.semanticHits,
      topScore: stats.topScore,
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
