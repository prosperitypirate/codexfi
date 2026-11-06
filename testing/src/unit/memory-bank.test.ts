/**
 * Unit tests for services/memory-bank.ts — detecting a curated Memory Bank
 * (<project>/memory-bank/*.md) so codexfi can act as its complement.
 */

import "../helpers/preload.js"; // sandbox first: plugin modules read env/HOME at import time
import { describe, test, expect } from "bun:test";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { detectMemoryBank, MEMORY_BANK_CORE_FILES } from "../../../plugin/src/services/memory-bank.js";
import { makeTempDir } from "../helpers/test-env.js";

function makeBank(root: string, files: string[]): string {
	const bank = join(root, "memory-bank");
	mkdirSync(bank, { recursive: true });
	for (const f of files) writeFileSync(join(bank, f), `# ${f}\n`);
	return bank;
}

describe("detectMemoryBank", () => {
	test("lists the six core files", () => {
		expect([...MEMORY_BANK_CORE_FILES]).toEqual([
			"projectbrief.md", "productContext.md", "systemPatterns.md", "techContext.md", "activeContext.md", "progress.md",
		]);
	});

	test("no memory-bank directory → null", () => {
		expect(detectMemoryBank(makeTempDir("mb"))).toBeNull();
	});

	test("finds a bank in the cwd and reports only the core files present", () => {
		const root = makeTempDir("mb");
		const bank = makeBank(root, ["projectbrief.md", "activeContext.md", "notes.md"]);
		const info = detectMemoryBank(root)!;
		expect(info.dir).toBe(bank);
		expect(info.files.sort()).toEqual(["activeContext.md", "projectbrief.md"]);
	});

	test("lastSavedAt is the newest mtime among the core files", () => {
		const root = makeTempDir("mb");
		const bank = makeBank(root, ["projectbrief.md", "progress.md", "notes.md"]);
		const older = new Date("2026-01-01T00:00:00Z");
		const newer = new Date("2026-06-01T12:00:00Z");
		const newest = new Date("2026-09-01T00:00:00Z");
		utimesSync(join(bank, "projectbrief.md"), older, older);
		utimesSync(join(bank, "progress.md"), newer, newer);
		utimesSync(join(bank, "notes.md"), newest, newest); // not a core file — ignored
		expect(detectMemoryBank(root)!.lastSavedAt).toBe(newer.getTime());
	});

	test("walks up from a subdirectory to the repo-root bank", () => {
		const root = makeTempDir("mb");
		const bank = makeBank(root, ["techContext.md"]);
		const deep = join(root, "packages", "api", "src");
		mkdirSync(deep, { recursive: true });
		expect(detectMemoryBank(deep)!.dir).toBe(bank);
	});

	test("stops after maxDepth parents", () => {
		const root = makeTempDir("mb");
		makeBank(root, ["techContext.md"]);
		const deep = join(root, "a", "b", "c", "d", "e", "f");
		mkdirSync(deep, { recursive: true });
		expect(detectMemoryBank(deep)).toBeNull(); // 6 levels up, default maxDepth 4
		expect(detectMemoryBank(deep, 6)).not.toBeNull();
	});

	test("a memory-bank dir without any core file is ignored (keeps walking up)", () => {
		const root = makeTempDir("mb");
		const realBank = makeBank(root, ["progress.md"]);
		const child = join(root, "child");
		mkdirSync(child, { recursive: true });
		makeBank(child, ["README.md", "scratch.md"]);
		expect(detectMemoryBank(child)!.dir).toBe(realBank);
	});

	test("a file named memory-bank is not a bank", () => {
		const root = makeTempDir("mb");
		writeFileSync(join(root, "memory-bank"), "not a dir");
		expect(detectMemoryBank(root)).toBeNull();
	});
});
