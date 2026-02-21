import type { Provider, UnifiedQuestion, SearchPhaseResult, Checkpoint } from "../types.js";
import { markPhaseComplete } from "../utils/checkpoint.js";
import { log } from "../utils/logger.js";
import { emit } from "../live/emitter.js";

export async function runSearch(
  provider: Provider,
  questions: UnifiedQuestion[],
  cp: Checkpoint
): Promise<void> {
  log.phase("SEARCH");
  log.info(`Running ${questions.length} search queries...`);

  const results: SearchPhaseResult[] = [];

  for (const q of questions) {
    const start = Date.now();
    const searchResults = await provider.search(q.question, cp.runTag, 8, q.questionType);
    const durationMs = Date.now() - start;

    results.push({ questionId: q.questionId, results: searchResults, durationMs });

    const found    = searchResults.length;
    const top      = searchResults[0];
    const topScore = top ? top.score : 0;
    log.dim(`  ${q.questionId} [${q.questionType}]: ${found} results, top score ${top ? `${(topScore * 100).toFixed(0)}%` : "—"}`);
    emit({ type: "search_question", questionId: q.questionId, questionType: q.questionType, resultCount: found, topScore, done: results.length, total: questions.length });
  }

  cp.searchResults = results;
  markPhaseComplete(cp, "search");

  const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
  log.success(`Search complete. Avg latency: ${avgMs}ms`);
}
