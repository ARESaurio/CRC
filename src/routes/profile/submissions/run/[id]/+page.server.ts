import { getGame } from '$lib/server/supabase';
import { getPlatforms } from '$lib/server/data';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.user?.id) {
		throw redirect(302, `/sign-in?redirect=/profile/submissions`);
	}

	const userId = locals.session.user.id;
	const runId = params.id;

	// Fetch pending run
	const { data: run, error: runErr } = await locals.supabase
		.from('pending_runs')
		.select('*')
		.eq('public_id', runId)
		.single();

	if (runErr || !run) {
		throw error(404, 'Submission not found');
	}

	// Verify ownership
	if (run.submitted_by !== userId) {
		throw error(403, 'You can only edit your own submissions');
	}

	// Load game data for dropdowns
	const game = await getGame(locals.supabase, run.game_id);
	if (!game) {
		throw error(404, 'Game not found');
	}

	// Load platforms
	const rawPlatforms = getPlatforms();
	const platforms = Object.entries(rawPlatforms).map(([id, p]) => ({ id, label: (p as any).label }));
	platforms.sort((a, b) => a.label.localeCompare(b.label));

	// Load runner profile
	let runnerProfile: any = null;
	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('runner_id, display_name, avatar_url, pronouns, location, socials')
		.eq('user_id', userId)
		.eq('status', 'approved')
		.maybeSingle();
	if (profile?.runner_id) {
		runnerProfile = profile;
	}

	return { run, game, platforms, runnerProfile };
};
