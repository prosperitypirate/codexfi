/**
 * Terminal output formatting — ANSI colors, tables, progress, and layout.
 *
 * Zero dependencies. Uses ANSI escape sequences directly.
 * Respects NO_COLOR (https://no-color.org/) and dumb terminals.
 */

// ── Color support detection ─────────────────────────────────────────────────────

const supportsColor =
	!process.env.NO_COLOR &&
	process.env.TERM !== "dumb" &&
	(process.stdout.isTTY ?? false);

// ── Unicode support detection ───────────────────────────────────────────────────
//
// Color support (isTTY) and UTF-8 encoding capability are independent.
// A terminal can be a TTY with ANSI colors but decode bytes as Latin-1,
// rendering multi-byte UTF-8 sequences as garbage (e.g. ✓ → â, • → â¢).
//
// We check two signals:
//   1. Locale env vars — LANG / LC_ALL / LC_CTYPE containing "UTF-8" or "utf8"
//   2. Known terminal programs that always use UTF-8 regardless of locale
//      (iTerm2, macOS Terminal.app, VSCode integrated terminal, Windows Terminal)
//
// If neither confirms UTF-8, we fall back to plain ASCII symbols.

function detectUnicode(): boolean {
	// Known-good terminal programs that always handle UTF-8
	const termProgram = process.env.TERM_PROGRAM ?? "";
	if (["iTerm.app", "Apple_Terminal", "vscode", "WindowsTerminal"].includes(termProgram)) {
		return true;
	}

	// Locale env vars
	const locale = process.env.LC_ALL ?? process.env.LC_CTYPE ?? process.env.LANG ?? "";
	if (/utf-?8/i.test(locale)) return true;

	// WT_SESSION is set by Windows Terminal
	if (process.env.WT_SESSION) return true;

	return false;
}

const supportsUnicode = detectUnicode();

// ── ANSI escape helpers ─────────────────────────────────────────────────────────

function ansi(code: string): (text: string) => string {
	if (!supportsColor) return (text) => text;
	return (text) => `\x1b[${code}m${text}\x1b[0m`;
}

/** Bold white text. */
export const bold = ansi("1");

/** Dim/muted text. */
export const dim = ansi("2");

/** Green — success, checkmarks, active items. */
export const green = ansi("32");

/** Yellow — warnings, pending items. */
export const yellow = ansi("33");

/** Red — errors, missing items. */
export const red = ansi("31");

/** Cyan — informational highlights, headers. */
export const cyan = ansi("36");

/** Magenta — accents, counts. */
export const magenta = ansi("35");

/** Blue — links, paths. */
export const blue = ansi("34");

/** Bold green — primary success. */
export const greenBold = (text: string): string => bold(green(text));

/** Bold red — primary error. */
export const redBold = (text: string): string => bold(red(text));

/** Bold cyan — section headers. */
export const cyanBold = (text: string): string => bold(cyan(text));

// ── Unicode symbols ─────────────────────────────────────────────────────────────

/** Check/cross/warning symbols — falls back to ASCII if Unicode is not supported. */
export const sym = {
	check: supportsUnicode ? "✓" : "[ok]",
	cross: supportsUnicode ? "✗" : "[!!]",
	warn: supportsUnicode ? "⚠" : "[!]",
	arrow: supportsUnicode ? "→" : "->",
	bullet: supportsUnicode ? "•" : "-",
	bar: supportsUnicode ? "│" : "|",
	dash: supportsUnicode ? "─" : "-",
} as const;

// ── Layout helpers ──────────────────────────────────────────────────────────────

/** Print a horizontal rule. */
export function hr(width = 60): void {
	console.log(dim(sym.dash.repeat(width)));
}

/** Print a section header with underline. */
export function header(title: string): void {
	console.log();
	console.log(cyanBold(title));
	hr(title.length + 4);
}

/** Print a labeled key-value pair. */
export function kv(key: string, value: string | number, indent = 2): void {
	const pad = " ".repeat(indent);
	console.log(`${pad}${dim(key + ":")} ${value}`);
}

/** Print an info line with bullet. */
export function info(text: string): void {
	console.log(`  ${dim(sym.bullet)} ${text}`);
}

/** Print a success line. */
export function success(text: string): void {
	console.log(`  ${green(sym.check)} ${text}`);
}

/** Print a warning line. */
export function warn(text: string): void {
	console.log(`  ${yellow(sym.warn)} ${text}`);
}

/** Print an error line. */
export function error(text: string): void {
	console.log(`  ${red(sym.cross)} ${text}`);
}

/** Print a blank line. */
export function blank(): void {
	console.log();
}

// ── Table rendering ─────────────────────────────────────────────────────────────

export interface Column {
	/** Column header label. */
	label: string;

	/** Minimum width (defaults to label length + 2). */
	minWidth?: number;

	/** Alignment: "left" (default) or "right". */
	align?: "left" | "right";

	/** Optional color function applied to cell content. */
	color?: (text: string) => string;
}

/**
 * Render a formatted table to stdout.
 *
 * Automatically calculates column widths from data. Truncates oversized cells
 * with ellipsis to prevent wrapping. Supports left/right alignment and per-column colors.
 *
 * @param columns - Column definitions (label, width, alignment, color).
 * @param rows - Array of string arrays, one per row. Must match column count.
 * @param maxWidth - Maximum total table width (defaults to terminal width or 100).
 */
export function table(columns: Column[], rows: string[][], maxWidth?: number): void {
	const termWidth = maxWidth ?? (process.stdout.columns ?? 100);

	// Calculate column widths: max(minWidth, headerLen, maxDataLen), then clamp to fit terminal.
	const widths = columns.map((col, i) => {
		const headerLen = col.label.length;
		const dataMax = rows.reduce((max, row) => Math.max(max, stripAnsi(row[i] ?? "").length), 0);
		return Math.max(col.minWidth ?? 0, headerLen, dataMax);
	});

	// If total exceeds terminal width, proportionally shrink the widest columns.
	const gap = 3; // " | " between columns
	const totalGap = gap * (columns.length - 1);
	const totalWidth = widths.reduce((a, b) => a + b, 0) + totalGap;

	if (totalWidth > termWidth) {
		const excess = totalWidth - termWidth;
		const shrinkable = widths.map((w) => Math.max(0, w - 8)); // don't shrink below 8
		const shrinkTotal = shrinkable.reduce((a, b) => a + b, 0) || 1;
		for (let i = 0; i < widths.length; i++) {
			widths[i] -= Math.floor((shrinkable[i] / shrinkTotal) * excess);
			widths[i] = Math.max(widths[i], 8);
		}
	}

	// Render header
	const headerLine = columns
		.map((col, i) => padCell(bold(col.label), widths[i], col.align ?? "left"))
		.join(dim(" " + sym.bar + " "));
	console.log("  " + headerLine);

	// Render separator
	const sepLine = widths.map((w) => sym.dash.repeat(w)).join(dim("-+-"));
	console.log("  " + dim(sepLine));

	// Render rows
	for (const row of rows) {
		const cells = columns.map((col, i) => {
			const raw = row[i] ?? "";
			const truncated = truncate(raw, widths[i]);
			const colored = col.color ? col.color(truncated) : truncated;
			return padCell(colored, widths[i], col.align ?? "left");
		});
		console.log("  " + cells.join(dim(" " + sym.bar + " ")));
	}
}

// ── Internal string utilities ───────────────────────────────────────────────────

/** Strip ANSI escape codes for width calculation. */
function stripAnsi(str: string): string {
	return str.replace(/\x1b\[\d+(;\d+)*m/g, "");
}

/** Truncate string to maxLen, appending ellipsis if needed. */
function truncate(str: string, maxLen: number): string {
	const visible = stripAnsi(str);
	if (visible.length <= maxLen) return str;
	const ellipsis = supportsUnicode ? "…" : "...";
	return str.slice(0, maxLen - ellipsis.length) + ellipsis;
}

/** Pad a (possibly ANSI-colored) string to targetLen with correct visual width. */
function padCell(str: string, targetLen: number, align: "left" | "right"): string {
	const visible = stripAnsi(str).length;
	const padding = Math.max(0, targetLen - visible);
	return align === "right" ? " ".repeat(padding) + str : str + " ".repeat(padding);
}

// ── Progress / spinner ──────────────────────────────────────────────────────────

const SPINNER_FRAMES = supportsUnicode
	? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
	: ["-", "\\", "|", "/"];

/**
 * Display a spinner with a message while an async operation runs.
 *
 * Falls back to a simple "Working..." message on non-TTY terminals.
 * Returns the result of the operation.
 */
export async function spin<T>(message: string, operation: () => Promise<T>): Promise<T> {
	if (!supportsColor) {
		process.stdout.write(`  ${message}... `);
		const result = await operation();
		console.log("done");
		return result;
	}

	let frame = 0;
	const interval = setInterval(() => {
		const spinner = cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
		process.stdout.write(`\r  ${spinner} ${message}`);
		frame++;
	}, 80);

	try {
		const result = await operation();
		clearInterval(interval);
		process.stdout.write(`\r  ${green(sym.check)} ${message}\n`);
		return result;
	} catch (err) {
		clearInterval(interval);
		process.stdout.write(`\r  ${red(sym.cross)} ${message}\n`);
		throw err;
	}
}

// ── Banner ──────────────────────────────────────────────────────────────────────

/**
 * Print the CLI banner with version info.
 */
export function banner(version: string): void {
	console.log();
	console.log(
		cyanBold("  codexfi") + dim(` v${version}`) +
		dim(" — persistent memory for AI coding agents")
	);
	hr(60);
}
