import { getActiveGames } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const rawGames = await getActiveGames(locals.supabase);

	const games = rawGames.map((g) => ({
		game_id: g.game_id,
		game_name: g.game_name,
	}));

	return { games };
};
