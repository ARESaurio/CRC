import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const gameId = params.game_id;
	const userId = locals.session?.user?.id ?? null;

	// Use game from layout instead of re-querying for status
	const { game } = await parent();
	const isCommunityReview = game?.status === 'Community Review';

	// ── Phase 1: parallel — all primary data ─────────────────────────────
	const [membersRes, suggestionsRes, discussionRes, gameBoardRes] = await Promise.all([
		locals.supabase
			.from('rules_committee_members')
			.select('id, game_id, user_id, role, joined_at')
			.eq('game_id', gameId)
			.order('joined_at'),
		locals.supabase
			.from('game_suggestions')
			.select('*')
			.eq('game_id', gameId)
			.order('created_at', { ascending: false })
			.limit(50),
		locals.supabase
			.from('forum_threads')
			.select('*')
			.eq('game_id', gameId)
			.order('is_pinned', { ascending: false })
			.order('last_post_at', { ascending: false })
			.limit(20),
		locals.supabase
			.from('forum_boards')
			.select('id, slug')
			.eq('game_id', gameId)
			.maybeSingle()
	]);

	const members = membersRes.data || [];
	const suggestions = suggestionsRes.data || [];
	const discussionThreads = discussionRes.data || [];
	let gameBoard = gameBoardRes.data;

	// ── Phase 2: collect all user IDs, then batch-fetch profiles ─────────
	const allUserIds = new Set<string>();
	for (const m of members) allUserIds.add(m.user_id);
	for (const s of suggestions) if (s.user_id) allUserIds.add(s.user_id);
	for (const t of discussionThreads) {
		if (t.author_id) allUserIds.add(t.author_id);
		if (t.last_post_by) allUserIds.add(t.last_post_by);
	}

	// Single batch profile lookup for ALL user IDs across members, suggestions, and threads
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

	// ── Phase 3: suggestion votes + comments (parallel) ──────────────────
	const sugIds = suggestions.map((s: any) => s.id);
	let sugVoteCounts: Record<string, { agree: number; disagree: number }> = {};
	let sugCommentCounts: Record<string, number> = {};

	if (sugIds.length > 0) {
		const [votesRes, commentsRes] = await Promise.all([
			locals.supabase
				.from('game_suggestion_votes')
				.select('suggestion_id, vote')
				.in('suggestion_id', sugIds),
			locals.supabase
				.from('game_suggestion_comments')
				.select('suggestion_id')
				.in('suggestion_id', sugIds)
		]);

		for (const v of votesRes.data || []) {
			if (!sugVoteCounts[v.suggestion_id]) sugVoteCounts[v.suggestion_id] = { agree: 0, disagree: 0 };
			if (v.vote === 'agree') sugVoteCounts[v.suggestion_id].agree++;
			else sugVoteCounts[v.suggestion_id].disagree++;
		}
		for (const c of commentsRes.data || []) {
			sugCommentCounts[c.suggestion_id] = (sugCommentCounts[c.suggestion_id] || 0) + 1;
		}
	}

	// ── Enrich all data using the single profile map ─────────────────────
	const enrichedMembers = members.map((m: any) => ({
		...m,
		...(profileMap[m.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	const enrichedSuggestions = suggestions.map((s: any) => ({
		...s,
		...(profileMap[s.user_id] || { display_name: 'Unknown', runner_id: null }),
		vote_counts: sugVoteCounts[s.id] || { agree: 0, disagree: 0 },
		comment_count: sugCommentCounts[s.id] || 0
	}));

	const enrichedThreads = discussionThreads.map((t: any) => ({
		...t,
		author_name: profileMap[t.author_id]?.display_name || 'Unknown',
		author_avatar: profileMap[t.author_id]?.avatar_url || null,
		last_post_by_name: t.last_post_by ? (profileMap[t.last_post_by]?.display_name || 'Unknown') : null,
		last_post_by_avatar: t.last_post_by ? (profileMap[t.last_post_by]?.avatar_url || null) : null,
	}));

	// Auto-create discussion board if needed
	if (!gameBoard) {
		const boardSlug = `game-${gameId}`;
		const gameName = gameId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
		const { data: newBoard } = await locals.supabase
			.from('forum_boards')
			.insert({
				slug: boardSlug,
				name: `${gameName} Discussion`,
				description: `Community discussion threads`,
				sort_order: 0,
				game_id: gameId,
			})
			.select('id, slug')
			.single();
		gameBoard = newBoard;
	}

	return {
		members: enrichedMembers,
		suggestions: enrichedSuggestions,
		userId,
		isCommunityReview,
		discussionThreads: enrichedThreads,
		gameBoardId: gameBoard?.id || null,
	};
};
