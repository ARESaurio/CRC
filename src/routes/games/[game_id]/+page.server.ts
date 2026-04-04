import { getAchievementsForGame, getRunsForGame, getRunnerMapByIds } from '$lib/server/supabase';
import { getDefaultRules, getAllCategories } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { game } = await parent();

	// Phase 1: parallel — achievements, runs, and rules data
	const [achievements, runs, changelogRes, suggestionsRes] = await Promise.all([
		getAchievementsForGame(locals.supabase, game.game_id),
		getRunsForGame(locals.supabase, game.game_id),
		locals.supabase
			.from('rules_changelog')
			.select('id, game_id, rules_version, changed_by, change_summary, sections_changed, created_at')
			.eq('game_id', params.game_id)
			.order('created_at', { ascending: false })
			.limit(20),
		locals.supabase
			.from('rule_suggestions')
			.select('id, game_id, user_id, suggestion, status, admin_response, created_at')
			.eq('game_id', params.game_id)
			.neq('status', 'rejected')
			.order('created_at', { ascending: false })
			.limit(50)
	]);

	// Phase 2: targeted runner lookup (depends on runs result)
	const runnerIds = [...new Set(runs.map((r) => r.runner_id))];
	const runnerMap = await getRunnerMapByIds(locals.supabase, runnerIds);

	const categories = getAllCategories(game);

	// Run counts per category slug
	const runCountByCategory: Record<string, number> = {};
	for (const run of runs) {
		const slug = run.category_slug;
		runCountByCategory[slug] = (runCountByCategory[slug] || 0) + 1;
	}

	// Default rules (moved from layout — only this page uses it)
	let defaultRules: string | null = null;
	if (game.status === 'Community Review') {
		const { data: setting } = await locals.supabase
			.from('site_settings')
			.select('value')
			.eq('key', 'default_rules_template')
			.maybeSingle();
		defaultRules = setting?.value || null;
	}

	const defaults = getDefaultRules() as { general_rules?: string } | null;
	const defaultGeneralRules = defaults?.general_rules || null;

	return {
		achievements,
		runnerMap,
		runCountByCategory,
		totalRunCount: runs.length,
		defaultGeneralRules,
		categories,
		// Rules data (moved from layout — only overview page uses these)
		defaultRules,
		rulesChangelog: changelogRes.data || [],
		ruleSuggestions: suggestionsRes.data || []
	};
};
