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
		span: ['class'],
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

/**
 * Render markdown string to sanitized HTML.
 * Used with {@html renderMarkdown(content)} in Svelte templates.
 *
 * sanitize-html strips any injected scripts, event handlers, or dangerous
 * HTML while preserving safe formatting tags.
 */
export function renderMarkdown(input: string): string {
	if (!input) return '';
	const raw = marked.parse(input, { async: false }) as string;
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
