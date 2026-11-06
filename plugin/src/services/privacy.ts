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

	// Orphan closing tag before any opening tag: the <private> was opened in an
	// earlier message/block — redact everything up to it.
	const firstClose = lower.indexOf(CLOSE_TAG);
	const firstOpen = lower.indexOf(OPEN_TAG);
	if (firstClose !== -1 && (firstOpen === -1 || firstClose < firstOpen)) {
		result = "[REDACTED]";
		cursor = firstClose + CLOSE_TAG.length;
	}

	while (cursor < content.length) {
		const openIdx = lower.indexOf(OPEN_TAG, cursor);
		if (openIdx === -1) {
			result += content.slice(cursor);
			break;
		}
		const closeIdx = lower.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length);
		if (closeIdx === -1) {
			// Unclosed tag — fail closed: redact everything after it (the closing
			// tag may have been cut off by truncation or live in another message).
			result += content.slice(cursor, openIdx) + "[REDACTED]";
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
