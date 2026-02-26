// =============================================================================
// Admin Permissions
// =============================================================================
// Defines which admin routes each role can access. Used by:
//   - admin/+layout.svelte  (route gating)
//   - admin/+page.svelte    (nav card filtering)
//   - DebugBar.svelte       (graying out restricted links)
//
// The role hierarchy:
//   super_admin > admin > moderator > verifier > user > non_user
//
// In debug mode, the effective role overrides the real role for UI/nav gating.
// This does NOT affect actual Supabase RLS — the real session is still used
// for data queries. Debug mode is a visual simulation only.
// =============================================================================

import type { DebugRoleId } from '$stores/debug';

/**
 * Which roles can access each admin route.
 * If a route is not listed, it defaults to ['super_admin', 'admin', 'moderator', 'verifier']
 * (i.e., all staff).
 */
const ROUTE_ACCESS: Record<string, DebugRoleId[]> = {
	'/admin':              ['super_admin', 'admin', 'moderator', 'verifier'],
	'/admin/profiles':     ['super_admin', 'admin'],
	'/admin/games':        ['super_admin', 'admin'],
	'/admin/runs':         ['super_admin', 'admin', 'moderator', 'verifier'],
	'/admin/runs-queue':   ['super_admin', 'admin', 'moderator', 'verifier'],
	'/admin/game-updates': ['super_admin', 'admin', 'moderator', 'verifier'],
	'/admin/users':        ['super_admin', 'admin', 'moderator'],
	'/admin/financials':   ['super_admin'],
	'/admin/health':       ['super_admin'],
	'/admin/staff-guides': ['super_admin', 'admin', 'moderator', 'verifier'],
	'/admin/debug':        ['super_admin', 'admin', 'moderator'],
	'/admin/profiles/theme': ['super_admin', 'admin'],
};

/**
 * Check if a role can access a given admin route.
 */
export function canAccessRoute(role: DebugRoleId | null, pathname: string): boolean {
	if (!role) return false;

	// Normalize: strip trailing slash
	const path = pathname.replace(/\/$/, '') || '/admin';

	// Exact match first
	if (ROUTE_ACCESS[path]) {
		return ROUTE_ACCESS[path].includes(role);
	}

	// For nested routes not explicitly listed, check the parent
	const parent = path.split('/').slice(0, 3).join('/');
	if (ROUTE_ACCESS[parent]) {
		return ROUTE_ACCESS[parent].includes(role);
	}

	// Default: all staff roles
	return ['super_admin', 'admin', 'moderator', 'verifier'].includes(role);
}

/**
 * Map a real checkAdminRole() result to a DebugRoleId.
 */
export function realRoleToDebugId(role: {
	admin: boolean;
	superAdmin: boolean;
	moderator: boolean;
	verifier: boolean;
} | null): DebugRoleId {
	if (!role) return 'user';
	if (role.superAdmin) return 'super_admin';
	if (role.admin) return 'admin';
	if (role.moderator) return 'moderator';
	if (role.verifier) return 'verifier';
	return 'user';
}

/**
 * Check if a role has any admin/staff access at all.
 */
export function isStaffRole(role: DebugRoleId | null): boolean {
	if (!role) return false;
	return ['super_admin', 'admin', 'moderator', 'verifier'].includes(role);
}

/** Re-export for convenience */
export { ROUTE_ACCESS };

/**
 * Roles ordered from highest to lowest privilege.
 * A user can only simulate roles strictly below their own.
 */
const ROLE_HIERARCHY: DebugRoleId[] = ['super_admin', 'admin', 'moderator', 'verifier', 'user', 'non_user'];

/**
 * Returns the list of roles a given real role is allowed to simulate.
 * super_admin → [admin, moderator, verifier, user, non_user]
 * admin       → [moderator, verifier, user, non_user]
 * moderator   → [verifier, user, non_user]
 */
export function getDebugableRoles(role: DebugRoleId): DebugRoleId[] {
	const idx = ROLE_HIERARCHY.indexOf(role);
	if (idx === -1) return [];
	return ROLE_HIERARCHY.slice(idx + 1);
}
