import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session) {
		throw redirect(302, '/sign-in?redirect=/admin/games');
	}

	// Verify admin access
	const { data: { user }, error: userError } = await locals.supabase.auth.getUser();
	if (userError || !user) throw redirect(302, '/sign-in');

	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('is_admin, is_super_admin')
		.eq('user_id', user.id)
		.maybeSingle();

	if (!profile?.is_admin && !profile?.is_super_admin) {
		throw redirect(302, '/admin/games');
	}

	// Load the pending game
	const { data: game, error } = await locals.supabase
		.from('pending_games')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();

	if (error || !game) {
		throw redirect(302, '/admin/games');
	}

	return { game, session: locals.session };
};
