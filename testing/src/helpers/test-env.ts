/**
 * Shared paths + small utilities for the test suite. Importing this module has
 * no side effects beyond reading env vars that preload.ts already set.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PLUGIN_DIR = resolve(import.meta.dir, "../../../plugin");
export const PLUGIN_SRC = join(PLUGIN_DIR, "src");

/** Root of this run's sandbox (temp HOME + data dir + fake claude live here). */
export const SANDBOX = process.env.CODEXFI_TEST_SANDBOX!;
/** The CODEXFI_DATA_DIR every plugin module captured at import time. */
export const TEST_DATA_DIR = process.env.CODEXFI_TEST_DATA_DIR!;
export const FAKE_CLAUDE_BIN = process.env.CODEXFI_TEST_FAKE_CLAUDE!;

/** Fresh temp directory inside the sandbox (the next run sweeps old sandboxes). */
export function makeTempDir(prefix: string): string {
	mkdirSync(join(SANDBOX, "tmp"), { recursive: true });
	return mkdtempSync(join(SANDBOX, "tmp", `${prefix}-`));
}

/** Wipe hook/worker on-disk state (queue, sessions, logs, worker lock). */
export function resetRuntimeState(opts: { keepSessions?: boolean } = {}): void {
	const names = ["queue", "logs", "worker.lock", ...(opts.keepSessions ? [] : ["sessions"])];
	for (const name of names) {
		rmSync(join(TEST_DATA_DIR, name), { recursive: true, force: true });
	}
}

/**
 * Run `fn` and capture everything it writes to stdout — both process.stdout.write
 * and console.log/info/debug (Bun's console bypasses process.stdout.write).
 * stdout is the protocol channel for hooks (JSON reply) and MCP (JSON-RPC).
 */
export async function captureStdout(fn: () => Promise<unknown>): Promise<{ stdout: string; consoleLines: string[] }> {
	const origWrite = process.stdout.write;
	const origLog = console.log;
	const origInfo = console.info;
	const origDebug = console.debug;
	let stdout = "";
	const consoleLines: string[] = [];
	const fmt = (args: unknown[]) => args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
	process.stdout.write = ((chunk: unknown) => {
		stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
		return true;
	}) as typeof process.stdout.write;
	console.log = (...a: unknown[]) => void consoleLines.push(fmt(a));
	console.info = (...a: unknown[]) => void consoleLines.push(fmt(a));
	console.debug = (...a: unknown[]) => void consoleLines.push(fmt(a));
	try {
		await fn();
	} finally {
		process.stdout.write = origWrite;
		console.log = origLog;
		console.info = origInfo;
		console.debug = origDebug;
	}
	return { stdout, consoleLines };
}

/** Write a JSONL transcript (one record per line, trailing newline). */
export function writeTranscript(path: string, records: unknown[]): void {
	writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

export function fileExists(p: string): boolean {
	return existsSync(p);
}

/**
 * Pretend the active local model's weights are on disk so isEmbedderReady() is
 * true (hooks skip retrieval and enqueue a "warmup" job otherwise). The weights
 * are never loaded — @huggingface/transformers is mocked by preload.ts.
 */
export async function markEmbedderReady(): Promise<void> {
	const { LOCAL_MODELS, embedderInfo, modelCacheDir, isEmbedderReady } = await import("../../../plugin/src/embedder.js");
	const spec = LOCAL_MODELS[embedderInfo().model]!;
	const file = spec.dtype === "q8" ? "model_quantized.onnx" : spec.dtype === "fp32" ? "model.onnx" : `model_${spec.dtype}.onnx`;
	const dir = join(modelCacheDir(), spec.repo, "onnx");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, file), "fake weights");
	if (!isEmbedderReady()) throw new Error("markEmbedderReady: isEmbedderReady() still false");
}

/** Undo markEmbedderReady(). */
export async function markEmbedderMissing(): Promise<void> {
	const { modelCacheDir } = await import("../../../plugin/src/embedder.js");
	rmSync(modelCacheDir(), { recursive: true, force: true });
}
