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

	return {
		game,
		runs,
		categories,
		globalChallenges,
		moddedVersions,
		baseGame
	};
};
