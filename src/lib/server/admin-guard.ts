// =============================================================================
// Server-Side Admin Role Guard
// =============================================================================
// Used by individual admin +page.server.ts files to enforce role-based access.
// The admin layout guard ensures only staff reach /admin at all; these guards
// restrict specific pages to the correct staff tier (admin-only, etc.).
//
// Usage in +page.server.ts:
//   import { guardAdminRoute } from '$lib/server/admin-guard';
//   export const load = guardAdminRoute('/admin/financials');
// =============================================================================

import { redirect } from '@sveltejs/kit';
import { ROUTE_ACCESS } from '$lib/permissions';
import type { ServerLoadEvent } from '@sveltejs/kit';

type StaffRole = 'super_admin' | 'admin' | 'moderator' | 'verifier';

/**
 * Returns a SvelteKit load function that checks the user's staff role
 * against the ROUTE_ACCESS map for the given route.
 *
 * If the role isn't allowed, redirects to /admin with no data leak.
 */
export function guardAdminRoute(route: string) {
	return async ({ parent }: ServerLoadEvent) => {
		const { staffRole } = await parent() as { staffRole: StaffRole };
		const allowed = ROUTE_ACCESS[route] ?? ['super_admin', 'admin', 'moderator', 'verifier'];

		if (!allowed.includes(staffRole)) {
			throw redirect(302, '/admin');
		}

		return { staffRole };
	};
}
