// =============================================================================
// Staff Guides Server Load
// =============================================================================
// Loads staff guide content server-side. The admin layout guard ensures
// only staff reach this page; the role check below enforces ROUTE_ACCESS.
// =============================================================================

import { redirect } from '@sveltejs/kit';
import { getStaffGuides } from '$lib/server/data';
import { ROUTE_ACCESS } from '$lib/permissions';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ parent }) => {
	const { staffRole } = await parent();
	const allowed = ROUTE_ACCESS['/admin/staff-guides'] ?? ['super_admin', 'admin', 'moderator', 'verifier'];
	if (!allowed.includes(staffRole)) {
		throw redirect(302, '/admin');
	}

	const guides = getStaffGuides();
	return { guides };
};
