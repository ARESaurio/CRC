import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { game } = await parent();

	const { data, error } = await locals.supabase
		.from('game_history')
		.select('action, created_at, target, note, actor_name')
		.eq('game_id', game.game_id)
		.order('created_at', { ascending: false })
		.limit(200);

	const history = (error || !data) ? [] : data.map((row: any) => ({
		action: row.action,
		date: row.created_at,
		target: row.target || undefined,
		note: row.note || undefined,
		by: row.actor_name ? { discord: row.actor_name } : undefined,
	}));

	return { history };
};
