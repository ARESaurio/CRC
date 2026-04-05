// =============================================================================
// Server-Side Static Data Loading (Cloudflare Workers Compatible)
// =============================================================================
// Loads STATIC content from repo files via Vite's import.meta.glob.
// This data is embedded at build time — changes require a redeploy.
//
// DYNAMIC content (games, runs, runners, achievements, teams) is loaded
// from Supabase at request time via $lib/server/supabase.ts.
// =============================================================================

import yaml from 'js-yaml';
import type {
	Game,
	Post,
	AdminConfig,
	DefaultRuleSet,
	BannedTermsConfig,
	ChallengesConfig,
	GlossaryConfig
} from '$lib/types';

// ─── Frontmatter Parser ─────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { data: {}, content: raw.trim() };
	return {
		data: (yaml.load(match[1]) as Record<string, unknown>) || {},
		content: match[2].trim()
	};
}

// ─── Import static files at build time ──────────────────────────────────────

const postFiles = import.meta.glob('/src/data/posts/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const configFiles = import.meta.glob('/src/data/config/*.yml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const historyFiles = import.meta.glob('/src/data/config/history/*.yml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const staffGuideFiles = import.meta.glob('/src/data/staff-guides/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function filename(filepath: string): string {
	return filepath.split('/').pop() || '';
}

function loadYaml<T>(configName: string): T {
	const key = Object.keys(configFiles).find((k) => k.endsWith(`/${configName}`));
	if (!key || !configFiles[key]) {
		throw new Error(`Config file not found: ${configName}`);
	}
	return yaml.load(configFiles[key]) as T;
}

// ─── Posts ───────────────────────────────────────────────────────────────────

let _posts: Post[] | null = null;

export function getPosts(): Post[] {
	if (!_posts) {
		_posts = Object.entries(postFiles)
			.filter(([filepath]) => {
				const name = filename(filepath);
				return name.endsWith('.md') && name !== 'README.md';
			})
			.map(([filepath, raw]) => {
				const { data, content } = parseFrontmatter(raw);
				const name = filename(filepath);
				const slug = name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
				return {
					...data,
					slug,
					content
				} as Post;
			})
			.sort((a, b) => {
				const dateA = a.date instanceof Date ? a.date : new Date(a.date);
				const dateB = b.date instanceof Date ? b.date : new Date(b.date);
				return dateB.getTime() - dateA.getTime();
			});
	}
	return _posts;
}

// ─── History ────────────────────────────────────────────────────────────────

export interface HistoryEntry {
	date: string;
	action: string;
	target?: string;
	note?: string;
	by?: {
		discord?: string;
		github?: string;
	};
}

export function getHistory(gameId: string): HistoryEntry[] {
	const key = Object.keys(historyFiles).find((k) => k.endsWith(`/${gameId}.yml`));
	if (!key || !historyFiles[key]) return [];
	const data = yaml.load(historyFiles[key]) as HistoryEntry[] | null;
	return (data || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Config Loaders ─────────────────────────────────────────────────────────

export function getAdminConfig(): AdminConfig {
	return loadYaml<AdminConfig>('admin-config.yml');
}

export function getDefaultRules(): DefaultRuleSet {
	return loadYaml<DefaultRuleSet>('default-rules.yml');
}

export function getPlatforms(): Record<string, { label: string; icon?: string }> {
	return loadYaml<Record<string, { label: string; icon?: string }>>('platforms.yml');
}

export function getGenres(): Record<string, { label: string }> {
	return loadYaml<Record<string, { label: string }>>('genres.yml');
}

export function getBannedTerms(): BannedTermsConfig {
	return loadYaml<BannedTermsConfig>('banned-terms.yml');
}

export function getChallenges(): ChallengesConfig {
	return loadYaml<ChallengesConfig>('challenges.yml');
}

export function getGlossary(): GlossaryConfig {
	return loadYaml<GlossaryConfig>('glossary.yml');
}

// ─── Staff Guides ──────────────────────────────────────────────────────────

export interface StaffGuide {
	slug: string;
	content: string;
}

export function getStaffGuides(): StaffGuide[] {
	return Object.entries(staffGuideFiles)
		.filter(([filepath]) => !filename(filepath).startsWith('README'))
		.map(([filepath, raw]) => ({
			slug: filename(filepath).replace(/\.md$/, ''),
			content: raw
		}));
}

// ─── Category Utilities ────────────────────────────────────────────────────
// Pure functions that operate on a Game object (from Supabase).
// No database access needed — just processes the JSONB data.

export interface CategoryInfo {
	slug: string;
	label: string;
	description?: string;
	tier: 'full-runs' | 'mini-challenges' | 'player-made';
	parentGroup?: string;
	parentGroupLabel?: string;
	isGroup?: boolean;
	childSlugs?: string[];
}

export function findCategory(
	game: Game,
	tier: string,
	categorySlug: string
): CategoryInfo | null {
	if (tier === 'full-runs') {
		const cat = game.full_runs?.find((c) => c.slug === categorySlug);
		if (cat) {
			return { slug: cat.slug, label: cat.label, description: cat.description, tier: 'full-runs' };
		}
	}

	if (tier === 'mini-challenges') {
		for (const group of game.mini_challenges || []) {
			if (group.slug === categorySlug) {
				return {
					slug: group.slug,
					label: group.label,
					description: group.description,
					tier: 'mini-challenges',
					isGroup: true,
					childSlugs: (group.children || []).map((c: any) => c.slug)
				};
			}
			const child = group.children?.find((c) => c.slug === categorySlug);
			if (child) {
				return {
					slug: child.slug,
					label: child.label,
					tier: 'mini-challenges',
					parentGroup: group.slug,
					parentGroupLabel: group.label
				};
			}
		}
	}

	if (tier === 'player-made') {
		const cat = game.player_made?.find((c) => c.slug === categorySlug);
		if (cat) {
			return {
				slug: cat.slug,
				label: cat.label,
				description: cat.description,
				tier: 'player-made'
			};
		}
	}

	return null;
}

export function getAllCategories(game: Game): CategoryInfo[] {
	const categories: CategoryInfo[] = [];

	for (const cat of game.full_runs || []) {
		categories.push({
			slug: cat.slug,
			label: cat.label,
			description: cat.description,
			tier: 'full-runs'
		});
	}

	for (const group of game.mini_challenges || []) {
		categories.push({
			slug: group.slug,
			label: group.label,
			description: group.description,
			tier: 'mini-challenges'
		});
		for (const child of group.children || []) {
			categories.push({
				slug: child.slug,
				label: child.label,
				tier: 'mini-challenges',
				parentGroup: group.slug,
				parentGroupLabel: group.label
			});
		}
	}

	for (const cat of game.player_made || []) {
		categories.push({
			slug: cat.slug,
			label: cat.label,
			description: cat.description,
			tier: 'player-made'
		});
	}

	return categories;
}
