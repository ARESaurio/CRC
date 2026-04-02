import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const gameId = params.game_id;
	const userId = locals.session?.user?.id ?? null;

	// ── Committee members ────────────────────────────────────────────────
	const { data: members } = await locals.supabase
		.from('rules_committee_members')
		.select('id, game_id, user_id, role, joined_at')
		.eq('game_id', gameId)
		.order('joined_at');

	const memberUserIds = (members || []).map((m: any) => m.user_id);
	let memberProfiles: Record<string, { display_name: string; runner_id: string; avatar_url: string }> = {};

	if (memberUserIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id, avatar_url')
			.in('user_id', memberUserIds);
		for (const p of profiles || []) {
			memberProfiles[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id, avatar_url: p.avatar_url };
		}
	}

	const enrichedMembers = (members || []).map((m: any) => ({
		...m,
		...(memberProfiles[m.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	// ── Suggestions ──────────────────────────────────────────────────────
	const { data: suggestions } = await locals.supabase
		.from('game_suggestions')
		.select('*')
		.eq('game_id', gameId)
		.order('created_at', { ascending: false })
		.limit(50);

	// Enrich suggestion authors
	const sugUserIds = [...new Set((suggestions || []).map((s: any) => s.user_id))];
	let sugProfiles: Record<string, { display_name: string; runner_id: string }> = {};
	if (sugUserIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id')
			.in('user_id', sugUserIds);
		for (const p of profiles || []) {
			sugProfiles[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id };
		}
	}

	// Load vote + comment counts for suggestions
	const sugIds = (suggestions || []).map((s: any) => s.id);
	let sugVoteCounts: Record<string, { agree: number; disagree: number }> = {};
	let sugCommentCounts: Record<string, number> = {};

	if (sugIds.length > 0) {
		const { data: sugVotes } = await locals.supabase
			.from('game_suggestion_votes')
			.select('suggestion_id, vote')
			.in('suggestion_id', sugIds);
		for (const v of sugVotes || []) {
			if (!sugVoteCounts[v.suggestion_id]) sugVoteCounts[v.suggestion_id] = { agree: 0, disagree: 0 };
			if (v.vote === 'agree') sugVoteCounts[v.suggestion_id].agree++;
			else sugVoteCounts[v.suggestion_id].disagree++;
		}

		const { data: sugComments } = await locals.supabase
			.from('game_suggestion_comments')
			.select('suggestion_id')
			.in('suggestion_id', sugIds);
		for (const c of sugComments || []) {
			sugCommentCounts[c.suggestion_id] = (sugCommentCounts[c.suggestion_id] || 0) + 1;
		}
	}

	const enrichedSuggestions = (suggestions || []).map((s: any) => ({
		...s,
		...(sugProfiles[s.user_id] || { display_name: 'Unknown', runner_id: null }),
		vote_counts: sugVoteCounts[s.id] || { agree: 0, disagree: 0 },
		comment_count: sugCommentCounts[s.id] || 0
	}));

	// ── Game status (lightweight check for thread display) ──────────────
	const { data: gameStatus } = await locals.supabase
		.from('games')
		.select('status')
		.eq('game_id', gameId)
		.maybeSingle();

	const isCommunityReview = gameStatus?.status === 'Community Review';

	// ── Discussion threads for this game ─────────────────────────────
	const { data: discussionThreads } = await locals.supabase
		.from('forum_threads')
		.select('*')
		.eq('game_id', gameId)
		.order('is_pinned', { ascending: false })
		.order('last_post_at', { ascending: false })
		.limit(20);

	// Enrich thread authors
	const threadUserIds = new Set<string>();
	for (const t of discussionThreads || []) {
		if (t.author_id) threadUserIds.add(t.author_id);
		if (t.last_post_by) threadUserIds.add(t.last_post_by);
	}
	let threadProfileMap: Record<string, { display_name: string; avatar_url: string | null; runner_id: string | null }> = {};
	if (threadUserIds.size > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url, runner_id')
			.in('user_id', [...threadUserIds]);
		for (const p of profiles || []) {
			threadProfileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url, runner_id: p.runner_id };
		}
	}

	const enrichedThreads = (discussionThreads || []).map((t: any) => ({
		...t,
		author_name: threadProfileMap[t.author_id]?.display_name || 'Unknown',
		author_avatar: threadProfileMap[t.author_id]?.avatar_url || null,
		last_post_by_name: t.last_post_by ? (threadProfileMap[t.last_post_by]?.display_name || 'Unknown') : null,
		last_post_by_avatar: t.last_post_by ? (threadProfileMap[t.last_post_by]?.avatar_url || null) : null,
	}));

	// Get or create the game's discussion board (for creating new threads)
	let { data: gameBoard } = await locals.supabase
		.from('forum_boards')
		.select('id, slug')
		.eq('game_id', gameId)
		.maybeSingle();

	// Auto-create a discussion board for this game if one doesn't exist
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
