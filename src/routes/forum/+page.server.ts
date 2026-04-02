import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Fetch all site-wide boards (game_id IS NULL)
	const { data: boards } = await locals.supabase
		.from('forum_boards')
		.select('*')
		.is('game_id', null)
		.order('sort_order');

	const enrichedBoards = [];

	for (const board of boards || []) {
		// Thread count
		const { count: threadCount } = await locals.supabase
			.from('forum_threads')
			.select('id', { count: 'exact', head: true })
			.eq('board_id', board.id);

		// Total post count across all threads in this board
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

		// Last post info
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

	return { boards: enrichedBoards };
};
