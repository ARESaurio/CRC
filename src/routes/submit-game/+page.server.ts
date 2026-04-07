// =============================================================================
// Submit Game Page Server Load
// =============================================================================
// Loads genres, platforms, and challenges for the game submission form.
// Challenges are loaded from the site_settings DB table (managed via
// /admin/site-settings), with a YAML fallback if no DB entry exists.
// =============================================================================

import { getGenres, getPlatforms } from '$lib/server/data';
import { getChallengesConfig } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const genresData = getGenres() as Record<string, { label: string; aliases?: string[] }>;
	const genres = Object.entries(genresData)
		.filter(([, v]) => v && typeof v === 'object' && v.label)
		.map(([slug, data]) => ({ slug, label: data.label, aliases: data.aliases || [] }))
		.sort((a, b) => a.label.localeCompare(b.label));

	const platformsData = getPlatforms() as Record<string, { label: string; aliases?: string[] }>;
	const platforms = Object.entries(platformsData)
		.filter(([, v]) => v && typeof v === 'object' && v.label)
		.map(([slug, data]) => ({ slug, label: data.label, aliases: data.aliases || [] }))
		.sort((a, b) => a.label.localeCompare(b.label));

	// Challenges: DB (site_settings) first, YAML fallback
	const challengesData = await getChallengesConfig(locals.supabase);
	const challenges = Object.entries(challengesData)
		.filter(([, v]) => v && typeof v === 'object' && (v as any).label)
		.map(([slug, data]: [string, any]) => ({ slug, label: data.label, description: data.description || '', aliases: data.aliases || [] }))
		.sort((a, b) => a.label.localeCompare(b.label));

	return { genres, platforms, challenges };
};
