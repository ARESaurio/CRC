import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { game } = await parent();

	// Find first available category and redirect to it
	if (game.full_runs?.length) {
		throw redirect(302, `/games/${params.game_id}/runs/full-runs/${game.full_runs[0].slug}`);
	}

	if (game.mini_challenges?.length) {
		throw redirect(302, `/games/${params.game_id}/runs/mini-challenges/${game.mini_challenges[0].slug}`);
	}

	if (game.player_made?.length) {
		throw redirect(302, `/games/${params.game_id}/runs/player-made/${game.player_made[0].slug}`);
	}

	// No categories — fall through to the page component
	return {};
};
