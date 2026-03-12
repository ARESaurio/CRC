// =============================================================================
// Messages Layout Server Guard
// =============================================================================
// All message pages require authentication. Without this guard, the messages
// pages would render for unauthenticated users (relying only on client-side
// checks and Supabase RLS). This ensures no message markup is sent to
// unauthenticated visitors.
// =============================================================================

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const prerender = false;

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.session) {
		throw redirect(302, `/sign-in?redirect=${encodeURIComponent(url.pathname)}`);
	}

	return {
		session: locals.session
	};
};
