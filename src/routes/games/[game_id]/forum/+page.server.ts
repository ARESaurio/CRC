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

	// ── Original game submission (for basic submission banner) ─────────
	const { data: pendingGame } = await locals.supabase
		.from('pending_games')
		.select('submitted_by, game_data, submitter_notes, description, rules, simple_category_notes')
		.eq('game_id', gameId)
		.order('submitted_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	const originalSubmission = pendingGame ? {
		submitted_by: pendingGame.submitted_by,
		game_data: pendingGame.game_data || {},
		submitter_notes: pendingGame.submitter_notes || null,
		simple_category_notes: (pendingGame as any).simple_category_notes
			?? pendingGame.game_data?.simple_category_notes
			?? null,
	} : null;

	// ── Game Initialization System (Community Review games) ───────────
	// Load rough draft, proposals, votes, volunteers, and history
	let roughDraft: any = null;
	let proposals: any[] = [];
	let proposalVotes: any[] = [];
	let volunteers: any[] = [];
	let draftHistory: any[] = [];

	// Check if game is in Community Review (quick query)
	const { data: gameStatus } = await locals.supabase
		.from('games')
		.select('status')
		.eq('game_id', gameId)
		.maybeSingle();

	const isCommunityReview = gameStatus?.status === 'Community Review';

	if (isCommunityReview) {
		try {
			// Rough draft
			const { data: rd } = await locals.supabase
				.from('game_rough_draft')
				.select('*')
				.eq('game_id', gameId)
				.maybeSingle();
			roughDraft = rd;

			// Open proposals (with author profiles)
			const { data: rawProposals } = await locals.supabase
				.from('draft_proposals')
				.select('*')
				.eq('game_id', gameId)
				.in('status', ['open', 'accepted'])
				.order('created_at', { ascending: false })
				.limit(50);

			if (rawProposals && rawProposals.length > 0) {
				const propUserIds = [...new Set(rawProposals.map((p: any) => p.user_id))];
				let propProfiles: Record<string, { display_name: string; runner_id: string; avatar_url: string }> = {};
				if (propUserIds.length > 0) {
					const { data: profiles } = await locals.supabase
						.from('profiles')
						.select('user_id, display_name, runner_id, avatar_url')
						.in('user_id', propUserIds);
					for (const p of profiles || []) {
						propProfiles[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id, avatar_url: p.avatar_url };
					}
				}

				// Load vote counts per proposal
				const propIds = rawProposals.map((p: any) => p.id);
				const { data: rawPropVotes } = await locals.supabase
					.from('draft_proposal_votes')
					.select('proposal_id, user_id, vote')
					.in('proposal_id', propIds);
				proposalVotes = rawPropVotes || [];

				proposals = rawProposals.map((p: any) => {
					const pVotes = (rawPropVotes || []).filter((v: any) => v.proposal_id === p.id);
					const accepts = pVotes.filter((v: any) => v.vote === 'accept').length + 1; // +1 for proposer
					const rejects = pVotes.filter((v: any) => v.vote === 'reject').length;
					return {
						...p,
						...(propProfiles[p.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null }),
						accept_count: accepts,
						reject_count: rejects,
					};
				});
			}

			// Volunteers
			const { data: rawVols } = await locals.supabase
				.from('game_role_volunteers')
				.select('*')
				.eq('game_id', gameId);
			if (rawVols && rawVols.length > 0) {
				const volUserIds = [...new Set(rawVols.map((v: any) => v.user_id))];
				let volProfiles: Record<string, { display_name: string; runner_id: string }> = {};
				if (volUserIds.length > 0) {
					const { data: profiles } = await locals.supabase
						.from('profiles')
						.select('user_id, display_name, runner_id')
						.in('user_id', volUserIds);
					for (const p of profiles || []) {
						volProfiles[p.user_id] = { display_name: p.display_name, runner_id: p.runner_id };
					}
				}
				volunteers = rawVols.map((v: any) => ({
					...v,
					...(volProfiles[v.user_id] || { display_name: 'Unknown', runner_id: null }),
				}));
			}

			// Draft history (last 20 versions)
			const { data: rawHistory } = await locals.supabase
				.from('draft_history')
				.select('*')
				.eq('game_id', gameId)
				.order('version', { ascending: false })
				.limit(20);
			draftHistory = rawHistory || [];
		} catch (err) {
			// Tables may not exist yet — gracefully degrade
			console.error('Community Review data load error (tables may not exist yet):', err);
		}
	}

	return {
		members: enrichedMembers,
		drafts: drafts || [],
		votes: votes || [],
		latestComments: latestComments || [],
		suggestions: enrichedSuggestions,
		userId,
		originalSubmission,
		isCommunityReview,
		roughDraft,
		proposals,
		proposalVotes,
		volunteers,
		draftHistory,
	};
};
