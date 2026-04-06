/**
 * Bun HTTP server for the live E2E test dashboard.
 *
 * GET /        → self-contained HTML dashboard
 * GET /events  → Server-Sent Events stream (replays history to late joiners)
 */

import { HTML } from "./page.js";
import { registerClient, unregisterClient } from "./emitter.js";

const LIVE_PORT = 4243; // 4242 = benchmark, 4243 = e2e

export function startLiveServer(): void {
  const opener: Record<string, string> = { darwin: "open", linux: "xdg-open", win32: "start" };
  const cmd = opener[process.platform];
  if (cmd) Bun.spawn([cmd, `http://localhost:${LIVE_PORT}`], { stdout: null, stderr: null });

  Bun.serve({
    port: LIVE_PORT,
    idleTimeout: 255,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/events") {
        let controller: ReadableStreamDefaultController<string>;

        const stream = new ReadableStream<string>({
          start(c) { controller = c; },
        });

        const client = {
          write(data: string) {
            try { controller.enqueue(data); } catch { /* client disconnected */ }
          },
        };

        registerClient(client);
        req.signal.addEventListener("abort", () => unregisterClient(client));

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  });

  console.log(`\x1b[36m  Live dashboard → http://localhost:${LIVE_PORT}\x1b[0m`);
}
