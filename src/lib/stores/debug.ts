import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * All valid role identifiers used in debug mode and permissions checks.
 */
export type DebugRoleId = 'non_user' | 'user' | 'verifier' | 'moderator' | 'admin' | 'super_admin';

/**
 * Debug game — when a mod/verifier simulation has a specific game selected.
 */
export interface DebugGameInfo {
	game_id: string;
	game_name: string;
}

/**
 * Debug role store — drives the site-wide debug mode.
 * When set, the Header and other components override their display
 * to show the site as that role would see it.
 *
 * Values: null | 'non_user' | 'user' | 'verifier' | 'moderator' | 'admin' | 'super_admin'
 */
export const debugRole = writable<DebugRoleId | null>(
	browser ? (sessionStorage.getItem('crc_debug_role') as DebugRoleId | null) : null
);

/**
 * Debug game store — when simulating a mod/verifier, optionally lock to a specific game.
 * Admin pages (runs queue, game-editor) read this to pre-filter their views.
 */
export const debugGame = writable<DebugGameInfo | null>(
	browser ? (() => {
		try {
			const raw = sessionStorage.getItem('crc_debug_game');
			return raw ? JSON.parse(raw) as DebugGameInfo : null;
		} catch { return null; }
	})() : null
);

// Keep sessionStorage in sync
if (browser) {
	debugRole.subscribe((value) => {
		if (value) {
			sessionStorage.setItem('crc_debug_role', value);
		} else {
			sessionStorage.removeItem('crc_debug_role');
			// Clear game when exiting debug mode entirely
			debugGame.set(null);
		}
	});

	debugGame.subscribe((value) => {
		if (value) {
			sessionStorage.setItem('crc_debug_game', JSON.stringify(value));
		} else {
			sessionStorage.removeItem('crc_debug_game');
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
