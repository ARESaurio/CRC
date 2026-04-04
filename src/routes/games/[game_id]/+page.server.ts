import { getAchievementsForGame, getRunsForGame, getRunnerMapByIds } from '$lib/server/supabase';
import { getDefaultRules, getAllCategories } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { game } = await parent();

	const [achievements, runs] = await Promise.all([
		getAchievementsForGame(locals.supabase, game.game_id),
		getRunsForGame(locals.supabase, game.game_id)
	]);

	// Collect distinct runner IDs from runs, then fetch only those profiles
	const runnerIds = [...new Set(runs.map((r) => r.runner_id))];
	const runnerMap = await getRunnerMapByIds(locals.supabase, runnerIds);

	const categories = getAllCategories(game);

	// Run counts per category slug
	const runCountByCategory: Record<string, number> = {};
	for (const run of runs) {
		const slug = run.category_slug;
		runCountByCategory[slug] = (runCountByCategory[slug] || 0) + 1;
	}

	// Default rules fallback
	const defaults = getDefaultRules() as { general_rules?: string } | null;
	const defaultGeneralRules = defaults?.general_rules || null;

	return {
		achievements,
		runnerMap,
		runCountByCategory,
		totalRunCount: runs.length,
		defaultGeneralRules,
		categories
	};
};
