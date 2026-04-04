import { getGame, getModdedVersionsOf, getChallengesConfig } from '$lib/server/supabase';
import { getAllCategories } from '$lib/server/data';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const game = await getGame(locals.supabase, params.game_id);

	if (!game) {
		throw error(404, 'Game not found');
	}

	// Parallel: targeted queries instead of loading ALL games + ALL runs
	const [moddedVersions, globalChallenges, baseGameResult] = await Promise.all([
		getModdedVersionsOf(locals.supabase, params.game_id),
		getChallengesConfig(locals.supabase),
		// Fetch base game only if this is a modded version
		(game.is_modded && game.base_game)
			? getGame(locals.supabase, game.base_game)
			: Promise.resolve(null)
	]);

	const categories = getAllCategories(game);

	// ── Rules system data ────────────────────────────────────────────────
	// Fetch default rules template for Community Review games
	let defaultRules: string | null = null;
	if (game.status === 'Community Review') {
		const { data: setting } = await locals.supabase
			.from('site_settings')
			.select('value')
			.eq('key', 'default_rules_template')
			.maybeSingle();
		defaultRules = setting?.value || null;
	}

	// Fetch rules changelog + suggestions in parallel
	const [changelogRes, suggestionsRes] = await Promise.all([
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

	return {
		game,
		categories,
		globalChallenges,
		moddedVersions,
		baseGame: baseGameResult,
		defaultRules,
		rulesChangelog: changelogRes.data || [],
		ruleSuggestions: suggestionsRes.data || []
	};
};
