import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { game } = await parent();

	// Find first available category and redirect to it
	if (game.full_runs?.length) {
		throw redirect(302, `/games/${params.game_id}/runs/full-runs/${game.full_runs[0].slug}`);
	}

	if (game.mini_challenges?.length) {
		for (const group of game.mini_challenges) {
			if (group.children?.length) {
				throw redirect(302, `/games/${params.game_id}/runs/mini-challenges/${group.children[0].slug}`);
			}
			// Group itself is a category if no children
			throw redirect(302, `/games/${params.game_id}/runs/mini-challenges/${group.slug}`);
		}
	}

	if (game.player_made?.length) {
		throw redirect(302, `/games/${params.game_id}/runs/player-made/${game.player_made[0].slug}`);
	}

	// No categories — fall through to the page component
	return {};
};
