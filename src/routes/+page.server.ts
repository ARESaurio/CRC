// =============================================================================
// Homepage Server Load
// =============================================================================

import { getActiveGames, getRecentRuns, getCounts } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [games, recentRuns, stats, postsRes] = await Promise.all([
		getActiveGames(locals.supabase),
		getRecentRuns(locals.supabase, 12),
		getCounts(locals.supabase),
		locals.supabase
			.from('news_posts')
			.select('id, slug, title, date, excerpt, author, tags, featured, content')
			.eq('published', true)
			.order('date', { ascending: false })
			.limit(10)
	]);

	const posts = postsRes.data || [];

	return {
		games,
		recentRuns,
		posts,
		stats: {
			...stats,
			postCount: posts.length
		}
	};
};
