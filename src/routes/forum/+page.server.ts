import type { PageServerLoad } from './$types';

const THREADS_PER_PAGE = 20;

export const load: PageServerLoad = async ({ locals, url }) => {
	const search = url.searchParams.get('q') || '';
	const scope = url.searchParams.get('scope') || 'global';
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));

	// ── Phase 1: boards + threads query + count (parallel) ───────────────
	let threadsQuery = locals.supabase
		.from('forum_threads')
		.select('*, forum_boards!inner(slug, name, game_id)')
		.order('is_pinned', { ascending: false })
		.order('last_post_at', { ascending: false });

	let countQuery = locals.supabase
		.from('forum_threads')
		.select('id', { count: 'exact', head: true });

	if (scope === 'global') {
		threadsQuery = threadsQuery.is('game_id', null);
		countQuery = countQuery.is('game_id', null);
	} else if (scope === 'games') {
		threadsQuery = threadsQuery.not('game_id', 'is', null);
		countQuery = countQuery.not('game_id', 'is', null);
	}

	if (search) {
		threadsQuery = threadsQuery.ilike('title', `%${search}%`);
		countQuery = countQuery.ilike('title', `%${search}%`);
	}

	const offset = (page - 1) * THREADS_PER_PAGE;

	const [boardsRes, countRes, threadsRes] = await Promise.all([
		locals.supabase
			.from('forum_boards')
			.select('*')
			.is('game_id', null)
			.order('sort_order'),
		countQuery,
		threadsQuery.range(offset, offset + THREADS_PER_PAGE - 1)
	]);

	const boards = boardsRes.data || [];
	const totalThreads = countRes.count || 0;
	const totalPages = Math.ceil(totalThreads / THREADS_PER_PAGE) || 1;
	const threads = threadsRes.data || [];

	// ── Phase 2: batch board stats ───────────────────────────────────────
	// Instead of N+1 queries per board, fetch all stats in parallel batches.
	const boardIds = boards.map((b: any) => b.id);

	let boardThreadCounts: Record<string, number> = {};
	let boardPostCounts: Record<string, number> = {};
	let boardLastThreads: Record<string, any> = {};

	if (boardIds.length > 0) {
		// Fetch thread counts per board, post counts, and last thread — all in parallel
		const [allBoardThreadsRes, lastThreadsRes] = await Promise.all([
			// Get all thread IDs + board_id for count and post-count lookup
			locals.supabase
				.from('forum_threads')
				.select('id, board_id')
				.in('board_id', boardIds),
			// Get the most recent thread per board (fetch extras, dedupe in JS)
			locals.supabase
				.from('forum_threads')
				.select('id, title, board_id, last_post_at, last_post_by')
				.in('board_id', boardIds)
				.order('last_post_at', { ascending: false })
				.limit(boardIds.length * 2)
		]);

		const allBoardThreads = allBoardThreadsRes.data || [];
		const lastThreadsRaw = lastThreadsRes.data || [];

		// Thread counts per board
		for (const t of allBoardThreads) {
			boardThreadCounts[t.board_id] = (boardThreadCounts[t.board_id] || 0) + 1;
		}

		// Last thread per board (first occurrence per board_id since sorted desc)
		const seenBoards = new Set<string>();
		for (const t of lastThreadsRaw) {
			if (!seenBoards.has(t.board_id)) {
				boardLastThreads[t.board_id] = t;
				seenBoards.add(t.board_id);
			}
		}

		// Post counts: batch count by thread IDs grouped by board
		const allThreadIds = allBoardThreads.map((t: any) => t.id);
		if (allThreadIds.length > 0) {
			const { data: postRows } = await locals.supabase
				.from('forum_posts')
				.select('thread_id')
				.in('thread_id', allThreadIds);

			// Map thread_id → board_id for counting
			const threadToBoard: Record<string, string> = {};
			for (const t of allBoardThreads) threadToBoard[t.id] = t.board_id;

			for (const p of postRows || []) {
				const bid = threadToBoard[p.thread_id];
				if (bid) boardPostCounts[bid] = (boardPostCounts[bid] || 0) + 1;
			}
		}
	}

	// ── Phase 3: batch profile lookup for all user IDs ───────────────────
	const allUserIds = new Set<string>();
	for (const t of threads) {
		if (t.author_id) allUserIds.add(t.author_id);
		if (t.last_post_by) allUserIds.add(t.last_post_by);
	}
	for (const lt of Object.values(boardLastThreads)) {
		if (lt.last_post_by) allUserIds.add(lt.last_post_by);
	}

	let profileMap: Record<string, { display_name: string; avatar_url: string | null; runner_id: string | null }> = {};
	if (allUserIds.size > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url, runner_id')
			.in('user_id', [...allUserIds]);
		for (const p of profiles || []) {
			profileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url, runner_id: p.runner_id };
		}
	}

	// ── Phase 4: batch game name lookup for threads ──────────────────────
	const gameIds = [...new Set(threads.map((t: any) => t.game_id).filter(Boolean))];
	let gameMap: Record<string, string> = {};
	if (gameIds.length > 0) {
		const { data: games } = await locals.supabase
			.from('games')
			.select('game_id, game_name')
			.in('game_id', gameIds);
		for (const g of games || []) gameMap[g.game_id] = g.game_name;
	}

	// ── Assemble enriched boards ─────────────────────────────────────────
	const enrichedBoards = boards.map((board: any) => {
		const lastThread = boardLastThreads[board.id] || null;
		return {
			...board,
			thread_count: boardThreadCounts[board.id] || 0,
			post_count: boardPostCounts[board.id] || 0,
			last_thread_title: lastThread?.title || null,
			last_thread_id: lastThread?.id || null,
			last_post_at: lastThread?.last_post_at || null,
			last_post_by: lastThread?.last_post_by || null,
			last_post_by_name: lastThread?.last_post_by ? (profileMap[lastThread.last_post_by]?.display_name || null) : null,
			last_post_by_avatar: lastThread?.last_post_by ? (profileMap[lastThread.last_post_by]?.avatar_url || null) : null,
		};
	});

	// ── Assemble enriched threads ────────────────────────────────────────
	const enrichedThreads = threads.map((t: any) => ({
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
		totalThreads,
		search,
		scope,
	};
};
