// =============================================================================
// Profile Create — Server Load
// =============================================================================
// Checks whether the user already has a profile, has a pending submission,
// or needs to create one. Runs server-side so it works even when browser
// extensions block requests to *.supabase.co.
// =============================================================================

import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ locals }) => {
	// The parent layout guard already redirects unauthenticated users,
	// but belt-and-suspenders:
	if (!locals.session) {
		return { profileState: 'no-session' };
	}

	const userId = locals.session.user.id;

	try {
		// 1. Check profiles — already approved
		const { data: profile } = await locals.supabase
			.from('profiles')
			.select('runner_id, status')
			.eq('user_id', userId)
			.maybeSingle();

		if (profile?.runner_id) {
			return {
				profileState: profile.status === 'pending' ? 'has-pending' : 'has-profile',
				existingRunnerId: profile.runner_id
			};
		}

		// 2. Check pending_profiles — submitted but not yet approved
		const { data: pending } = await locals.supabase
			.from('pending_profiles')
			.select('id, requested_runner_id, has_profile, status')
			.eq('user_id', userId)
			.maybeSingle();

		if (pending?.has_profile && pending.requested_runner_id) {
			return { profileState: 'has-pending' };
		}

		// 3. No profile — show create form
		return {
			profileState: 'create',
			isPreApproved: pending?.status === 'approved'
		};
	} catch {
		// If Supabase query fails, still show the form
		return { profileState: 'create', isPreApproved: false };
	}
};
