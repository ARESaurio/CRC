import { supabase } from '$lib/supabase';
import { PUBLIC_WORKER_URL } from '$env/static/public';

/**
 * Get the current user's access token for API calls.
 */
export async function getAccessToken(): Promise<string | null> {
	const { data } = await supabase.auth.getSession();
	return data.session?.access_token ?? null;
}

/**
 * Check if the current user is an admin by querying profiles.
 * Returns role info including gameIds for per-game moderator access.
 *
 * NOTE: This is a client-side convenience for UI gating only.
 * All privileged actions must be re-verified server-side (Worker or RLS).
 */
export async function checkAdminRole(): Promise<{
	admin: boolean;
	superAdmin: boolean;
	moderator: boolean;
	verifier: boolean;
	runnerId: string | null;
	gameIds: string[];
	moderatorGameIds: string[];
} | null> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return null;

	const userId = session.user.id;

	// Query profiles and role tables in parallel via Supabase client
	const [profileRes, gvRes, gmRes] = await Promise.all([
		supabase
			.from('profiles')
			.select('is_admin, is_super_admin, runner_id, role')
			.eq('user_id', userId)
			.maybeSingle(),
		supabase
			.from('role_game_verifiers')
			.select('game_id')
			.eq('user_id', userId),
		supabase
			.from('role_game_moderators')
			.select('game_id')
			.eq('user_id', userId)
	]);

	const verifierGameIds: string[] = (gvRes.data || []).map((r: any) => r.game_id).filter(Boolean);
	const moderatorGameIds: string[] = (gmRes.data || []).map((r: any) => r.game_id).filter(Boolean);
	const allGameIds = [...new Set([...verifierGameIds, ...moderatorGameIds])];

	// Build role info from profile
	let isAdminFlag = false;
	let isSuperAdmin = false;
	let isModerator = false;
	let runnerId: string | null = null;

	if (profileRes.data) {
		const p = profileRes.data;
		isSuperAdmin = p.is_super_admin === true;
		isAdminFlag = p.is_admin === true || isSuperAdmin;
		isModerator = p.role === 'moderator';
		runnerId = p.runner_id;
	}

	const hasVerifierRole = verifierGameIds.length > 0;
	const hasModeratorRole = moderatorGameIds.length > 0 || isModerator;

	if (isAdminFlag || hasVerifierRole || hasModeratorRole) {
		return {
			admin: isAdminFlag,
			superAdmin: isSuperAdmin,
			moderator: hasModeratorRole,
			verifier: hasVerifierRole,
			runnerId,
			gameIds: allGameIds,
			moderatorGameIds
		};
	}

	return { admin: false, superAdmin: false, moderator: false, verifier: false, runnerId, gameIds: [], moderatorGameIds: [] };
}

/**
 * Fetch pending items from Supabase.
 */
export async function fetchPending(table: string): Promise<any[]> {
	const { data, error } = await supabase
		.from(table)
		.select('*')
		.eq('status', 'pending')
		.order('submitted_at', { ascending: false })
		.limit(100);

	if (error) {
		console.error(`fetchPending(${table}):`, error.message);
		return [];
	}
	return data || [];
}

/**
 * Call a Worker admin endpoint (approve/reject).
 * Worker calls intentionally use raw fetch — they go to a Cloudflare Worker, not Supabase.
 */
export async function adminAction(
	endpoint: string,
	payload: Record<string, any>
): Promise<{ ok: boolean; message: string; data?: any }> {
	const token = await getAccessToken();
	if (!token) return { ok: false, message: 'Not authenticated' };

	try {
		const res = await fetch(`${PUBLIC_WORKER_URL}${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...payload, token })
		});

		const data = await res.json();
		if (res.ok && data.ok) {
			return { ok: true, message: data.message || 'Success', data };
		}
		return { ok: false, message: data.error || 'Action failed' };
	} catch (err: any) {
		return { ok: false, message: err?.message || 'Network error' };
	}
}
