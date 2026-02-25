/**
 * Minimal argument parser — zero dependencies, handles positional args and --flags.
 *
 * Supports:
 *   --flag value      Named string flag
 *   --flag=value      Named string flag (equals syntax)
 *   --bool            Boolean flag (true when present)
 *   --no-bool         Negated boolean flag
 *   positional        Positional arguments (collected in order)
 *
 * Does NOT support: short flags (-f), combined shorts (-abc), subcommand nesting.
 * Intentionally minimal — this is a CLI tool, not a framework.
 */

export interface ParsedArgs {
	/** The subcommand (first positional arg). Empty string if none. */
	command: string;

	/** Remaining positional args after the subcommand. */
	positional: string[];

	/** Named flags (--key value or --key=value). */
	flags: Record<string, string>;

	/** Boolean flags (--flag or --no-flag). */
	booleans: Record<string, boolean>;
}

/**
 * Parse process.argv (or a custom argv) into structured args.
 *
 * @param argv - Argument array. Defaults to process.argv.slice(2) (skip node + script).
 * @param knownBooleans - Flag names that should be treated as boolean (no following value).
 */
export function parseArgs(
	argv: string[] = process.argv.slice(2),
	knownBooleans: Set<string> = new Set(["help", "verbose", "json", "user", "all", "no-color", "no-open", "version"]),
): ParsedArgs {
	const result: ParsedArgs = {
		command: "",
		positional: [],
		flags: {},
		booleans: {},
	};

	let i = 0;
	while (i < argv.length) {
		const arg = argv[i];

		// --flag=value syntax
		if (arg.startsWith("--") && arg.includes("=")) {
			const eqIdx = arg.indexOf("=");
			const key = arg.slice(2, eqIdx);
			const value = arg.slice(eqIdx + 1);
			result.flags[key] = value;
			i++;
			continue;
		}

		// --no-flag (negated boolean)
		if (arg.startsWith("--no-")) {
			const key = arg.slice(5);
			result.booleans[key] = false;
			i++;
			continue;
		}

		// --flag (boolean or string depending on knownBooleans)
		if (arg.startsWith("--")) {
			const key = arg.slice(2);

			if (knownBooleans.has(key)) {
				result.booleans[key] = true;
				i++;
				continue;
			}

			// Treat as string flag — consume next arg as value
			if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
				result.flags[key] = argv[i + 1];
				i += 2;
				continue;
			}

			// No following value — treat as boolean
			result.booleans[key] = true;
			i++;
			continue;
		}

		// -h shorthand for --help
		if (arg === "-h") {
			result.booleans["help"] = true;
			i++;
			continue;
		}

		// Positional argument
		result.positional.push(arg);
		i++;
	}

	// First positional is the command
	if (result.positional.length > 0) {
		result.command = result.positional.shift()!;
	}

	return result;
}

/**
 * Get a flag value with an optional default.
 */
export function getFlag(args: ParsedArgs, name: string, defaultValue?: string): string | undefined {
	return args.flags[name] ?? defaultValue;
}

/**
 * Get a flag value as an integer with an optional default.
 */
export function getFlagInt(args: ParsedArgs, name: string, defaultValue: number): number {
	const raw = args.flags[name];
	if (raw === undefined) return defaultValue;
	const parsed = parseInt(raw, 10);
	if (isNaN(parsed)) {
		console.error(`Invalid value for --${name}: expected integer, got "${raw}"`);
		process.exit(1);
	}
	return parsed;
}
