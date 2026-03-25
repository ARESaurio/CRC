import type { PageServerLoad } from './$types';
import { SECTIONS, type SectionId } from '../../consensus';
import { error, redirect } from '@sveltejs/kit';

const validSections = SECTIONS.map(s => s.id);

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const gameId = params.game_id;
	const section = params.section as SectionId;

	if (!validSections.includes(section)) {
		throw error(404, 'Invalid section');
	}

	// Community Review games use the new system on the main forum page
	const parentData = await parent();
	if (parentData.game?.status === 'Community Review') {
		throw redirect(302, `/games/${gameId}/forum`);
	}

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
			memberProfiles[p.user_id] = {
				display_name: p.display_name,
				runner_id: p.runner_id,
				avatar_url: p.avatar_url
			};
		}
	}

	const enrichedMembers = (members || []).map((m: any) => ({
		...m,
		...(memberProfiles[m.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	// ── Drafts (this section only) ───────────────────────────────────────
	const { data: drafts } = await locals.supabase
		.from('discussion_drafts')
		.select('*')
		.eq('game_id', gameId)
		.eq('section', section)
		.in('status', ['active'])
		.order('created_at');

	const draftUserIds = [...new Set((drafts || []).map((d: any) => d.user_id))];
	let draftProfiles: Record<string, { display_name: string; runner_id: string; avatar_url: string }> = {};

	if (draftUserIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id, avatar_url')
			.in('user_id', draftUserIds);
		for (const p of profiles || []) {
			draftProfiles[p.user_id] = {
				display_name: p.display_name,
				runner_id: p.runner_id,
				avatar_url: p.avatar_url
			};
		}
	}

	const enrichedDrafts = (drafts || []).map((d: any) => ({
		...d,
		...(draftProfiles[d.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	// ── Votes (this section only) ────────────────────────────────────────
	const { data: votes } = await locals.supabase
		.from('discussion_votes')
		.select('id, game_id, user_id, draft_id, section, scope, item_slug')
		.eq('game_id', gameId)
		.eq('section', section);

	// ── Comments (this section only) ─────────────────────────────────────
	const { data: rawComments } = await locals.supabase
		.from('discussion_comments')
		.select('*')
		.eq('game_id', gameId)
		.eq('section', section)
		.order('created_at');

	const commentUserIds = [...new Set((rawComments || []).map((c: any) => c.user_id))];
	let commentProfiles: Record<string, { display_name: string; runner_id: string; avatar_url: string }> = {};

	if (commentUserIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, display_name, runner_id, avatar_url')
			.in('user_id', commentUserIds);
		for (const p of profiles || []) {
			commentProfiles[p.user_id] = {
				display_name: p.display_name,
				runner_id: p.runner_id,
				avatar_url: p.avatar_url
			};
		}
	}

	const comments = (rawComments || []).map((c: any) => ({
		...c,
		...(commentProfiles[c.user_id] || { display_name: 'Unknown', runner_id: null, avatar_url: null })
	}));

	// ── Original game submission (for fork-from-submission feature) ────
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
		description: pendingGame.description || null,
		rules: pendingGame.rules || null,
		simple_category_notes: (pendingGame as any).simple_category_notes
			?? pendingGame.game_data?.simple_category_notes
			?? null,
	} : null;

	return {
		section,
		members: enrichedMembers,
		drafts: enrichedDrafts,
		votes: votes || [],
		comments,
		userId,
		originalSubmission
	};
};
