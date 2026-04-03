// =============================================================================
// Homepage Server Load
// =============================================================================

import { getActiveGames, getRecentRuns, getCounts } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [games, recentRuns, stats, postsRes, forumRes] = await Promise.all([
		getActiveGames(locals.supabase),
		getRecentRuns(locals.supabase, 12),
		getCounts(locals.supabase),
		locals.supabase
			.from('news_posts')
			.select('id, slug, title, date, excerpt, author, tags, featured, content')
			.eq('published', true)
			.order('date', { ascending: false })
			.limit(10),
		locals.supabase
			.from('forum_threads')
			.select('id, title, author_id, reply_count, view_count, last_post_at, last_post_by, game_id, board_id, is_pinned, forum_boards!inner(slug, name, game_id)')
			.order('last_post_at', { ascending: false })
			.limit(5),
	]);

	const posts = postsRes.data || [];
	const forumThreadsRaw = forumRes.data || [];

	// Enrich forum threads with author names
	const forumUserIds = new Set<string>();
	for (const t of forumThreadsRaw) {
		if (t.author_id) forumUserIds.add(t.author_id);
		if (t.last_post_by) forumUserIds.add(t.last_post_by);
	}
	let forumProfileMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
	if (forumUserIds.size > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url')
			.in('user_id', [...forumUserIds]);
		for (const p of profiles || []) {
			forumProfileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
		}
	}

	const forumThreads = forumThreadsRaw.map((t: any) => ({
		id: t.id,
		title: t.title,
		reply_count: t.reply_count,
		view_count: t.view_count,
		last_post_at: t.last_post_at,
		is_pinned: t.is_pinned,
		game_id: t.game_id,
		board_slug: t.forum_boards?.slug || null,
		board_name: t.forum_boards?.name || null,
		author_name: forumProfileMap[t.author_id]?.display_name || 'Unknown',
		last_post_by_name: t.last_post_by ? (forumProfileMap[t.last_post_by]?.display_name || 'Unknown') : null,
		last_post_by_avatar: t.last_post_by ? (forumProfileMap[t.last_post_by]?.avatar_url || null) : null,
	}));

	return {
		games,
		recentRuns,
		posts,
		forumThreads,
		stats: {
			...stats,
			postCount: posts.length
		}
	};
};
