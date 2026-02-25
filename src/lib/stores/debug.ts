import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * All valid role identifiers used in debug mode and permissions checks.
 */
export type DebugRoleId = 'non_user' | 'user' | 'verifier' | 'moderator' | 'admin' | 'super_admin';

/**
 * Debug role store — drives the site-wide debug mode.
 * When set, the Header and other components override their display
 * to show the site as that role would see it.
 *
 * Values: null | 'non_user' | 'user' | 'verifier' | 'moderator' | 'admin' | 'super_admin'
 */
export const debugRole = writable<DebugRoleId | null>(
	browser ? sessionStorage.getItem('crc_debug_role') : null
);

// Keep sessionStorage in sync
if (browser) {
	debugRole.subscribe((value) => {
		if (value) {
			sessionStorage.setItem('crc_debug_role', value);
		} else {
			sessionStorage.removeItem('crc_debug_role');
		}
	});
}

/** Whether debug mode is active at all */
export const isDebugActive = derived(debugRole, (r) => r !== null);

/** Whether the debug role should hide authenticated UI (non_user) */
export const debugHidesAuth = derived(debugRole, (r) => r === 'non_user');

/** Whether the debug role should hide admin/staff UI */
export const debugHidesAdmin = derived(debugRole, (r) =>
	r === 'non_user' || r === 'user'
);

/** Whether the debug role should hide verifier-level UI */
export const debugHidesVerifier = derived(debugRole, (r) =>
	r === 'non_user' || r === 'user'
);

/**
 * The user's actual role (set by admin pages after checkAdminRole()).
 * Used by DebugBar to restrict which roles can be simulated.
 * A user can only debug-as roles strictly below their own.
 */
export const realRole = writable<DebugRoleId | null>(null);
