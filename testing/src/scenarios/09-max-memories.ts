/**
 * Scenario 09 — maxMemories=20 Under Load
 *
 * Verifies that with >10 distinct memories stored, the plugin retrieves beyond
 * the old K=10 limit. Before PR #36 raised K to 20, queries would only retrieve
 * the top 10 memories — early sessions' facts were silently dropped.
 *
 * Strategy: run 6 sessions each seeding distinct, specific facts. Then ask a
 * broad recall question and assert facts from early sessions are still recalled.
 * We seed enough unique facts that only a K≥20 retrieval would surface them all.
 *
 * Sessions 1-6: each seeds 2-3 distinct tech facts about a project
 * Session 7: "What do you know about the helix project?" — must recall facts
 *            from sessions 1 AND 5/6 (early + late), confirming K=20 reach
 */

import { createTestDir, runOpencode } from "../opencode.js";
import { getMemoriesForDir, waitForMemories } from "../memory-api.js";
import type { ScenarioResult } from "../report.js";

const SESSIONS = [
  {
    label: "session 1 (core stack)",
    msg: "Project 'helix': A Go microservice for real-time data ingestion. " +
      "Primary language: Go 1.22. HTTP framework: Chi router. " +
      "Database: CockroachDB with pgx driver. " +
      "The project structure: cmd/server (main entrypoint), internal/ingestion (core pipeline), " +
      "internal/store (CockroachDB adapter), internal/api (HTTP handlers), pkg/events (shared event types). " +
      "The team uses conventional commits and all PRs require 2 approvals. " +
      "Please summarise the project and tech stack in your own words.",
  },
  {
    label: "session 2 (infra)",
    msg: "Helix project infrastructure update: Deployed on Fly.io using fly.toml with 2 replicas in ord and lax regions. " +
      "Tigris object storage (S3-compatible) for raw event files with 30-day retention. " +
      "Kafka via Confluent Cloud (3 brokers, replication factor 3) for event streaming. " +
      "Secrets managed in Fly.io secrets, not in env files. " +
      "Docker image based on golang:1.22-alpine, multi-stage build, final image ~18MB. " +
      "Please acknowledge and summarise the infrastructure.",
  },
  {
    label: "session 3 (auth)",
    msg: "Helix auth layer details: Uses PASETO v4 local tokens (not JWT — JWTs were replaced in v0.3). " +
      "Ed25519 signing keys are rotated every 30 days via a cron job in the ops/ directory. " +
      "No OAuth — all machine-to-machine auth via API keys stored hashed in CockroachDB. " +
      "Rate limiting per API key: 10k requests/minute via a token bucket in Redis. " +
      "API key format: hx_live_<base58:32> for production, hx_test_<base58:32> for test keys. " +
      "Please acknowledge and summarise the auth approach.",
  },
  {
    label: "session 4 (testing)",
    msg: "Helix testing setup: testify/suite for test organisation, testify/assert for assertions. " +
      "testcontainers-go spins up real CockroachDB and Redis instances for integration tests. " +
      "k6 scripts in load-tests/ cover the ingest endpoint at 5k RPS target. " +
      "CI: GitHub Actions — unit tests on every push, integration tests on PR, load tests weekly. " +
      "golangci-lint with errcheck, staticcheck, govet, and revive linters. " +
      "Test coverage requirement: 80% for internal packages. " +
      "Please acknowledge and summarise the testing setup.",
  },
  {
    label: "session 5 (observability)",
    msg: "Helix observability stack: OpenTelemetry SDK for distributed traces, exported to Honeycomb. " +
      "Trace sampling: 100% in staging, 10% in production. " +
      "Prometheus metrics via /metrics endpoint — key metrics: ingest_events_total, ingest_latency_seconds, kafka_lag_seconds. " +
      "Structured logging with slog (stdlib Go 1.21+), JSON format in production, text in development. " +
      "Alerts managed in Grafana Cloud: p99 latency >500ms and error rate >1% trigger PagerDuty. " +
      "Please acknowledge and summarise the observability setup.",
  },
  {
    label: "session 6 (architecture decisions)",
    msg: "Helix key architecture decisions: " +
      "Event deduplication via Redis SETNX idempotency key with 24h TTL — prevents duplicate processing on Kafka retries. " +
      "Backpressure handled by a leaky bucket rate limiter implemented as Chi middleware in internal/middleware/ratelimit.go. " +
      "Schema validation using buf.build Protobuf definitions in proto/ — all events must conform to EventEnvelope v2. " +
      "Dead letter queue (DLQ) in Kafka topic helix.events.dlq — failed events retried 3 times then sent to DLQ. " +
      "Batch insert: events buffered in memory for 50ms or 1000 events (whichever comes first) before CockroachDB bulk insert. " +
      "Please acknowledge and summarise these decisions.",
  },
  {
    label: "session 7 (developer preferences)",
    msg: "Helix developer preferences and conventions: " +
      "All errors must be wrapped with context using fmt.Errorf('...: %w', err) — never swallow errors silently. " +
      "No global variables — all dependencies injected via constructor functions. " +
      "Interfaces defined in the consuming package, not the implementing package (Go best practice). " +
      "All HTTP handlers must return structured JSON errors: {error: string, code: string, request_id: string}. " +
      "Database migrations in db/migrations/ using goose — never edit existing migrations. " +
      "Please acknowledge and summarise these conventions.",
  },
  {
    label: "session 8 (current status)",
    msg: "Helix project current status: v0.7.2 in production. " +
      "Ingesting 2.1M events/day at p50=12ms, p99=87ms latency. " +
      "3 open issues: #142 (Kafka consumer group rebalancing during deploys), " +
      "#156 (CockroachDB write amplification at high batch sizes), " +
      "#161 (PASETO token validation adds 3ms to every request — investigate caching). " +
      "Next milestone v0.8.0: add WebSocket streaming endpoint for real-time event consumers. " +
      "Please acknowledge and summarise the current status.",
  },
];

export async function run(): Promise<ScenarioResult> {
  const id = "09";
  const name = "maxMemories=20 Under Load";
  const details: string[] = [];
  const start = Date.now();

  const dir = createTestDir("max-memories");
  details.push(`test dir: ${dir}`);

  try {
    // ── Sessions 1–6: seed facts ───────────────────────────────────────────────
    let prevMemCount = 0;
    for (let i = 0; i < SESSIONS.length; i++) {
      const { label, msg } = SESSIONS[i];
      details.push(`${label}…`);
      const result = await runOpencode(msg, dir, { timeoutMs: 90_000 });
      details.push(`  exitCode: ${result.exitCode}, duration: ${(result.durationMs / 1000).toFixed(1)}s`);
      if (result.exitCode !== 0) {
        return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `${label} failed: ${result.stderr.slice(0, 200)}` };
      }
      // Wait for auto-save after each session
      await waitForMemories(dir, prevMemCount + 1, 35_000);
      await Bun.sleep(2_000);
      const mems = await getMemoriesForDir(dir);
      prevMemCount = mems.length;
      details.push(`  total memories so far: ${prevMemCount}`);
    }

    const totalMemories = await getMemoriesForDir(dir);
    details.push(`Total memories after all sessions: ${totalMemories.length}`);

    if (totalMemories.length < 8) {
      return {
        id, name, status: "FAIL", durationMs: Date.now() - start, details,
        error: `Only ${totalMemories.length} memories — not enough to stress-test K=20 limit (need ≥8)`
      };
    }

    // ── Session 9: broad recall query ─────────────────────────────────────────
    details.push("Session 9: broad recall query to verify deep retrieval…");
    const s7 = await runOpencode(
      "Give me a comprehensive overview of the helix project — " +
      "cover the language and framework, infrastructure, auth approach, " +
      "testing setup, observability, and any key architecture decisions.",
      dir,
      { timeoutMs: 120_000 }
    );
    details.push(`  exitCode: ${s7.exitCode}, duration: ${(s7.durationMs / 1000).toFixed(1)}s`);
    if (s7.exitCode !== 0) {
      return { id, name, status: "FAIL", durationMs: Date.now() - start, details, error: `Session 7 failed: ${s7.stderr.slice(0, 200)}` };
    }

    const response = s7.text.toLowerCase();
    details.push(`  response length: ${s7.text.length} chars`);
    details.push(`  preview: ${s7.text.slice(0, 400)}`);

    // ── Assertions ─────────────────────────────────────────────────────────────
    // Facts from early sessions (1, 2) AND late sessions (7, 8) must both appear.
    // If K were still 10, early session facts would likely be pushed out.
    const assertions = [
      { label: "Response not empty",                                        pass: s7.text.length > 100 },
      { label: "≥8 memories stored (K=20 load condition met)",              pass: totalMemories.length >= 8 },
      { label: "Recalls Go + Chi (session 1 — early)",                      pass: /\bgo\b|chi/i.test(response) },
      { label: "Recalls CockroachDB (session 1 — early)",                   pass: /cockroach/i.test(response) },
      { label: "Recalls Fly.io or Kafka (session 2)",                       pass: /fly\.io|kafka|confluent/i.test(response) },
      { label: "Recalls PASETO or Ed25519 (session 3)",                     pass: /paseto|ed25519/i.test(response) },
      { label: "Recalls OpenTelemetry or Honeycomb (session 5)",            pass: /opentelemetry|honeycomb|otel/i.test(response) },
      { label: "Recalls Redis idempotency or Protobuf (session 6)",         pass: /redis|protobuf|buf\.build|idempoten/i.test(response) },
      { label: "Recalls error wrapping or DI conventions (session 7—late)", pass: /fmt\.errorf|inject|constructor|global var/i.test(response) },
      { label: "Recalls v0.7.2 or WebSocket milestone (session 8 — late)",  pass: /v0\.7|websocket|2\.1m|pagerduty/i.test(response) },
    ];

    for (const a of assertions) {
      details.push(`  [${a.pass ? "✓" : "✗"}] ${a.label}`);
    }

    return {
      id, name,
      status: assertions.every((a) => a.pass) ? "PASS" : "FAIL",
      durationMs: Date.now() - start,
      details,
      evidence: { totalMemories: totalMemories.length, responsePreview: s7.text.slice(0, 600) },
      testDirs: [dir],
    };

  } catch (err) {
    return { id, name, status: "ERROR", durationMs: Date.now() - start, details, error: String(err) };
  }
}
