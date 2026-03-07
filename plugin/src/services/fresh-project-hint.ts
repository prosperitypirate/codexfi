/**
 * Builds the [MEMORY - NEW PROJECT] hint injected into the system prompt
 * when the working directory has no codebase detected and no project memories.
 *
 * Pattern follows disabled-warning.ts:17-49.
 */

/**
 * Builds the system prompt hint for new/empty project directories.
 * Injected once on Turn 1 when no codebase is detected and no project memories exist.
 *
 * @param directory - The working directory path (project name extracted from last segment)
 * @returns A multi-line string starting with `[MEMORY - NEW PROJECT]`
 */
export function buildFreshProjectHint(directory: string): string {
	const projectName = directory.split("/").pop() ?? "this directory";
	return `[MEMORY - NEW PROJECT]
This appears to be a new or empty project directory ("${projectName}").
No project files were detected and no memories exist for this project yet.

As you help the user build this project, codexfi will automatically extract and remember:
- Project brief and architecture decisions
- Tech stack choices and configuration
- Important patterns and conventions

Memories will be available in future sessions automatically.`;
}
