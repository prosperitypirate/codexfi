/**
 * Privacy tag stripping — removes <private>...</private> content before storage.
 *
 * Applied in all 4 ingestion paths (memory tool add, auto-save, compaction, init).
 * Uses iterative indexOf-based parsing instead of regex to avoid polynomial
 * backtracking on adversarial input.
 */

const OPEN_TAG = "<private>";
const CLOSE_TAG = "</private>";

export function containsPrivateTag(content: string): boolean {
	const lower = content.toLowerCase();
	const openIdx = lower.indexOf(OPEN_TAG);
	if (openIdx === -1) return false;
	return lower.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length) !== -1;
}

export function stripPrivateContent(content: string): string {
	// Iterative approach: find each <private>...</private> pair and replace with [REDACTED].
	// Case-insensitive matching via lowercased shadow string; edits applied to original.
	let result = "";
	let cursor = 0;
	const lower = content.toLowerCase();

	while (cursor < content.length) {
		const openIdx = lower.indexOf(OPEN_TAG, cursor);
		if (openIdx === -1) {
			result += content.slice(cursor);
			break;
		}
		const closeIdx = lower.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length);
		if (closeIdx === -1) {
			// Unclosed tag — keep remaining content as-is
			result += content.slice(cursor);
			break;
		}
		// Append content before the tag, then the redaction marker
		result += content.slice(cursor, openIdx) + "[REDACTED]";
		cursor = closeIdx + CLOSE_TAG.length;
	}

	return result;
}

export function isFullyPrivate(content: string): boolean {
	const stripped = stripPrivateContent(content).trim();
	return stripped === "[REDACTED]" || stripped === "";
}
