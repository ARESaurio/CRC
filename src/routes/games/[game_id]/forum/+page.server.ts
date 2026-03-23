import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const gameId = params.game_id;
	const userId = locals.session?.user?.id ?? null;

	// ── Committee members ────────────────────────────────────────────────
	const { data: members } = await locals.supabase
		.from('rules_committee_members')
		.select('id, game_id, user_id, role, joined_at')
		.eq('game_id', gameId)
		.order('joined_at');

	const memberUserIds = (members || []).map((m: any) => m.user_id);
	let memberProfiles: Record<string, { display_name: string; runner_id: string; avatar_url: string }> = {};

	if (memberUserIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id, avatar_url')
			.in('user_id', memberUserIds);
		for (const p of profiles || []) {
			memberProfiles[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id, avatar_url: p.avatar_url };
		}
	}

	const enrichedMembers = (members || []).map((m: any) => ({
		...m,
		...(memberProfiles[m.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	// ── Drafts summary (all sections) ────────────────────────────────────
	const { data: drafts } = await locals.supabase
		.from('discussion_drafts')
		.select('*')
		.eq('game_id', gameId)
		.in('status', ['active'])
		.order('updated_at', { ascending: false });

	// ── Votes (all sections — for consensus calc) ────────────────────────
	const { data: votes } = await locals.supabase
		.from('discussion_votes')
		.select('id, draft_id, section, scope, item_slug, user_id')
		.eq('game_id', gameId);

	// ── Comments summary (latest per section) ────────────────────────────
	const { data: latestComments } = await locals.supabase
		.from('discussion_comments')
		.select('section, created_at')
		.eq('game_id', gameId)
		.order('created_at', { ascending: false })
		.limit(50);

	// ── Suggestions ──────────────────────────────────────────────────────
	const { data: suggestions } = await locals.supabase
		.from('game_suggestions')
		.select('*')
		.eq('game_id', gameId)
		.order('created_at', { ascending: false })
		.limit(50);

	// Enrich suggestion authors
	const sugUserIds = [...new Set((suggestions || []).map((s: any) => s.user_id))];
	let sugProfiles: Record<string, { display_name: string; runner_id: string }> = {};
	if (sugUserIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id')
			.in('user_id', sugUserIds);
		for (const p of profiles || []) {
			sugProfiles[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id };
		}
	}

	// Load vote + comment counts for suggestions
	const sugIds = (suggestions || []).map((s: any) => s.id);
	let sugVoteCounts: Record<string, { agree: number; disagree: number }> = {};
	let sugCommentCounts: Record<string, number> = {};

	if (sugIds.length > 0) {
		const { data: sugVotes } = await locals.supabase
			.from('game_suggestion_votes')
			.select('suggestion_id, vote')
			.in('suggestion_id', sugIds);
		for (const v of sugVotes || []) {
			if (!sugVoteCounts[v.suggestion_id]) sugVoteCounts[v.suggestion_id] = { agree: 0, disagree: 0 };
			if (v.vote === 'agree') sugVoteCounts[v.suggestion_id].agree++;
			else sugVoteCounts[v.suggestion_id].disagree++;
		}

		const { data: sugComments } = await locals.supabase
			.from('game_suggestion_comments')
			.select('suggestion_id')
			.in('suggestion_id', sugIds);
		for (const c of sugComments || []) {
			sugCommentCounts[c.suggestion_id] = (sugCommentCounts[c.suggestion_id] || 0) + 1;
		}
	}

	const enrichedSuggestions = (suggestions || []).map((s: any) => ({
		...s,
		...(sugProfiles[s.user_id] || { display_name: 'Unknown', runner_id: null }),
		vote_counts: sugVoteCounts[s.id] || { agree: 0, disagree: 0 },
		comment_count: sugCommentCounts[s.id] || 0
	}));

	return {
		members: enrichedMembers,
		drafts: drafts || [],
		votes: votes || [],
		latestComments: latestComments || [],
		suggestions: enrichedSuggestions,
		userId
	};
};
