import { getGame, getModdedVersionsOf, getChallengesConfig } from '$lib/server/supabase';
import { getAllCategories } from '$lib/server/data';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const game = await getGame(locals.supabase, params.game_id);

	if (!game) {
		throw error(404, 'Game not found');
	}

	// Parallel: targeted queries instead of loading ALL games
	const [moddedVersions, globalChallenges, baseGameResult] = await Promise.all([
		getModdedVersionsOf(locals.supabase, params.game_id),
		getChallengesConfig(locals.supabase),
		(game.is_modded && game.base_game)
			? getGame(locals.supabase, game.base_game)
			: Promise.resolve(null)
	]);

	const categories = getAllCategories(game);

	// NOTE: rules_changelog, rule_suggestions, and defaultRules are only used
	// by the overview page (+page.server.ts). They're fetched there instead
	// of here, so sub-pages like /runs, /history, /forum don't pay for them.

	return {
		game,
		categories,
		globalChallenges,
		moddedVersions,
		baseGame: baseGameResult,
	};
};
