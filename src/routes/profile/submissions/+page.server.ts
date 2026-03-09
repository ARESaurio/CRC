import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.session?.user?.id;
	if (!userId) return { pendingRuns: [], pendingGames: [], pendingUpdates: [], rejectedRuns: [], rejectedGames: [], rejectedUpdates: [], approvedRuns: [], approvedGames: [], approvedUpdates: [], gameNames: {} };

	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

	// Run all queries in parallel
	const [
		pendingRunsRes,
		pendingGamesRes,
		pendingUpdatesRes,
		rejectedRunsRes,
		rejectedGamesRes,
		rejectedUpdatesRes,
		approvedRunsRes,
		approvedGamesRes,
		approvedUpdatesRes,
	] = await Promise.all([
		// ── Pending ──
		locals.supabase
			.from('pending_runs')
			.select('public_id, game_id, category, category_tier, video_url, submitted_at, updated_at, claimed_by, claimed_at, status')
			.eq('submitted_by', userId)
			.eq('status', 'pending')
			.order('submitted_at', { ascending: false }),

		locals.supabase
			.from('pending_games')
			.select('id, game_name, submitted_at, updated_at, claimed_by, claimed_at, status')
			.eq('submitted_by', userId)
			.eq('status', 'pending')
			.order('submitted_at', { ascending: false }),

		locals.supabase
			.from('game_update_requests')
			.select('id, game_id, game_name, section, update_type, details, created_at, updated_at, claimed_by, claimed_at, status')
			.eq('user_id', userId)
			.eq('status', 'pending')
			.order('created_at', { ascending: false }),

		// ── Rejected (last 30 days) ──
		locals.supabase
			.from('pending_runs')
			.select('public_id, game_id, category, video_url, submitted_at, reviewer_notes, rejection_reason, reviewed_at, status')
			.eq('submitted_by', userId)
			.eq('status', 'rejected')
			.gte('reviewed_at', thirtyDaysAgo)
			.order('reviewed_at', { ascending: false }),

		locals.supabase
			.from('pending_games')
			.select('id, game_name, submitted_at, reviewer_notes, rejection_reason, reviewed_at, status')
			.eq('submitted_by', userId)
			.eq('status', 'rejected')
			.gte('reviewed_at', thirtyDaysAgo)
			.order('reviewed_at', { ascending: false }),

		locals.supabase
			.from('game_update_requests')
			.select('id, game_id, game_name, section, update_type, details, created_at, updated_at, status')
			.eq('user_id', userId)
			.eq('status', 'rejected')
			.gte('updated_at', thirtyDaysAgo)
			.order('updated_at', { ascending: false }),

		// ── Approved / History (last 30 days) ──
		locals.supabase
			.from('pending_runs')
			.select('public_id, game_id, category, video_url, submitted_at, reviewed_at, status')
			.eq('submitted_by', userId)
			.eq('status', 'approved')
			.gte('reviewed_at', thirtyDaysAgo)
			.order('reviewed_at', { ascending: false }),

		locals.supabase
			.from('pending_games')
			.select('id, game_name, submitted_at, reviewed_at, status')
			.eq('submitted_by', userId)
			.eq('status', 'approved')
			.gte('reviewed_at', thirtyDaysAgo)
			.order('reviewed_at', { ascending: false }),

		locals.supabase
			.from('game_update_requests')
			.select('id, game_id, game_name, section, update_type, created_at, updated_at, status')
			.eq('user_id', userId)
			.eq('status', 'approved')
			.gte('updated_at', thirtyDaysAgo)
			.order('updated_at', { ascending: false }),
	]);

	// ── Resolve game_id → game_name for pending_runs ──
	const allRuns = [
		...(pendingRunsRes.data || []),
		...(rejectedRunsRes.data || []),
		...(approvedRunsRes.data || []),
	];
	const uniqueGameIds = [...new Set(allRuns.map(r => r.game_id).filter(Boolean))];
	let gameNames: Record<string, string> = {};

	if (uniqueGameIds.length > 0) {
		const { data: games } = await locals.supabase
			.from('games')
			.select('game_id, game_name')
			.in('game_id', uniqueGameIds);
		if (games) {
			for (const g of games) {
				gameNames[g.game_id] = g.game_name;
			}
		}
	}

	return {
		pendingRuns: pendingRunsRes.data || [],
		pendingGames: pendingGamesRes.data || [],
		pendingUpdates: pendingUpdatesRes.data || [],
		rejectedRuns: rejectedRunsRes.data || [],
		rejectedGames: rejectedGamesRes.data || [],
		rejectedUpdates: rejectedUpdatesRes.data || [],
		approvedRuns: approvedRunsRes.data || [],
		approvedGames: approvedGamesRes.data || [],
		approvedUpdates: approvedUpdatesRes.data || [],
		gameNames,
	};
};
