import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

const POSTS_PER_PAGE = 15;

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { game_id, thread_id } = params;
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));

	// Fetch thread (must belong to this game)
	const { data: thread } = await locals.supabase
		.from('forum_threads')
		.select('*')
		.eq('id', thread_id)
		.eq('game_id', game_id)
		.maybeSingle();

	if (!thread) throw error(404, 'Thread not found');

	// Total post count
	const { count: totalPosts } = await locals.supabase
		.from('forum_posts')
		.select('id', { count: 'exact', head: true })
		.eq('thread_id', thread_id);

	const totalPages = Math.ceil((totalPosts || 0) / POSTS_PER_PAGE) || 1;
	const offset = (page - 1) * POSTS_PER_PAGE;

	// Fetch posts
	const { data: posts } = await locals.supabase
		.from('forum_posts')
		.select('*')
		.eq('thread_id', thread_id)
		.order('created_at', { ascending: true })
		.range(offset, offset + POSTS_PER_PAGE - 1);

	// Collect author IDs
	const authorIds = [...new Set([
		...(posts || []).map((p: any) => p.author_id),
		thread.author_id,
	].filter(Boolean))];

	// Fetch profiles
	let profileMap: Record<string, any> = {};
	if (authorIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url, runner_id, created_at, forum_post_count, signature, is_admin, is_super_admin, role')
			.in('user_id', authorIds);

		for (const p of profiles || []) {
			let authorRole = 'runner';
			if (p.is_super_admin) authorRole = 'super_admin';
			else if (p.is_admin) authorRole = 'admin';
			else if (p.role === 'moderator') authorRole = 'moderator';
			else if (p.role === 'verifier') authorRole = 'verifier';

			profileMap[p.user_id] = {
				display_name: p.display_name,
				avatar_url: p.avatar_url,
				runner_id: p.runner_id,
				joined_at: p.created_at,
				post_count: p.forum_post_count || 0,
				signature: p.signature,
				role: authorRole,
			};
		}
	}

	const enrichedPosts = (posts || []).map((p: any) => {
		const profile = profileMap[p.author_id] || {};
		return {
			...p,
			author_name: profile.display_name || 'Unknown',
			author_avatar: profile.avatar_url || null,
			author_runner_id: profile.runner_id || null,
			author_joined_at: profile.joined_at || null,
			author_post_count: profile.post_count || 0,
			author_signature: profile.signature || null,
			author_role: profile.role || 'runner',
		};
	});

	const threadAuthor = profileMap[thread.author_id] || {};

	// Admin/mod check
	let isAdmin = false;
	let isMod = false;
	const userId = locals.session?.user?.id ?? null;
	if (userId) {
		const { data: userProfile } = await locals.supabase
			.from('profiles')
			.select('is_admin, is_super_admin, role')
			.eq('user_id', userId)
			.maybeSingle();
		if (userProfile) {
			isAdmin = !!(userProfile.is_admin || userProfile.is_super_admin);
			isMod = userProfile.role === 'moderator';
		}
	}

	return {
		thread: {
			...thread,
			author_name: threadAuthor.display_name || 'Unknown',
		},
		posts: enrichedPosts,
		page,
		totalPages,
		totalPosts: totalPosts || 0,
		isAdmin,
		isMod,
		userId,
	};
};
