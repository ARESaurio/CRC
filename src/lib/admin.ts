import { supabase } from '$lib/supabase';
import { PUBLIC_WORKER_URL, PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

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
 */
export async function checkAdminRole(): Promise<{
	admin: boolean;
	superAdmin: boolean;
	moderator: boolean;
	verifier: boolean;
	runnerId: string | null;
	gameIds: string[];
} | null> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return null;

	const userId = session.user.id;

	// Query profiles for admin status
	const res = await fetch(
		`${PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=is_admin,is_super_admin,runner_id,role`,
		{
			headers: {
				'apikey': PUBLIC_SUPABASE_ANON_KEY,
				'Authorization': `Bearer ${session.access_token}`
			}
		}
	);

	// Load game assignments from both role tables
	const [gvRes, gmRes] = await Promise.all([
		fetch(
			`${PUBLIC_SUPABASE_URL}/rest/v1/role_game_verifiers?user_id=eq.${userId}&select=game_id`,
			{
				headers: {
					'apikey': PUBLIC_SUPABASE_ANON_KEY,
					'Authorization': `Bearer ${session.access_token}`
				}
			}
		),
		fetch(
			`${PUBLIC_SUPABASE_URL}/rest/v1/role_game_moderators?user_id=eq.${userId}&select=game_id`,
			{
				headers: {
					'apikey': PUBLIC_SUPABASE_ANON_KEY,
					'Authorization': `Bearer ${session.access_token}`
				}
			}
		)
	]);

	const verifierGameIds: string[] = [];
	const moderatorGameIds: string[] = [];
	if (gvRes.ok) {
		const gvData = await gvRes.json();
		for (const row of gvData) if (row.game_id) verifierGameIds.push(row.game_id);
	}
	if (gmRes.ok) {
		const gmData = await gmRes.json();
		for (const row of gmData) if (row.game_id) moderatorGameIds.push(row.game_id);
	}
	const allGameIds = [...new Set([...verifierGameIds, ...moderatorGameIds])];

	// Build role info from profile
	let isAdminFlag = false;
	let isSuperAdmin = false;
	let isModerator = false;
	let runnerId: string | null = null;

	if (res.ok) {
		const data = await res.json();
		if (data.length > 0) {
			const p = data[0];
			isSuperAdmin = p.is_super_admin === true;
			isAdminFlag = p.is_admin === true || isSuperAdmin;
			isModerator = p.role === 'moderator';
			runnerId = p.runner_id;
		}
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
			gameIds: allGameIds
		};
	}

	return { admin: false, superAdmin: false, moderator: false, verifier: false, runnerId, gameIds: [] };
}

/**
 * Fetch pending items from Supabase.
 */
export async function fetchPending(table: string): Promise<any[]> {
	const token = await getAccessToken();
	if (!token) return [];

	const res = await fetch(
		`${PUBLIC_SUPABASE_URL}/rest/v1/${table}?status=eq.pending&order=submitted_at.desc&limit=100`,
		{
			headers: {
				'apikey': PUBLIC_SUPABASE_ANON_KEY,
				'Authorization': `Bearer ${token}`
			}
		}
	);

	if (res.ok) return res.json();
	return [];
}

/**
 * Call a Worker admin endpoint (approve/reject).
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
