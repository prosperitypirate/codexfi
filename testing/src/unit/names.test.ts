/**
 * Unit tests for names.ts — NameRegistry persistence and lookup.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { nameRegistry } from "../../../plugin/src/names.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "oc-test-names-"));
	await nameRegistry.init(tempDir);
});

afterEach(() => {
	try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

describe("NameRegistry", () => {
	test("register and get a name", async () => {
		await nameRegistry.register("abc123", "my-project");
		expect(nameRegistry.get("abc123")).toBe("my-project");
	});

	test("returns undefined for unknown ID", () => {
		expect(nameRegistry.get("nonexistent")).toBeUndefined();
	});

	test("overwrites existing name", async () => {
		await nameRegistry.register("abc123", "old-name");
		await nameRegistry.register("abc123", "new-name");
		expect(nameRegistry.get("abc123")).toBe("new-name");
	});

	test("snapshot returns all registered names", async () => {
		await nameRegistry.register("id1", "project-alpha");
		await nameRegistry.register("id2", "project-beta");
		const snap = nameRegistry.snapshot();
		expect(snap["id1"]).toBe("project-alpha");
		expect(snap["id2"]).toBe("project-beta");
	});

	test("snapshot returns a copy (not a reference)", async () => {
		await nameRegistry.register("id1", "original");
		const snap = nameRegistry.snapshot();
		snap["id1"] = "mutated";
		expect(nameRegistry.get("id1")).toBe("original");
	});

	test("persists to disk and survives re-init", async () => {
		await nameRegistry.register("persist-test", "my-app");

		// Re-init from same directory
		await nameRegistry.init(tempDir);
		expect(nameRegistry.get("persist-test")).toBe("my-app");
	});

	test("handles missing file gracefully on init", async () => {
		// Note: nameRegistry is a singleton. init() with a dir that has no names.json
		// does not clear previously registered names (it only overwrites if file exists
		// or errors). This test verifies init doesn't throw on a missing file.
		const emptyDir = mkdtempSync(join(tmpdir(), "oc-test-names-empty-"));
		// Should not throw
		await nameRegistry.init(emptyDir);
		// Verify we can still register and read after init with empty dir
		await nameRegistry.register("fresh-id", "fresh-name");
		expect(nameRegistry.get("fresh-id")).toBe("fresh-name");
		try { rmSync(emptyDir, { recursive: true, force: true }); } catch {}
	});
});
