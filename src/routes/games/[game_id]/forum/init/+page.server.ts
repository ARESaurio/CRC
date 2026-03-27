import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const gameId = params.game_id;
	const userId = locals.session?.user?.id ?? null;

	// Only Community Review games use this page
	const parentData = await parent();
	if (parentData.game?.status !== 'Community Review') {
		throw redirect(302, `/games/${gameId}/forum`);
	}

	// ── Rough draft ──────────────────────────────────────────────────────
	let roughDraft: any = null;
	try {
		const { data: rd, error: rdErr } = await locals.supabase
			.from('game_rough_draft')
			.select('*')
			.eq('game_id', gameId)
			.maybeSingle();
		if (rdErr) console.error(`game_rough_draft query error for ${gameId}:`, rdErr.message);
		roughDraft = rd;
	} catch (err) {
		console.error('game_rough_draft load error:', err);
	}

	// ── Open proposals (with author profiles) ────────────────────────────
	let proposals: any[] = [];
	let proposalVotes: any[] = [];
	try {
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

			const propIds = rawProposals.map((p: any) => p.id);
			const { data: rawPropVotes } = await locals.supabase
				.from('draft_proposal_votes')
				.select('proposal_id, user_id, vote')
				.in('proposal_id', propIds);
			proposalVotes = rawPropVotes || [];

			proposals = rawProposals.map((p: any) => {
				const pVotes = (rawPropVotes || []).filter((v: any) => v.proposal_id === p.id);
				const accepts = pVotes.filter((v: any) => v.vote === 'accept').length + 1;
				const rejects = pVotes.filter((v: any) => v.vote === 'reject').length;
				return {
					...p,
					...(propProfiles[p.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null }),
					accept_count: accepts,
					reject_count: rejects,
				};
			});
		}
	} catch (err) {
		console.error('Proposals load error:', err);
	}

	// ── Volunteers ───────────────────────────────────────────────────────
	let volunteers: any[] = [];
	try {
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
	} catch (err) {
		console.error('Volunteers load error:', err);
	}

	// ── Draft history ────────────────────────────────────────────────────
	let draftHistory: any[] = [];
	try {
		const { data: rawHistory } = await locals.supabase
			.from('draft_history')
			.select('*')
			.eq('game_id', gameId)
			.order('version', { ascending: false })
			.limit(20);
		draftHistory = rawHistory || [];
	} catch (err) {
		console.error('Draft history load error:', err);
	}

	// ── Original game submission (for basic submission banner) ────────────
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

	return {
		userId,
		roughDraft,
		proposals,
		proposalVotes,
		volunteers,
		draftHistory,
		originalSubmission,
	};
};
