/**
 * `opencode-memory dashboard` — launch the on-demand web dashboard.
 *
 * Starts a Bun.serve() HTTP server on localhost:9120 (configurable via --port)
 * and opens the browser. Press Ctrl+C to shut down.
 *
 * Flags:
 *   --port <N>   Port to listen on (default: 9120)
 *   --no-open    Don't auto-open browser
 */

import type { ParsedArgs } from "../args.js";
import { getFlagInt } from "../args.js";
import * as fmt from "../fmt.js";
import { initDb } from "../shared.js";
import { ledger, activityLog } from "../../telemetry.js";
import { nameRegistry } from "../../names.js";
import { startDashboard } from "../../dashboard/server.js";

export async function run(args: ParsedArgs): Promise<void> {
	const port = getFlagInt(args, "port", 9120);
	const noOpen = args.booleans["no-open"] ?? false;

	// Initialize all data sources
	fmt.blank();
	const initMsg = "Initializing database";
	await fmt.spin(initMsg, async () => {
		await initDb();
		await ledger.init();
		await nameRegistry.init();
		await activityLog.init();
	});

	// Start HTTP server
	let server: ReturnType<typeof startDashboard>;
	try {
		server = startDashboard({ port });
	} catch (err) {
		fmt.blank();
		fmt.error(`Failed to start server. Is port ${port} in use?`);
		fmt.info(`Try: ${fmt.cyan(`opencode-memory dashboard --port ${port + 1}`)}`);
		fmt.blank();
		if (process.env.DEBUG && err instanceof Error) {
			console.error(fmt.dim(err.message));
		}
		process.exit(1);
	}
	const url = `http://localhost:${server.port}`;

	fmt.blank();
	fmt.success(`Dashboard running at ${fmt.cyanBold(url)}`);
	fmt.info(`Press ${fmt.bold("Ctrl+C")} to stop`);
	fmt.blank();

	// Open browser unless --no-open
	if (!noOpen) {
		try {
			const cmd = process.platform === "darwin"
				? ["open", url]
				: process.platform === "win32"
					? ["cmd", "/c", "start", url]
					: ["xdg-open", url];

			Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
		} catch {
			// Non-fatal — user can open manually
			fmt.warn("Could not open browser automatically. Open the URL above manually.");
		}
	}

	// Keep alive until Ctrl+C
	await new Promise<void>((resolve) => {
		let stopping = false;
		const shutdown = () => {
			if (stopping) return;
			stopping = true;
			fmt.blank();
			fmt.info("Shutting down dashboard...");
			server.stop(true);
			resolve();
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
	});

	fmt.success("Dashboard stopped.");
	fmt.blank();
}
