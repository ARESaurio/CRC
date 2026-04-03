import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

const THREADS_PER_PAGE = 25;

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { board_slug } = params;
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));

	// Fetch board
	const { data: board } = await locals.supabase
		.from('forum_boards')
		.select('*')
		.eq('slug', board_slug)
		.is('game_id', null)
		.maybeSingle();

	if (!board) throw error(404, 'Board not found');

	// Count total threads
	const { count: totalThreads } = await locals.supabase
		.from('forum_threads')
		.select('id', { count: 'exact', head: true })
		.eq('board_id', board.id);

	const totalPages = Math.ceil((totalThreads || 0) / THREADS_PER_PAGE) || 1;
	const offset = (page - 1) * THREADS_PER_PAGE;

	// Fetch threads — pinned first, then by last_post_at
	const { data: threads } = await locals.supabase
		.from('forum_threads')
		.select('*')
		.eq('board_id', board.id)
		.order('is_pinned', { ascending: false })
		.order('last_post_at', { ascending: false })
		.range(offset, offset + THREADS_PER_PAGE - 1);

	// Enrich with author and last-poster profiles
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

	const enrichedThreads = (threads || []).map((t: any) => ({
		...t,
		author_name: profileMap[t.author_id]?.display_name || 'Unknown',
		author_avatar: profileMap[t.author_id]?.avatar_url || null,
		author_runner_id: profileMap[t.author_id]?.runner_id || null,
		last_post_by_name: t.last_post_by ? (profileMap[t.last_post_by]?.display_name || 'Unknown') : null,
		last_post_by_avatar: t.last_post_by ? (profileMap[t.last_post_by]?.avatar_url || null) : null,
	}));

	return {
		board,
		threads: enrichedThreads,
		page,
		totalPages,
		totalThreads: totalThreads || 0,
	};
};
