/**
 * Singleton SSE event emitter for the live E2E test dashboard.
 *
 * Scenarios and the runner call emit() to push events to connected browsers.
 * If no live server is running, emit() is a silent no-op.
 */

export type E2eEvent =
  | { type: "run_start"; total: number; filter?: string }
  | { type: "scenario_start"; id: string; name: string; index: number; total: number }
  | { type: "scenario_step"; id: string; step: string; detail?: string }
  | { type: "scenario_session"; id: string; session: number; message: string; durationMs?: number; exitCode?: number; responsePreview?: string }
  | { type: "scenario_waiting"; id: string; label: string; found?: number; expected?: number }
  | { type: "scenario_assertion"; id: string; label: string; pass: boolean }
  | { type: "scenario_end"; id: string; name: string; status: "PASS" | "FAIL" | "SKIP" | "ERROR"; durationMs: number; error?: string; memoriesCount?: number }
  | { type: "cleanup"; id: string; deleted: number }
  | { type: "run_complete"; passed: number; failed: number; total: number; durationMs: number; results: RunCompleteResult[] };

export interface RunCompleteResult {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  durationMs: number;
  error?: string;
  assertions?: { label: string; pass: boolean }[];
}

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
  for (const frame of history) client.write(frame);
  clients.add(client);
}

export function unregisterClient(client: SseClient): void {
  clients.delete(client);
}

export function emit(event: E2eEvent): void {
  if (!active) return;
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  history.push(frame);
  for (const c of clients) c.write(frame);
}
