import { getActiveGames } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const games = (await getActiveGames(locals.supabase)).map((g) => ({
		id: g.game_id,
		name: g.game_name
	}));

	return { games };
};
