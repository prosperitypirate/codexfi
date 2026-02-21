/**
 * Bun HTTP server that serves the live benchmark dashboard and an SSE stream.
 *
 * GET /        → self-contained HTML dashboard
 * GET /events  → Server-Sent Events stream (replays history to late joiners)
 */

import { HTML } from "./page.js";
import { registerClient, unregisterClient } from "./emitter.js";

const LIVE_PORT = 4242;

export function startLiveServer(): void {
  const opener: Record<string, string> = { darwin: "open", linux: "xdg-open", win32: "start" };
  const cmd = opener[process.platform];
  if (cmd) Bun.spawn([cmd, `http://localhost:${LIVE_PORT}`], { stdout: null, stderr: null });

  Bun.serve({
    port: LIVE_PORT,
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

        // Unregister when the connection drops (Bun signals this via stream cancel)
        req.signal.addEventListener("abort", () => unregisterClient(client));

        return new Response(stream, {
          headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      // Serve dashboard for all other paths
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  });

  console.log(`\x1b[36m  Live dashboard → http://localhost:${LIVE_PORT}\x1b[0m`);
}
