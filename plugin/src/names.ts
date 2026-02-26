/**
 * NameRegistry — maps opaque hash IDs (sha256[:16]) to human-readable display names.
 *
 * The plugin calls registerName() on startup so the dashboard/CLI can show project folder
 * names and git usernames instead of raw hashes. Persists to DATA_DIR/names.json.
 */

import { DATA_DIR } from "./config.js";

class NameRegistry {
	private data: Record<string, string> = {};
	private path = "";

	async init(dataDir: string = DATA_DIR): Promise<void> {
		this.path = `${dataDir}/names.json`;
		try {
			const file = Bun.file(this.path);
			if (await file.exists()) {
				this.data = await file.json();
			}
		} catch {
			this.data = {};
		}
	}

	private async save(): Promise<void> {
		if (!this.path) return;
		try {
			await Bun.write(this.path, JSON.stringify(this.data, null, 2));
		} catch (e) {
			console.warn("Name registry save error:", e);
		}
	}

	async register(userId: string, name: string): Promise<void> {
		if (this.data[userId] !== name) {
			this.data[userId] = name;
			await this.save();
		}
	}

	/**
	 * Re-read names.json from disk — used by the dashboard to pick up
	 * names registered by the plugin in a separate process.
	 */
	async load(): Promise<void> {
		if (!this.path) return;
		try {
			const file = Bun.file(this.path);
			if (await file.exists()) {
				this.data = await file.json();
			}
		} catch {
			// Non-fatal — keep existing data
		}
	}

	get(userId: string): string | undefined {
		return this.data[userId];
	}

	snapshot(): Record<string, string> {
		return { ...this.data };
	}
}

// Module-level singleton
export const nameRegistry = new NameRegistry();
