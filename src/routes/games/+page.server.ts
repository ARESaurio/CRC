import { getActiveGames, getRunCountsByGame, getChallengesConfig } from '$lib/server/supabase';
import { getPlatforms, getGenres } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Fetch games and all run counts in parallel (2 queries instead of N+1)
	const [games, runCounts, challengesRaw] = await Promise.all([
		getActiveGames(locals.supabase),
		getRunCountsByGame(locals.supabase),
		getChallengesConfig(locals.supabase)
	]);

	const gamesWithCounts = games.map((g) => ({
		...g,
		runCount: runCounts.get(g.game_id) || 0
	}));

	// Load filter options
	const platformsRaw = getPlatforms();
	const genresRaw = getGenres();

	// Transform → TagItem[] for TagPicker
	const platforms = Object.entries(platformsRaw)
		.map(([id, val]) => ({
			id,
			label: val.label || id,
			aliases: (val as any).aliases || []
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	const genres = Object.entries(genresRaw)
		.map(([id, val]) => ({
			id,
			label: val.label || id,
			aliases: (val as any).aliases || []
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	const challenges = Object.entries(challengesRaw)
		.map(([id, val]) => ({
			id,
			label: val.label || id,
			aliases: (val as any).aliases || []
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	return {
		games: gamesWithCounts,
		platforms,
		genres,
		challenges
	};
};
