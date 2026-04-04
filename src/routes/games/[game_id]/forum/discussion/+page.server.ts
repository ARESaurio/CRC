import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const gameId = params.game_id;
	const userId = locals.session?.user?.id ?? null;
	const { game } = await parent();
	if (!game) throw error(404, 'Game not found');

	// ── Phase 1: threads + board + profile check in parallel ─────────────
	const [threadsRes, boardRes, profileRes] = await Promise.all([
		locals.supabase
			.from('forum_threads')
			.select('*')
			.eq('game_id', gameId)
			.order('is_pinned', { ascending: false })
			.order('last_post_at', { ascending: false })
			.limit(50),
		locals.supabase
			.from('forum_boards')
			.select('id, slug')
			.eq('game_id', gameId)
			.maybeSingle(),
		userId
			? locals.supabase.from('profiles').select('status').eq('user_id', userId).maybeSingle()
			: Promise.resolve({ data: null })
	]);

	const threads = threadsRes.data || [];
	let gameBoard = boardRes.data;
	const hasApprovedProfile = profileRes.data?.status === 'approved';

	// Auto-create board if needed
	if (!gameBoard) {
		const boardSlug = `game-${gameId}`;
		const gameName = gameId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
		const { data: newBoard } = await locals.supabase
			.from('forum_boards')
			.insert({ slug: boardSlug, name: `${gameName} Discussion`, description: 'Community discussion threads', sort_order: 0, game_id: gameId })
			.select('id, slug')
			.single();
		gameBoard = newBoard;
	}

	// ── Phase 2: batch profile lookup ────────────────────────────────────
	const userIds = new Set<string>();
	for (const t of threads) {
		if (t.author_id) userIds.add(t.author_id);
		if (t.last_post_by) userIds.add(t.last_post_by);
	}

	let profileMap: Record<string, { display_name: string; avatar_url: string | null; runner_id: string | null }> = {};
	if (userIds.size > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url, runner_id')
			.in('user_id', [...userIds]);
		for (const p of profiles || []) {
			profileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url, runner_id: p.runner_id };
		}
	}

	const enrichedThreads = threads.map((t: any) => ({
		...t,
		author_name: profileMap[t.author_id]?.display_name || 'Unknown',
		author_avatar: profileMap[t.author_id]?.avatar_url || null,
		last_post_by_name: t.last_post_by ? (profileMap[t.last_post_by]?.display_name || 'Unknown') : null,
		last_post_by_avatar: t.last_post_by ? (profileMap[t.last_post_by]?.avatar_url || null) : null,
	}));

	return {
		threads: enrichedThreads,
		gameBoardId: gameBoard?.id || null,
		userId,
		hasApprovedProfile,
	};
};
