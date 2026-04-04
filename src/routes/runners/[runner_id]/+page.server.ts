import {
	getRunner,
	getRunsForRunner,
	getAchievementsForRunner,
	getGamesByIds,
	getTeamsForMember
} from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Phase 1: runner profile + user_id lookup in parallel
	// (both filter on runner_id so neither depends on the other)
	const [runner, profileRow] = await Promise.all([
		getRunner(locals.supabase, params.runner_id),
		locals.supabase
			.from('profiles')
			.select('user_id')
			.eq('runner_id', params.runner_id)
			.maybeSingle()
	]);

	if (!runner) throw error(404, 'Runner not found');
	const userId = profileRow.data?.user_id;

	// Phase 2: runs, achievements, teams, and roles in parallel
	const [runs, achievements, runnerTeams, verifierRoles, moderatorRoles] = await Promise.all([
		getRunsForRunner(locals.supabase, params.runner_id),
		getAchievementsForRunner(locals.supabase, params.runner_id),
		getTeamsForMember(locals.supabase, params.runner_id),
		userId
			? locals.supabase.from('role_game_verifiers').select('game_id').eq('user_id', userId).then(r => r.data || [])
			: Promise.resolve([]),
		userId
			? locals.supabase.from('role_game_moderators').select('game_id').eq('user_id', userId).then(r => r.data || [])
			: Promise.resolve([]),
	]);

	// Phase 3: fetch only the games this runner has runs/achievements in
	const gameIdSet = new Set<string>();
	for (const run of runs) gameIdSet.add(run.game_id);
	for (const ach of achievements) gameIdSet.add(ach.game_id);
	const relevantGames = await getGamesByIds(locals.supabase, [...gameIdSet]);

	// Group runs by game
	const gameMap = new Map<string, { game: typeof relevantGames[0]; runs: typeof runs }>();
	for (const run of runs) {
		if (!gameMap.has(run.game_id)) {
			const game = relevantGames.find((g) => g.game_id === run.game_id);
			if (game) gameMap.set(run.game_id, { game, runs: [] });
		}
		gameMap.get(run.game_id)?.runs.push(run);
	}

	// Compute stats
	const mostPlayedEntry = Array.from(gameMap.entries()).sort(
		(a, b) => b[1].runs.length - a[1].runs.length
	)[0];

	const genreSet = new Set<string>();
	for (const { game } of gameMap.values()) {
		game.genres?.forEach((g) => genreSet.add(g));
	}

	// Build activity timeline (last 20 events)
	type TimelineItem = { date: string; type: 'run' | 'achievement'; gameId: string; detail: string; extra?: string };
	const timeline: TimelineItem[] = [];
	for (const run of runs) {
		timeline.push({
			date: String(run.date_completed),
			type: 'run',
			gameId: run.game_id,
			detail: run.category || run.category_slug,
			extra: run.time_primary
		});
	}
	for (const ach of achievements) {
		timeline.push({
			date: String(ach.date_completed),
			type: 'achievement',
			gameId: ach.game_id,
			detail: ach.achievement_slug
		});
	}
	timeline.sort((a, b) => b.date.localeCompare(a.date));

	return {
		runner,
		runs,
		achievements,
		gameGroups: Array.from(gameMap.values()),
		teams: runnerTeams,
		stats: {
			totalRuns: runs.length,
			totalGames: gameMap.size,
			totalAchievements: achievements.length,
			mostPlayed: mostPlayedEntry
				? { name: mostPlayedEntry[1].game.game_name, id: mostPlayedEntry[1].game.game_id, count: mostPlayedEntry[1].runs.length }
				: null,
			topGenres: Array.from(genreSet).slice(0, 3)
		},
		timeline: timeline.slice(0, 20),
		allGames: relevantGames,
		verifierGames: verifierRoles.map(r => r.game_id),
		moderatorGames: moderatorRoles.map(r => r.game_id),
	};
};
