import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ROUTE_ACCESS } from '$lib/permissions';
import type { DebugRoleId } from '$lib/stores/debug';

export const prerender = false;

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	// Role check — layout guard already verified auth, just check role
	const { staffRole } = await parent();
	const allowed = ROUTE_ACCESS['/admin/games'] ?? ['super_admin', 'admin'];
	if (!allowed.includes(staffRole as DebugRoleId)) {
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
