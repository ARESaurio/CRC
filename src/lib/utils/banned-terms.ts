/**
 * Client-side banned terms validation.
 *
 * Mirrors the slur_patterns, spam, and malicious patterns from
 * src/data/config/banned-terms.yml so forms can flag issues before submission.
 * Full server-side validation also happens during verifier review.
 */

const SLUR_PATTERNS: RegExp[] = [
	/n[i1!][gq]{2}[e3a]r/gi,
	/f[a@4][gq]{2}[o0][t7]/gi,
	/r[e3][t7][a@4]rd/gi,
];

const SPAM_TERMS = [
	'buy now', 'click here', 'make money fast', 'free gift',
	'act now', 'limited time offer', 'congratulations you won', 'claim your prize',
];

const MALICIOUS_TERMS = [
	'<script', '</script', 'javascript:', 'onclick=', 'onerror=',
	'onload=', 'eval(', 'document.cookie', 'document.write',
	'{{tooltip:', '{{ tooltip:',
];

const EXCEPTIONS = ['glitch', 'exploit', 'any%', 'trigger', 'flag'];

/**
 * Check text against banned terms.
 * Returns null if clean, or a human-readable reason string if banned content is detected.
 */
export function checkBannedTerms(text: string): string | null {
	if (!text) return null;
	const lower = text.toLowerCase();

	// Check exceptions first — if the text only matches because of an exception, skip
	for (const pattern of SLUR_PATTERNS) {
		// Reset lastIndex for global regexes
		pattern.lastIndex = 0;
		const match = pattern.exec(text);
		if (match) {
			const matched = match[0].toLowerCase();
			const isException = EXCEPTIONS.some(ex => matched.includes(ex));
			if (!isException) return 'Your text contains language that is not allowed.';
		}
	}

	for (const term of SPAM_TERMS) {
		if (lower.includes(term)) return 'Your text contains spam-like content.';
	}

	for (const term of MALICIOUS_TERMS) {
		if (lower.includes(term)) return 'Your text contains disallowed code patterns.';
	}

	return null;
}
