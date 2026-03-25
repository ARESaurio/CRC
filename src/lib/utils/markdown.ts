// =============================================================================
// Markdown & Sanitization Utilities
// =============================================================================
// Renders markdown content and sanitizes the HTML output with sanitize-html.
// All markdown rendering goes through this module to ensure consistent
// XSS protection regardless of content source.
//
// GLOSSARY TOOLTIPS:
// 1. Manual: {{tooltip:slug}} or {{tooltip:slug|Custom Label}} in markdown
// 2. Auto-match: term labels/aliases are found in rendered HTML text nodes
//    and wrapped with tooltip spans automatically (first occurrence only).
//
// Call setGlossaryTerms(terms) once at app init (from +layout.svelte) to
// enable tooltips across all renderMarkdown() calls with zero call-site changes.
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

// =============================================================================
// Module-level glossary cache
// =============================================================================
// Safe for SvelteKit: terms are identical for all users (read-only public data).
// On the server, the cache is shared across requests (fine for static content).
// On the client, it's per-tab.

let _glossaryTerms: GlossaryTerm[] = [];

/** Populate the glossary cache. Call once from +layout.svelte. */
export function setGlossaryTerms(terms: GlossaryTerm[]): void {
	_glossaryTerms = terms || [];
}

/** Read the current glossary cache (for components that need raw access). */
export function getCachedGlossaryTerms(): GlossaryTerm[] {
	return _glossaryTerms;
}

/**
 * Strip {{tooltip:...}} syntax from user input.
 * Replaces {{tooltip:slug}} with "slug" and {{tooltip:slug|Label}} with "Label".
 * Used to sanitize user-submitted content where manual tooltip syntax is not allowed.
 */
export function stripTooltipSyntax(input: string): string {
	if (!input || typeof input !== 'string') return input;
	return input.replace(/\{\{tooltip:([^|}]+)(?:\|([^}]+))?\}\}/g, (_match, key: string, customLabel?: string) => {
		return customLabel?.trim() || key.trim();
	});
}

/**
 * Recursively strip {{tooltip:...}} syntax from all string values in an object/array.
 * Used for complex data structures like forum draft data.
 */
export function stripTooltipSyntaxDeep<T>(obj: T): T {
	if (typeof obj === 'string') return stripTooltipSyntax(obj) as T;
	if (Array.isArray(obj)) return obj.map(stripTooltipSyntaxDeep) as T;
	if (obj && typeof obj === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(obj)) {
			result[key] = stripTooltipSyntaxDeep(val);
		}
		return result as T;
	}
	return obj;
}

// =============================================================================
// Manual tooltip processing — {{tooltip:slug}} syntax
// =============================================================================

/**
 * Process {{tooltip:slug}} syntax into tooltip spans.
 * Replaces {{tooltip:slug}} or {{tooltip:slug|Custom Label}} with a styled span.
 * Terms are matched by slug or aliases (case-insensitive).
 */
function processManualTooltips(input: string, terms: GlossaryTerm[]): string {
	if (!terms.length) return input;

	const lookup = new Map<string, GlossaryTerm>();
	for (const t of terms) {
		lookup.set(t.slug.toLowerCase(), t);
		for (const alias of t.aliases || []) {
			lookup.set(alias.toLowerCase(), t);
		}
	}

	return input.replace(/\{\{tooltip:([^|}]+)(?:\|([^}]+))?\}\}/g, (_match, key: string, customLabel?: string) => {
		const term = lookup.get(key.trim().toLowerCase());
		if (!term) return customLabel || key;
		const label = customLabel?.trim() || term.label;
		const escapedDef = term.definition.replace(/"/g, '&quot;').replace(/</g, '&lt;');
		return `<span class="glossary-tip" tabindex="0" data-def="${escapedDef}">${label}</span>`;
	});
}

// =============================================================================
// Auto-match glossary terms in rendered HTML
// =============================================================================
// Scans text nodes in sanitized HTML and wraps first occurrence of each
// glossary term (label or alias) with a tooltip span.
//
// Rules:
// - Whole-word matching only (word boundaries)
// - Case-insensitive
// - First occurrence per term, then stop
// - Skip text inside: <code>, <pre>, <a>, existing <span class="glossary-tip">
// - Minimum term length of 2 chars to avoid false positives

const SKIP_TAGS = new Set(['code', 'pre', 'a']);

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeTooltipSpan(term: GlossaryTerm, matchedText: string): string {
	const escapedDef = term.definition.replace(/"/g, '&quot;').replace(/</g, '&lt;');
	return `<span class="glossary-tip" tabindex="0" data-def="${escapedDef}">${matchedText}</span>`;
}

/**
 * Auto-match glossary terms in sanitized HTML.
 *
 * Walks the HTML string, splitting into tag and text tokens.
 * Tracks depth inside skip tags. For eligible text tokens,
 * replaces first occurrence of each unmatched term.
 */
function autoMatchGlossary(html: string, terms: GlossaryTerm[]): string {
	if (!terms.length || !html) return html;

	// Collect matchable phrases → term, longest first
	const phrases: { pattern: string; term: GlossaryTerm }[] = [];
	for (const t of terms) {
		if (t.label.length >= 2) phrases.push({ pattern: t.label, term: t });
		for (const alias of t.aliases || []) {
			if (alias.length >= 2) phrases.push({ pattern: alias, term: t });
		}
	}
	phrases.sort((a, b) => b.pattern.length - a.pattern.length);
	if (!phrases.length) return html;

	// Single regex matching any phrase (whole-word, case-insensitive)
	const combinedPattern = phrases.map(p => escapeRegex(p.pattern)).join('|');
	const termRegex = new RegExp(`\\b(${combinedPattern})\\b`, 'gi');

	// Lookup: lowercase text → term
	const phraseLookup = new Map<string, GlossaryTerm>();
	for (const p of phrases) {
		const key = p.pattern.toLowerCase();
		if (!phraseLookup.has(key)) phraseLookup.set(key, p.term);
	}

	// Track which slugs have been matched
	const matched = new Set<string>();

	// Tokenize HTML into tags and text
	const tokens = html.split(/(<[^>]+>)/g);
	let skipDepth = 0;
	let insideGlossaryTip = false;

	const result: string[] = [];
	for (const token of tokens) {
		if (token.startsWith('<')) {
			result.push(token);
			const closeMatch = token.match(/^<\/(\w+)/);
			if (closeMatch) {
				const tag = closeMatch[1].toLowerCase();
				if (tag === 'span' && insideGlossaryTip) { insideGlossaryTip = false; continue; }
				if (SKIP_TAGS.has(tag) && skipDepth > 0) skipDepth--;
			} else {
				const openMatch = token.match(/^<(\w+)/);
				if (openMatch) {
					const tag = openMatch[1].toLowerCase();
					if (tag === 'span' && token.includes('glossary-tip')) { insideGlossaryTip = true; continue; }
					if (SKIP_TAGS.has(tag) && !token.endsWith('/>')) skipDepth++;
				}
			}
		} else {
			if (skipDepth > 0 || insideGlossaryTip || !token.trim()) {
				result.push(token);
				continue;
			}
			// Reset lastIndex for the global regex
			termRegex.lastIndex = 0;
			const replaced = token.replace(termRegex, (match) => {
				const term = phraseLookup.get(match.toLowerCase());
				if (!term || matched.has(term.slug)) return match;
				matched.add(term.slug);
				return makeTooltipSpan(term, match);
			});
			result.push(replaced);
		}
	}

	return result.join('');
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Render markdown string to sanitized HTML with glossary tooltips.
 *
 * Pipeline:
 * 1. Process {{tooltip:slug}} manual syntax (on raw markdown)
 * 2. Convert markdown → HTML via marked
 * 3. Sanitize HTML
 * 4. Auto-match remaining glossary terms in text nodes
 *
 * @param input - Raw markdown string
 * @param glossaryTerms - Optional explicit terms (overrides module cache)
 */
export function renderMarkdown(input: string, glossaryTerms?: GlossaryTerm[]): string {
	if (!input) return '';
	const terms = glossaryTerms ?? _glossaryTerms;
	const processed = terms.length ? processManualTooltips(input, terms) : input;
	const raw = marked.parse(processed, { async: false }) as string;
	const clean = sanitize(raw, SANITIZE_OPTIONS);
	return terms.length ? autoMatchGlossary(clean, terms) : clean;
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
