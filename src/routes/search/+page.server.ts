import { getActiveGames, getRunners, getRuns } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [rawGames, rawRunners, rawRuns] = await Promise.all([
		getActiveGames(locals.supabase),
		getRunners(locals.supabase),
		getRuns(locals.supabase)
	]);

	const games = rawGames.map((g) => ({
		type: 'game' as const,
		id: g.game_id,
		name: g.game_name,
		aliases: g.game_name_aliases || [],
		genres: g.genres || [],
		url: `/games/${g.game_id}`
	}));

	const runners = rawRunners
		.filter((r) => r.status !== 'test' && !r.hidden)
		.map((r) => ({
			type: 'runner' as const,
			id: r.runner_id,
			name: r.display_name || r.name || r.runner_id,
			url: `/runners/${r.runner_id}`
		}));

	// Build a quick game name lookup for run results
	const gameNames = Object.fromEntries(rawGames.map(g => [g.game_id, g.game_name]));

	const runs = rawRuns.map((r) => ({
		type: 'run' as const,
		id: r.id || r.submission_id || '',
		name: r.runner_id,
		gameId: r.game_id,
		gameName: gameNames[r.game_id] || r.game_id,
		category: r.category || '',
		categoryTier: r.category_tier || '',
		videoUrl: r.video_url || '',
		url: `/games/${r.game_id}/runs`
	}));

	return { games, runners, runs };
};
