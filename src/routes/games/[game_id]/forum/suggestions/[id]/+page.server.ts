import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const suggestionId = params.id;
	const userId = locals.session?.user?.id ?? null;

	// ── Suggestion ───────────────────────────────────────────────────────
	const { data: suggestions } = await locals.supabase
		.from('game_suggestions')
		.select('*')
		.eq('id', suggestionId);

	if (!suggestions?.length) throw error(404, 'Suggestion not found');
	const suggestion = suggestions[0];

	// Author profile
	const { data: authorProfiles } = await locals.supabase
		.from('profiles')
		.select('user_id, display_name, runner_id, avatar_url')
		.eq('user_id', suggestion.user_id);
	const author = authorProfiles?.[0] || { display_name: 'Unknown', runner_id: null, avatar_url: null };

	// ── Votes ────────────────────────────────────────────────────────────
	const { data: votes } = await locals.supabase
		.from('game_suggestion_votes')
		.select('id, user_id, vote')
		.eq('suggestion_id', suggestionId);

	// ── Comments ─────────────────────────────────────────────────────────
	const { data: rawComments } = await locals.supabase
		.from('game_suggestion_comments')
		.select('*')
		.eq('suggestion_id', suggestionId)
		.order('created_at');

	const commentUserIds = [...new Set((rawComments || []).map((c: any) => c.user_id))];
	let commentProfiles: Record<string, { display_name: string; runner_id: string; avatar_url: string }> = {};
	if (commentUserIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id, avatar_url')
			.in('user_id', commentUserIds);
		for (const p of profiles || []) {
			commentProfiles[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id, avatar_url: p.avatar_url };
		}
	}

	const comments = (rawComments || []).map((c: any) => ({
		...c,
		...(commentProfiles[c.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	return {
		suggestion: { ...suggestion, ...author },
		votes: votes || [],
		comments,
		userId
	};
};
