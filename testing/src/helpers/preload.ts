/**
 * Test preload (bunfig.toml → [test].preload) — runs once, before any test file.
 * Every test file ALSO imports this module first, so the sandbox exists even
 * when `bun test` is started from a directory without testing/bunfig.toml (the
 * module cache makes the second import a no-op). Keep it fully synchronous.
 *
 * Plugin modules read their environment at IMPORT time (config.ts DATA_DIR,
 * plugin-config.ts reads ~/.codexfi/codexfi.jsonc, LLM backend, embedding
 * provider), and `bun test` shares one module cache across all files. So the
 * sandbox must exist before the first plugin import anywhere:
 *
 *   HOME / homedir()  → temp dir   (plugin-config never sees the real ~/.codexfi)
 *   CODEXFI_DATA_DIR  → temp dir   (store, queue, sessions, logs, costs)
 *   CODEXFI_NO_WORKER = 1          (hooks never spawn a detached worker)
 *   CODEXFI_CLAUDE_BIN → fake stub (even an un-mocked LLM call can't reach `claude`)
 *   API keys / Claude Code env vars removed
 *
 * Then two module mocks, both process-wide:
 *   @huggingface/transformers → deterministic bag-of-words model (no download)
 *   plugin/src/llm.ts         → callLlm/callLlmStrict replaced by helpers/fake-llm
 */

import { mock } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as nodeOs from "node:os";
import { join, resolve } from "node:path";

import { fakeCallLlm, fakeCallLlmStrict, realLlm } from "./fake-llm.js";
import { fakeTransformersModule } from "./mock-embedder.js";

const realOs = { ...nodeOs };
const realHome = realOs.homedir();

// `bun test` emits no process exit events, so a run cannot remove its own
// sandbox. Sweep sandboxes left by earlier runs instead (older than an hour, so
// a concurrently running suite is never disturbed).
for (const name of readdirSync(realOs.tmpdir())) {
	if (!name.startsWith("codexfi-test-")) continue;
	const p = join(realOs.tmpdir(), name);
	try {
		if (Date.now() - statSync(p).mtimeMs > 3_600_000) rmSync(p, { recursive: true, force: true });
	} catch {
		// best effort
	}
}

const sandbox = realpathSync(mkdtempSync(join(realOs.tmpdir(), "codexfi-test-")));
const home = join(sandbox, "home");
const dataDir = join(sandbox, "data");
mkdirSync(home, { recursive: true });
mkdirSync(dataDir, { recursive: true });

// ── Fake `claude` binary ────────────────────────────────────────────────────────
// Logs argv / stdin / CODEXFI_DISABLE to $CODEXFI_FAKE_CLAUDE_LOG and prints
// $CODEXFI_FAKE_CLAUDE_REPLY (a file) or a minimal successful JSON result.
const fakeClaude = join(sandbox, "bin", "claude");
mkdirSync(join(sandbox, "bin"), { recursive: true });
writeFileSync(
	fakeClaude,
	`#!/bin/sh
LOG="\${CODEXFI_FAKE_CLAUDE_LOG:-/dev/null}"
INPUT="$(cat)"
{
  printf 'ARGS:'
  for a in "$@"; do printf ' [%s]' "$a"; done
  printf '\\nDISABLE:%s\\nSTDIN:%s\\n' "$CODEXFI_DISABLE" "$INPUT"
} >> "$LOG"
if [ -n "$CODEXFI_FAKE_CLAUDE_REPLY" ]; then
  cat "$CODEXFI_FAKE_CLAUDE_REPLY"
else
  printf '%s' '{"type":"result","is_error":false,"result":"[]","usage":{"input_tokens":1,"output_tokens":1},"total_cost_usd":0}'
fi
`,
);
chmodSync(fakeClaude, 0o755);

// ── Environment ─────────────────────────────────────────────────────────────────
for (const key of [
	"OPENCODE_MEMORY_DIR",
	"CODEXFI_DISABLE",
	"CODEXFI_WORKER",
	"CODEXFI_LLM_MODEL",
	"CODEXFI_LOCAL_MODEL",
	"CODEXFI_MODEL_DIR",
	"CODEXFI_RUNTIME",
	"ANTHROPIC_API_KEY",
	"VOYAGE_API_KEY",
	"CLAUDE_CODE_EXECPATH",
	"CLAUDE_PROJECT_DIR",
	"CODEXFI_FAKE_CLAUDE_LOG",
	"CODEXFI_FAKE_CLAUDE_REPLY",
]) {
	delete process.env[key];
}
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.CODEXFI_DATA_DIR = dataDir;
process.env.CODEXFI_NO_WORKER = "1";
process.env.CODEXFI_LLM_BACKEND = "claude-cli";
process.env.CODEXFI_EMBEDDING_PROVIDER = "local";
process.env.CODEXFI_CLAUDE_BIN = fakeClaude;
process.env.CODEXFI_TEST_SANDBOX = sandbox;
process.env.CODEXFI_TEST_DATA_DIR = dataDir;
process.env.CODEXFI_TEST_FAKE_CLAUDE = fakeClaude;

// ── Module mocks ────────────────────────────────────────────────────────────────
// Bun's os.homedir() ignores runtime changes to process.env.HOME, so mock it:
// plugin-config.ts computes CONFIG_DIR = homedir()/.codexfi at import time.
// (Child processes inherit the temp HOME through the real environment.)
const sandboxOs = { ...realOs, homedir: () => home };
mock.module("node:os", () => ({ ...sandboxOs, default: sandboxOs }));
mock.module("@huggingface/transformers", fakeTransformersModule);

const PLUGIN_SRC = resolve(import.meta.dir, "../../../plugin/src");
const LLM_PATH = join(PLUGIN_SRC, "llm.ts");

// Capture the real exports BEFORE mocking (mock.module patches the live module).
// Synchronous require() on purpose: this file is also imported as the first
// import of every test file, and must finish before sibling imports evaluate.
Object.assign(realLlm, { ...require(LLM_PATH) });
mock.module(LLM_PATH, () => ({ ...realLlm, callLlm: fakeCallLlm, callLlmStrict: fakeCallLlmStrict }));

// ── Isolation self-check ────────────────────────────────────────────────────────
const config = require(join(PLUGIN_SRC, "config.ts"));
const pluginConfig = require(join(PLUGIN_SRC, "plugin-config.ts"));
if (config.DATA_DIR !== dataDir || pluginConfig.CONFIG_DIR.startsWith(join(realHome, ".codexfi"))) {
	throw new Error(
		`[codexfi tests] sandbox isolation failed: DATA_DIR=${config.DATA_DIR} CONFIG_DIR=${pluginConfig.CONFIG_DIR}`,
	);
}
