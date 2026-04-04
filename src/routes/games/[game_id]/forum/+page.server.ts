import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const gameId = params.game_id;
	const userId = locals.session?.user?.id ?? null;
	const { game } = await parent();
	const isCommunityReview = game?.status === 'Community Review';

	// ── Phase 1: all primary data in parallel ────────────────────────────
	const [membersRes, sugCountRes, sugLatestRes, threadCountRes, threadLatestRes] = await Promise.all([
		locals.supabase
			.from('rules_committee_members')
			.select('id, game_id, user_id, role, joined_at')
			.eq('game_id', gameId)
			.order('joined_at'),
		locals.supabase
			.from('game_suggestions')
			.select('id', { count: 'exact', head: true })
			.eq('game_id', gameId),
		locals.supabase
			.from('game_suggestions')
			.select('id, title, user_id, updated_at, created_at')
			.eq('game_id', gameId)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle(),
		locals.supabase
			.from('forum_threads')
			.select('id', { count: 'exact', head: true })
			.eq('game_id', gameId),
		locals.supabase
			.from('forum_threads')
			.select('id, title, author_id, last_post_at, last_post_by, reply_count, created_at')
			.eq('game_id', gameId)
			.order('last_post_at', { ascending: false })
			.limit(1)
			.maybeSingle(),
	]);

	const members = membersRes.data || [];
	const sugCount = sugCountRes.count || 0;
	const sugLatest = sugLatestRes.data;
	const threadCount = threadCountRes.count || 0;
	const threadLatest = threadLatestRes.data;

	// ── Phase 2: recent activity (combined suggestions + threads) ────────
	const [recentSugRes, recentThreadRes] = await Promise.all([
		locals.supabase
			.from('game_suggestions')
			.select('id, title, user_id, updated_at, created_at')
			.eq('game_id', gameId)
			.order('created_at', { ascending: false })
			.limit(10),
		locals.supabase
			.from('forum_threads')
			.select('id, title, author_id, last_post_at, last_post_by, reply_count, view_count, is_pinned, is_locked, created_at')
			.eq('game_id', gameId)
			.order('last_post_at', { ascending: false })
			.limit(10)
	]);

	// ── Phase 3: batch profile lookup ────────────────────────────────────
	const allUserIds = new Set<string>();
	for (const m of members) allUserIds.add(m.user_id);
	if (sugLatest?.user_id) allUserIds.add(sugLatest.user_id);
	if (threadLatest?.last_post_by) allUserIds.add(threadLatest.last_post_by);
	if (threadLatest?.author_id) allUserIds.add(threadLatest.author_id);
	for (const s of recentSugRes.data || []) if (s.user_id) allUserIds.add(s.user_id);
	for (const t of recentThreadRes.data || []) {
		if (t.author_id) allUserIds.add(t.author_id);
		if (t.last_post_by) allUserIds.add(t.last_post_by);
	}

	let profileMap: Record<string, { display_name: string; runner_id: string | null; avatar_url: string | null }> = {};
	if (allUserIds.size > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id, avatar_url')
			.in('user_id', [...allUserIds]);
		for (const p of profiles || []) {
			profileMap[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id, avatar_url: p.avatar_url };
		}
	}

	// ── Enrich members ──────────────────────────────────────────────────
	const enrichedMembers = members.map((m: any) => ({
		...m,
		...(profileMap[m.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	// Discussion reply total for board table
	const threadReplyTotal = (recentThreadRes.data || []).reduce((sum: number, t: any) => sum + (t.reply_count || 0), 0);

	// Build combined recent activity feed
	const recentActivity: any[] = [];
	for (const s of recentSugRes.data || []) {
		recentActivity.push({
			type: 'suggestion',
			id: s.id,
			title: s.title,
			href: `/games/${gameId}/forum/suggestions/${s.id}`,
			author_name: profileMap[s.user_id]?.display_name || 'Unknown',
			author_avatar: profileMap[s.user_id]?.avatar_url || null,
			date: s.updated_at || s.created_at,
			created_at: s.created_at,
		});
	}
	for (const t of recentThreadRes.data || []) {
		recentActivity.push({
			type: 'discussion',
			id: t.id,
			title: t.title,
			href: `/games/${gameId}/forum/thread/${t.id}`,
			author_name: profileMap[t.author_id]?.display_name || 'Unknown',
			author_avatar: profileMap[t.author_id]?.avatar_url || null,
			last_post_by_name: t.last_post_by ? (profileMap[t.last_post_by]?.display_name || null) : null,
			last_post_by_avatar: t.last_post_by ? (profileMap[t.last_post_by]?.avatar_url || null) : null,
			date: t.last_post_at || t.created_at,
			created_at: t.created_at,
			reply_count: t.reply_count || 0,
			view_count: t.view_count || 0,
			is_pinned: t.is_pinned,
			is_locked: t.is_locked,
		});
	}
	recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return {
		members: enrichedMembers,
		userId,
		isCommunityReview,
		boardStats: {
			suggestions: {
				count: sugCount,
				latest: sugLatest ? {
					title: sugLatest.title,
					authorName: profileMap[sugLatest.user_id]?.display_name || 'Unknown',
					date: sugLatest.updated_at || sugLatest.created_at,
				} : null,
			},
			discussion: {
				count: threadCount,
				replyCount: threadReplyTotal,
				latest: threadLatest ? {
					title: threadLatest.title,
					authorName: threadLatest.last_post_by
						? (profileMap[threadLatest.last_post_by]?.display_name || 'Unknown')
						: (profileMap[threadLatest.author_id]?.display_name || 'Unknown'),
					authorAvatar: threadLatest.last_post_by
						? (profileMap[threadLatest.last_post_by]?.avatar_url || null)
						: (profileMap[threadLatest.author_id]?.avatar_url || null),
					date: threadLatest.last_post_at || threadLatest.created_at,
				} : null,
			},
		},
		recentActivity: recentActivity.slice(0, 15),
	};
};
