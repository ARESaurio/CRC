import { getGame, getRunsForGame, getGames } from '$lib/server/supabase';
import { getAllCategories, getChallenges } from '$lib/server/data';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const game = await getGame(locals.supabase, params.game_id);

	if (!game) {
		throw error(404, 'Game not found');
	}

	const [runs, allGames] = await Promise.all([
		getRunsForGame(locals.supabase, params.game_id),
		getGames(locals.supabase)
	]);

	const categories = getAllCategories(game);
	const globalChallenges = getChallenges();

	// Find modded versions of this game
	const moddedVersions = allGames.filter(
		(g) => g.base_game === game.game_id && g.is_modded
	);

	// Find base game if this is modded
	const baseGame = game.is_modded && game.base_game
		? allGames.find((g) => g.game_id === game.base_game) ?? null
		: null;

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

	// Fetch rules changelog (most recent 20 entries)
	const { data: changelogData } = await locals.supabase
		.from('rules_changelog')
		.select('id, game_id, rules_version, changed_by, change_summary, sections_changed, created_at')
		.eq('game_id', params.game_id)
		.order('created_at', { ascending: false })
		.limit(20);
	const rulesChangelog = changelogData || [];

	// Fetch rule suggestions (non-rejected ones for public display)
	const { data: suggestionsData } = await locals.supabase
		.from('rule_suggestions')
		.select('id, game_id, user_id, suggestion, status, admin_response, created_at')
		.eq('game_id', params.game_id)
		.neq('status', 'rejected')
		.order('created_at', { ascending: false })
		.limit(50);
	const ruleSuggestions = suggestionsData || [];

	return {
		game,
		runs,
		categories,
		globalChallenges,
		moddedVersions,
		baseGame,
		defaultRules,
		rulesChangelog,
		ruleSuggestions
	};
};
