import type { PageServerLoad } from './$types';

const THREADS_PER_PAGE = 20;

export const load: PageServerLoad = async ({ locals, url }) => {
	const search = url.searchParams.get('q') || '';
	const scope = url.searchParams.get('scope') || 'global';
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));

	// ── Boards ───────────────────────────────────────────────────────
	const { data: boards } = await locals.supabase
		.from('forum_boards')
		.select('*')
		.is('game_id', null)
		.order('sort_order');

	const enrichedBoards = [];

	for (const board of boards || []) {
		const { count: threadCount } = await locals.supabase
			.from('forum_threads')
			.select('id', { count: 'exact', head: true })
			.eq('board_id', board.id);

		const { data: boardThreads } = await locals.supabase
			.from('forum_threads')
			.select('id')
			.eq('board_id', board.id);
		const threadIds = (boardThreads || []).map((t: any) => t.id);
		let postCount = 0;
		if (threadIds.length > 0) {
			const { count } = await locals.supabase
				.from('forum_posts')
				.select('id', { count: 'exact', head: true })
				.in('thread_id', threadIds);
			postCount = count || 0;
		}

		const { data: lastThread } = await locals.supabase
			.from('forum_threads')
			.select('id, title, last_post_at, last_post_by')
			.eq('board_id', board.id)
			.order('last_post_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		let lastPostByName: string | null = null;
		let lastPostByAvatar: string | null = null;
		if (lastThread?.last_post_by) {
			const { data: profile } = await locals.supabase
				.from('profiles')
				.select('display_name, avatar_url')
				.eq('user_id', lastThread.last_post_by)
				.maybeSingle();
			lastPostByName = profile?.display_name || null;
			lastPostByAvatar = profile?.avatar_url || null;
		}

		enrichedBoards.push({
			...board,
			thread_count: threadCount || 0,
			post_count: postCount,
			last_thread_title: lastThread?.title || null,
			last_thread_id: lastThread?.id || null,
			last_post_at: lastThread?.last_post_at || null,
			last_post_by: lastThread?.last_post_by || null,
			last_post_by_name: lastPostByName,
			last_post_by_avatar: lastPostByAvatar,
		});
	}

	// ── Recent Threads (with search + scope filter) ──────────────────
	let threadsQuery = locals.supabase
		.from('forum_threads')
		.select('*, forum_boards!inner(slug, name, game_id)')
		.order('is_pinned', { ascending: false })
		.order('last_post_at', { ascending: false });

	if (scope === 'global') {
		threadsQuery = threadsQuery.is('game_id', null);
	} else if (scope === 'games') {
		threadsQuery = threadsQuery.not('game_id', 'is', null);
	}

	if (search) {
		threadsQuery = threadsQuery.ilike('title', `%${search}%`);
	}

	// Count
	let countQuery = locals.supabase
		.from('forum_threads')
		.select('id', { count: 'exact', head: true });
	if (scope === 'global') countQuery = countQuery.is('game_id', null);
	else if (scope === 'games') countQuery = countQuery.not('game_id', 'is', null);
	if (search) countQuery = countQuery.ilike('title', `%${search}%`);
	const { count: totalThreads } = await countQuery;

	const totalPages = Math.ceil((totalThreads || 0) / THREADS_PER_PAGE) || 1;
	const offset = (page - 1) * THREADS_PER_PAGE;
	const { data: threads } = await threadsQuery.range(offset, offset + THREADS_PER_PAGE - 1);

	// Enrich
	const userIds = new Set<string>();
	for (const t of threads || []) {
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

	const gameIds = [...new Set((threads || []).map((t: any) => t.game_id).filter(Boolean))];
	let gameMap: Record<string, string> = {};
	if (gameIds.length > 0) {
		const { data: games } = await locals.supabase
			.from('games')
			.select('game_id, game_name')
			.in('game_id', gameIds);
		for (const g of games || []) gameMap[g.game_id] = g.game_name;
	}

	const enrichedThreads = (threads || []).map((t: any) => ({
		...t,
		author_name: profileMap[t.author_id]?.display_name || 'Unknown',
		author_avatar: profileMap[t.author_id]?.avatar_url || null,
		last_post_by_name: t.last_post_by ? (profileMap[t.last_post_by]?.display_name || 'Unknown') : null,
		last_post_by_avatar: t.last_post_by ? (profileMap[t.last_post_by]?.avatar_url || null) : null,
		board_slug: t.forum_boards?.slug || null,
		board_name: t.forum_boards?.name || null,
		game_name: t.game_id ? (gameMap[t.game_id] || t.game_id) : null,
	}));

	return {
		boards: enrichedBoards,
		threads: enrichedThreads,
		page,
		totalPages,
		totalThreads: totalThreads || 0,
		search,
		scope,
	};
};
