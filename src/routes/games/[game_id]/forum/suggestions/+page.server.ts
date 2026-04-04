import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const gameId = params.game_id;
	const userId = locals.session?.user?.id ?? null;
	const { game } = await parent();
	if (!game) throw error(404, 'Game not found');

	// ── Phase 1: suggestions + user profile check in parallel ────────────
	const [suggestionsRes, profileRes] = await Promise.all([
		locals.supabase
			.from('game_suggestions')
			.select('*')
			.eq('game_id', gameId)
			.order('created_at', { ascending: false })
			.limit(50),
		userId
			? locals.supabase.from('profiles').select('status').eq('user_id', userId).maybeSingle()
			: Promise.resolve({ data: null })
	]);

	const suggestions = suggestionsRes.data || [];
	const hasApprovedProfile = profileRes.data?.status === 'approved';

	// ── Phase 2: batch author profiles + votes + comments ────────────────
	const sugUserIds = [...new Set(suggestions.map((s: any) => s.user_id))];
	const sugIds = suggestions.map((s: any) => s.id);

	const [profilesRes, votesRes, commentsRes] = await Promise.all([
		sugUserIds.length > 0
			? locals.supabase.from('profiles').select('user_id, display_name, runner_id, avatar_url').in('user_id', sugUserIds)
			: Promise.resolve({ data: [] }),
		sugIds.length > 0
			? locals.supabase.from('game_suggestion_votes').select('suggestion_id, vote').in('suggestion_id', sugIds)
			: Promise.resolve({ data: [] }),
		sugIds.length > 0
			? locals.supabase.from('game_suggestion_comments').select('suggestion_id').in('suggestion_id', sugIds)
			: Promise.resolve({ data: [] })
	]);

	const profileMap: Record<string, any> = {};
	for (const p of profilesRes.data || []) {
		profileMap[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id, avatar_url: p.avatar_url };
	}

	const voteCounts: Record<string, { agree: number; disagree: number }> = {};
	for (const v of votesRes.data || []) {
		if (!voteCounts[v.suggestion_id]) voteCounts[v.suggestion_id] = { agree: 0, disagree: 0 };
		if (v.vote === 'agree') voteCounts[v.suggestion_id].agree++;
		else voteCounts[v.suggestion_id].disagree++;
	}

	const commentCounts: Record<string, number> = {};
	for (const c of commentsRes.data || []) {
		commentCounts[c.suggestion_id] = (commentCounts[c.suggestion_id] || 0) + 1;
	}

	const enrichedSuggestions = suggestions.map((s: any) => ({
		...s,
		...(profileMap[s.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null }),
		vote_counts: voteCounts[s.id] || { agree: 0, disagree: 0 },
		comment_count: commentCounts[s.id] || 0
	}));

	return {
		suggestions: enrichedSuggestions,
		userId,
		hasApprovedProfile,
	};
};
