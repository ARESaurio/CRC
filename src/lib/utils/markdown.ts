// =============================================================================
// Markdown & Sanitization Utilities
// =============================================================================
// Renders markdown content and sanitizes the HTML output with sanitize-html.
// All markdown rendering goes through this module to ensure consistent
// XSS protection regardless of content source.
//
// NOTE: We use sanitize-html instead of isomorphic-dompurify because
// DOMPurify requires a DOM (jsdom on the server), which is incompatible
// with Cloudflare Workers where SSR runs. sanitize-html is pure JS.
// =============================================================================

import { marked } from 'marked';
import sanitize from 'sanitize-html';

/** Allowed tags and attributes for rendered markdown. */
const SANITIZE_OPTIONS: sanitize.IOptions = {
	allowedTags: [
		// Block
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'p', 'blockquote', 'pre', 'code',
		'ul', 'ol', 'li', 'hr', 'br', 'div',
		'table', 'thead', 'tbody', 'tr', 'th', 'td',
		// Inline
		'a', 'strong', 'em', 'b', 'i', 'u', 's', 'del',
		'sub', 'sup', 'small', 'span'
	],
	allowedAttributes: {
		a: ['href', 'title', 'target', 'rel'],
		th: ['align'],
		td: ['align'],
		code: ['class'],
		span: ['class', 'data-def', 'tabindex'],
		pre: ['class']
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	transformTags: {
		a: (tagName, attribs) => {
			if (attribs.target === '_blank') {
				attribs.rel = 'noopener noreferrer';
			}
			return { tagName, attribs };
		}
	}
};

/** A glossary term for inline tooltip rendering. */
export interface GlossaryTerm {
	slug: string;
	label: string;
	definition: string;
	aliases?: string[];
}

/**
 * Process {{tooltip:slug}} syntax into tooltip spans.
 * Replaces {{tooltip:slug}} or {{tooltip:slug|Custom Label}} with a styled span.
 * Terms are matched by slug or aliases (case-insensitive).
 */
function processTooltips(input: string, terms: GlossaryTerm[]): string {
	if (!terms.length) return input;

	// Build a lookup map: slug → term, alias → term
	const lookup = new Map<string, GlossaryTerm>();
	for (const t of terms) {
		lookup.set(t.slug.toLowerCase(), t);
		for (const alias of t.aliases || []) {
			lookup.set(alias.toLowerCase(), t);
		}
	}

	// Replace {{tooltip:key}} or {{tooltip:key|Custom Label}}
	return input.replace(/\{\{tooltip:([^|}]+)(?:\|([^}]+))?\}\}/g, (_match, key: string, customLabel?: string) => {
		const term = lookup.get(key.trim().toLowerCase());
		if (!term) return customLabel || key; // graceful fallback: just render the text
		const label = customLabel?.trim() || term.label;
		const escapedDef = term.definition.replace(/"/g, '&quot;').replace(/</g, '&lt;');
		return `<span class="glossary-tip" tabindex="0" data-def="${escapedDef}">${label}</span>`;
	});
}

/**
 * Render markdown string to sanitized HTML.
 * Used with {@html renderMarkdown(content)} in Svelte templates.
 *
 * sanitize-html strips any injected scripts, event handlers, or dangerous
 * HTML while preserving safe formatting tags.
 *
 * @param glossaryTerms - Optional array of glossary terms for {{tooltip:slug}} processing
 */
export function renderMarkdown(input: string, glossaryTerms?: GlossaryTerm[]): string {
	if (!input) return '';
	const processed = glossaryTerms?.length ? processTooltips(input, glossaryTerms) : input;
	const raw = marked.parse(processed, { async: false }) as string;
	return sanitize(raw, SANITIZE_OPTIONS);
}

/**
 * Strip HTML tags and limit length.
 * For plain text contexts like meta descriptions, search excerpts, etc.
 */
export function sanitizeText(input: string, maxLength = 500): string {
	if (!input || typeof input !== 'string') return '';
	return input
		.replace(/<[^>]*>/g, '')
		.trim()
		.slice(0, maxLength);
}
