// =============================================================================
// Admin Layout Server Guard
// =============================================================================
// Runs before ANY admin page renders. Two-layer protection:
//   1. Reject unauthenticated users (no session → sign-in redirect)
//   2. Reject non-staff users (no admin/mod/verifier role → home redirect)
//
// This ensures admin markup is never sent to non-staff users.
// Individual admin pages can do additional role checks client-side
// (e.g. super_admin-only pages), and the debug role system layered
// on top is purely visual — it doesn't affect these server checks.
//
// NOTE: We use getUser() here instead of relying on locals.session
// (which comes from getSession()). getSession() only decodes the JWT
// locally — it doesn't verify with Supabase that the token is still
// valid. getUser() makes a server round-trip to confirm the token
// hasn't been revoked. This matters for admin routes where a tampered
// or revoked JWT must not grant access.
// =============================================================================

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const prerender = false;

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.session) {
		throw redirect(302, `/sign-in?redirect=${encodeURIComponent(url.pathname)}`);
	}

	// Server-verify the token (not just decode it)
	const { data: { user }, error: userError } = await locals.supabase.auth.getUser();
	if (userError || !user) {
		throw redirect(302, `/sign-in?redirect=${encodeURIComponent(url.pathname)}`);
	}

	const userId = user.id;

	// Check profiles for admin/super_admin/moderator role
	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('is_admin, is_super_admin, role')
		.eq('user_id', userId)
		.maybeSingle();

	const isAdmin = profile?.is_admin === true || profile?.is_super_admin === true;
	const isModerator = profile?.role === 'moderator';

	// Only check role tables if not already confirmed as admin/moderator
	let isVerifier = false;
	let isGameModerator = false;

	if (!isAdmin && !isModerator) {
		const [{ data: verifierRows }, { data: modRows }] = await Promise.all([
			locals.supabase
				.from('role_game_verifiers')
				.select('id')
				.eq('user_id', userId)
				.limit(1),
			locals.supabase
				.from('role_game_moderators')
				.select('id')
				.eq('user_id', userId)
				.limit(1)
		]);
		isVerifier = (verifierRows?.length ?? 0) > 0;
		isGameModerator = (modRows?.length ?? 0) > 0;
	}

	const hasStaffAccess = isAdmin || isModerator || isVerifier || isGameModerator;

	if (!hasStaffAccess) {
		throw redirect(302, '/');
	}

	// Resolve effective role for child page guards
	const staffRole = profile?.is_super_admin ? 'super_admin'
		: (profile?.is_admin ? 'admin'
		: (isModerator ? 'moderator'
		: 'verifier'));

	return {
		session: locals.session,
		staffRole
	};
};
