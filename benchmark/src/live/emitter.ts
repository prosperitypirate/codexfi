/**
 * Singleton SSE event emitter for the live benchmark dashboard.
 *
 * Pipeline phases call emit() unconditionally — if no live server is running
 * (--live not passed) the emit is a no-op and adds zero overhead.
 */

export type BenchEvent =
  | { type: "run_start";          runId: string; provider: string; judgeModel: string; sessions: number; questions: number }
  | { type: "phase_start";        phase: "ingest" | "search" | "answer" | "evaluate" | "cleanup" | "done" }
  | { type: "ingest_session";     sessionId: string; added: number; updated: number; done: number; total: number; durationMs?: number }
  | { type: "search_question";    questionId: string; questionType: string; resultCount: number; topScore: number; done: number; total: number }
  | { type: "answer_question";    questionId: string; preview: string; done: number; total: number }
  | { type: "evaluate_question";  questionId: string; questionType: string; correct: boolean; explanation: string; done: number; total: number; runningCorrect: number; retrievalMetrics?: { hitAtK: number; precisionAtK: number; f1AtK: number; mrr: number; ndcg: number; k: number } }
  | { type: "cleanup_progress";   deleted: number; total: number }
  | { type: "run_complete";       accuracy: number; correct: number; total: number; byType: Record<string, { correct: number; total: number }> };

type SseClient = { write: (data: string) => void };

const clients = new Set<SseClient>();
const history: string[] = [];
let active = false;

export function activateLiveMode(): void {
  active = true;
}

export function isLiveMode(): boolean {
  return active;
}

export function registerClient(client: SseClient): void {
  // Replay history so a late-joining browser catches up immediately
  for (const frame of history) client.write(frame);
  clients.add(client);
}

export function unregisterClient(client: SseClient): void {
  clients.delete(client);
}

export function emit(event: BenchEvent): void {
  if (!active) return;
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  history.push(frame);
  for (const c of clients) c.write(frame);
}
