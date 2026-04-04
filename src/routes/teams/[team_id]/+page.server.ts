import { getTeam, getGamesByIds, getRunnerMapByIds } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const team = await getTeam(locals.supabase, params.team_id);
	if (!team) throw error(404, 'Team not found');

	const memberIds = (team.members || []).map((m: any) => m.runner_id);

	// Fetch only the games and runners we need, in parallel
	const [games, runnerMap] = await Promise.all([
		getGamesByIds(locals.supabase, team.games || []),
		getRunnerMapByIds(locals.supabase, memberIds)
	]);

	// Resolve game names from fetched games
	const resolvedGames = games.map((g) => ({
		game_id: g.game_id,
		game_name: g.game_name
	}));

	// Resolve member runner profiles from the batch lookup
	const members = (team.members || []).map((m: any) => {
		const profile = runnerMap[m.runner_id];
		return {
			runner_id: m.runner_id,
			name: m.name || profile?.runner_name || m.runner_id,
			role: m.role,
			avatar: profile?.avatar || null,
			hasProfile: !!profile
		};
	});

	return {
		team,
		games: resolvedGames,
		members,
		achievements: team.achievements || []
	};
};
