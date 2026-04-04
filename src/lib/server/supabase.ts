// =============================================================================
// Server-Side Supabase Query Helpers
// =============================================================================
// All dynamic content (games, runs, runners, achievements, teams) is fetched
// from Supabase at request time. Each function takes the Supabase client from
// event.locals.supabase (created in hooks.server.ts).
//
// Static content (posts, config, staff guides) stays in data.ts.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Game, Runner, Run, Achievement, Team } from '$lib/types';

// ─── Games ──────────────────────────────────────────────────────────────────

const GAME_LIST_COLS = 'game_id, game_name, game_name_aliases, cover, cover_position, is_modded, base_game, status, genres, platforms, full_runs, challenges_data, community_achievements, credits';

export async function getGames(supabase: SupabaseClient): Promise<Game[]> {
	const { data, error } = await supabase
		.from('games')
		.select(GAME_LIST_COLS)
		.order('game_name')
		.limit(500);

	if (error) {
		console.error('Error fetching games:', error.message);
		return [];
	}
	return data as Game[];
}

export async function getActiveGames(supabase: SupabaseClient): Promise<Game[]> {
	const { data, error } = await supabase
		.from('games')
		.select(GAME_LIST_COLS)
		.in('status', ['Active', 'Community Review'])
		.order('game_name')
		.limit(500);

	if (error) {
		console.error('Error fetching active games:', error.message);
		return [];
	}
	return data as Game[];
}

export async function getGame(supabase: SupabaseClient, gameId: string): Promise<Game | null> {
	const { data, error } = await supabase
		.from('games')
		.select('*')
		.eq('game_id', gameId)
		.single();

	if (error) {
		if (error.code === 'PGRST116') return null; // Not found
		console.error('Error fetching game:', error.message);
		return null;
	}
	return data as Game;
}

/** Fetch specific games by their IDs (avoids loading the entire games table). */
export async function getGamesByIds(supabase: SupabaseClient, gameIds: string[]): Promise<Game[]> {
	if (gameIds.length === 0) return [];
	const { data, error } = await supabase
		.from('games')
		.select(GAME_LIST_COLS)
		.in('game_id', gameIds)
		.limit(gameIds.length);

	if (error) {
		console.error('Error fetching games by IDs:', error.message);
		return [];
	}
	return data as Game[];
}

/** Fetch modded versions of a specific base game. */
export async function getModdedVersionsOf(supabase: SupabaseClient, baseGameId: string): Promise<Game[]> {
	const { data, error } = await supabase
		.from('games')
		.select('game_id, game_name, cover, cover_position, is_modded, status')
		.eq('base_game', baseGameId)
		.eq('is_modded', true)
		.limit(50);

	if (error) {
		console.error('Error fetching modded versions:', error.message);
		return [];
	}
	return data as Game[];
}

// ─── Runners ────────────────────────────────────────────────────────────────

/** Map a profiles row to the Runner interface */
function profileToRunner(p: any): Runner {
	return {
		runner_id: p.runner_id,
		runner_name: p.display_name || p.runner_id,
		display_name: p.display_name,
		avatar: p.avatar_url,
		joined_date: p.created_at,
		pronouns: p.pronouns,
		location: p.location,
		status: p.status_message,
		hidden: false,
		bio: p.bio,
		accent_color: p.accent_color || null,
		cover_position: p.cover_position || null,
		is_admin: p.is_admin,
		socials: p.socials || {},
		banner: p.banner_url,
		featured_runs: p.featured_runs,
		personal_goals: p.personal_goals,
		contributions: p.contributions,
	} as Runner;
}

// Columns needed to build a Runner via profileToRunner()
const PROFILE_RUNNER_COLS = 'runner_id, display_name, avatar_url, created_at, pronouns, location, status_message, bio, accent_color, cover_position, is_admin, socials, banner_url, featured_runs, personal_goals, contributions';

export async function getRunners(supabase: SupabaseClient): Promise<Runner[]> {
	const { data: profiles, error } = await supabase
		.from('profiles')
		.select(PROFILE_RUNNER_COLS)
		.eq('status', 'approved')
		.order('display_name')
		.limit(2000);

	if (error) {
		console.error('Error fetching profiles:', error.message);
		return [];
	}

	return (profiles || []).map(profileToRunner);
}

export async function getRunner(supabase: SupabaseClient, runnerId: string): Promise<Runner | null> {
	const { data: profile, error } = await supabase
		.from('profiles')
		.select(PROFILE_RUNNER_COLS)
		.eq('runner_id', runnerId)
		.eq('status', 'approved')
		.maybeSingle();

	if (error) {
		console.error('Error fetching runner:', error.message);
		return null;
	}

	return profile ? profileToRunner(profile) : null;
}

/** Fetch a name+avatar lookup for specific runner IDs.
 *  Use this instead of getRunners() when you only need display info for a known set. */
export async function getRunnerMapByIds(
	supabase: SupabaseClient,
	runnerIds: string[]
): Promise<Record<string, { runner_name: string; avatar?: string }>> {
	const map: Record<string, { runner_name: string; avatar?: string }> = {};
	if (runnerIds.length === 0) return map;

	const { data, error } = await supabase
		.from('profiles')
		.select('runner_id, display_name, avatar_url')
		.in('runner_id', runnerIds)
		.eq('status', 'approved')
		.limit(runnerIds.length);

	if (error) {
		console.error('Error fetching runner map:', error.message);
		return map;
	}

	for (const p of data || []) {
		map[p.runner_id] = {
			runner_name: p.display_name || p.runner_id,
			avatar: p.avatar_url || undefined
		};
	}
	return map;
}

// ─── Runs ───────────────────────────────────────────────────────────────────

// Public-facing run columns — excludes `id` (internal sequential integer)
const RUN_COLS = 'public_id, game_id, runner_id, category_tier, category_slug, category, standard_challenges, community_challenge, glitch_id, runner, character, difficulty, restrictions, restriction_ids, platform, time_primary, time_rta, timing_method_primary, time_secondary, timing_method_secondary, date_completed, video_url, video_host, video_id, run_time, additional_runners, submission_id, submitted_at, date_submitted, source, runner_notes, status, verified, verified_by, verified_at, verifier_notes, rules_version, created_at';

export async function getRuns(supabase: SupabaseClient): Promise<Run[]> {
	const { data, error } = await supabase
		.from('runs')
		.select(RUN_COLS)
		.eq('status', 'approved')
		.order('submitted_at', { ascending: false })
		.limit(5000);

	if (error) {
		console.error('Error fetching runs:', error.message);
		return [];
	}
	return data as Run[];
}

export async function getRunsForGame(supabase: SupabaseClient, gameId: string): Promise<Run[]> {
	const { data, error } = await supabase
		.from('runs')
		.select(RUN_COLS)
		.eq('game_id', gameId)
		.eq('status', 'approved')
		.order('submitted_at', { ascending: false })
		.limit(2000);

	if (error) {
		console.error('Error fetching runs for game:', error.message);
		return [];
	}
	return data as Run[];
}

export async function getRunsForRunner(supabase: SupabaseClient, runnerId: string): Promise<Run[]> {
	const { data, error } = await supabase
		.from('runs')
		.select(RUN_COLS)
		.eq('runner_id', runnerId)
		.eq('status', 'approved')
		.order('date_completed', { ascending: false })
		.limit(1000);

	if (error) {
		console.error('Error fetching runs for runner:', error.message);
		return [];
	}
	return data as Run[];
}

export async function getRunsForCategory(
	supabase: SupabaseClient,
	gameId: string,
	categorySlug: string
): Promise<Run[]> {
	const { data, error } = await supabase
		.from('runs')
		.select(RUN_COLS)
		.eq('game_id', gameId)
		.eq('category_slug', categorySlug)
		.eq('status', 'approved')
		.order('submitted_at', { ascending: false })
		.limit(2000);

	if (error) {
		console.error('Error fetching runs for category:', error.message);
		return [];
	}
	return data as Run[];
}

export async function getRunsForCategories(
	supabase: SupabaseClient,
	gameId: string,
	categorySlugs: string[]
): Promise<Run[]> {
	const { data, error } = await supabase
		.from('runs')
		.select(RUN_COLS)
		.eq('game_id', gameId)
		.in('category_slug', categorySlugs)
		.eq('status', 'approved')
		.order('submitted_at', { ascending: false })
		.limit(2000);

	if (error) {
		console.error('Error fetching runs for categories:', error.message);
		return [];
	}
	return data as Run[];
}

export async function getRecentRuns(supabase: SupabaseClient, limit = 10): Promise<Run[]> {
	const { data, error } = await supabase
		.from('runs')
		.select(RUN_COLS)
		.eq('status', 'approved')
		.order('submitted_at', { ascending: false })
		.limit(limit);

	if (error) {
		console.error('Error fetching recent runs:', error.message);
		return [];
	}
	return data as Run[];
}

/** Get run count for a game (avoids fetching all rows) */
export async function getRunCountForGame(supabase: SupabaseClient, gameId: string): Promise<number> {
	const { count, error } = await supabase
		.from('runs')
		.select('id', { count: 'exact', head: true })
		.eq('game_id', gameId)
		.eq('status', 'approved');

	if (error) {
		console.error('Error counting runs:', error.message);
		return 0;
	}
	return count ?? 0;
}

/** Get run count for a runner (avoids fetching all rows) */
export async function getRunCountForRunner(supabase: SupabaseClient, runnerId: string): Promise<number> {
	const { count, error } = await supabase
		.from('runs')
		.select('id', { count: 'exact', head: true })
		.eq('runner_id', runnerId)
		.eq('status', 'approved');

	if (error) {
		console.error('Error counting runs for runner:', error.message);
		return 0;
	}
	return count ?? 0;
}

/** Get run counts for ALL games efficiently.
 *  Tries the get_run_counts_by_game() RPC first (single grouped query in Postgres).
 *  Falls back to fetching game_id column if the RPC doesn't exist yet.
 *  See bottom of file for the SQL to create the RPC. */
export async function getRunCountsByGame(supabase: SupabaseClient): Promise<Map<string, number>> {
	const { data: rpcData, error: rpcError } = await supabase.rpc('get_run_counts_by_game');

	if (!rpcError && rpcData) {
		const counts = new Map<string, number>();
		for (const row of rpcData as { game_id: string; run_count: number }[]) {
			counts.set(row.game_id, Number(row.run_count));
		}
		return counts;
	}

	if (rpcError) {
		console.warn('get_run_counts_by_game RPC not available, falling back to select:', rpcError.message);
	}

	const { data, error } = await supabase
		.from('runs')
		.select('game_id')
		.eq('status', 'approved');

	if (error) {
		console.error('Error fetching run counts by game:', error.message);
		return new Map();
	}

	const counts = new Map<string, number>();
	for (const row of data || []) {
		counts.set(row.game_id, (counts.get(row.game_id) || 0) + 1);
	}
	return counts;
}

/** Get run counts for ALL runners efficiently.
 *  Tries the get_run_counts_by_runner() RPC first (single grouped query in Postgres).
 *  Falls back to fetching runner_id column if the RPC doesn't exist yet.
 */
export async function getRunCountsByRunner(supabase: SupabaseClient): Promise<Map<string, number>> {
	const { data: rpcData, error: rpcError } = await supabase.rpc('get_run_counts_by_runner');

	if (!rpcError && rpcData) {
		const counts = new Map<string, number>();
		for (const row of rpcData as { runner_id: string; run_count: number }[]) {
			counts.set(row.runner_id, Number(row.run_count));
		}
		return counts;
	}

	if (rpcError) {
		console.warn('get_run_counts_by_runner RPC not available, falling back to select:', rpcError.message);
	}

	const { data, error } = await supabase
		.from('runs')
		.select('runner_id')
		.eq('status', 'approved');

	if (error) {
		console.error('Error fetching run counts:', error.message);
		return new Map();
	}

	const counts = new Map<string, number>();
	for (const row of data || []) {
		counts.set(row.runner_id, (counts.get(row.runner_id) || 0) + 1);
	}
	return counts;
}

// ─── Achievements ───────────────────────────────────────────────────────────

export async function getAchievements(supabase: SupabaseClient): Promise<Achievement[]> {
	const { data, error } = await supabase
		.from('game_achievements')
		.select('*')
		.eq('status', 'approved')
		.limit(5000);

	if (error) {
		console.error('Error fetching achievements:', error.message);
		return [];
	}
	return data as Achievement[];
}

export async function getAchievementsForGame(supabase: SupabaseClient, gameId: string): Promise<Achievement[]> {
	const { data, error } = await supabase
		.from('game_achievements')
		.select('*')
		.eq('game_id', gameId)
		.eq('status', 'approved')
		.limit(1000);

	if (error) {
		console.error('Error fetching achievements for game:', error.message);
		return [];
	}
	return data as Achievement[];
}

export async function getAchievementsForRunner(supabase: SupabaseClient, runnerId: string): Promise<Achievement[]> {
	const { data, error } = await supabase
		.from('game_achievements')
		.select('*')
		.eq('runner_id', runnerId)
		.eq('status', 'approved')
		.limit(1000);

	if (error) {
		console.error('Error fetching achievements for runner:', error.message);
		return [];
	}
	return data as Achievement[];
}

// ─── Teams ──────────────────────────────────────────────────────────────────

export async function getTeams(supabase: SupabaseClient): Promise<Team[]> {
	const { data, error } = await supabase
		.from('teams')
		.select('*')
		.order('name')
		.limit(500);

	if (error) {
		console.error('Error fetching teams:', error.message);
		return [];
	}
	return data as Team[];
}

export async function getTeam(supabase: SupabaseClient, teamId: string): Promise<Team | null> {
	const { data, error } = await supabase
		.from('teams')
		.select('*')
		.eq('team_id', teamId)
		.single();

	if (error) {
		if (error.code === 'PGRST116') return null;
		console.error('Error fetching team:', error.message);
		return null;
	}
	return data as Team;
}

/** Fetch teams that contain a specific runner as a member.
 *  Uses Supabase JSONB containment to filter server-side. */
export async function getTeamsForMember(supabase: SupabaseClient, runnerId: string): Promise<Team[]> {
	const { data, error } = await supabase
		.from('teams')
		.select('*')
		.contains('members', [{ runner_id: runnerId }])
		.limit(50);

	if (error) {
		// Fallback: if containment query fails (e.g. members isn't indexable JSONB),
		// load all teams and filter in JS
		console.warn('getTeamsForMember containment failed, falling back:', error.message);
		const allTeams = await getTeams(supabase);
		return allTeams.filter(
			(t) => t.members?.some((m: any) => m.runner_id === runnerId)
		);
	}
	return (data || []) as Team[];
}

// ─── Aggregate Counts (efficient — no row fetching) ─────────────────────────

export async function getCounts(supabase: SupabaseClient) {
	const [games, runners, runs, achievements, teams] = await Promise.all([
		supabase.from('games').select('game_id', { count: 'exact', head: true }).in('status', ['Active', 'Community Review']),
		supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
		supabase.from('runs').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
		supabase.from('game_achievements').select('game_id', { count: 'exact', head: true }).eq('status', 'approved'),
		supabase.from('teams').select('team_id', { count: 'exact', head: true })
	]);

	return {
		gameCount: games.count ?? 0,
		runnerCount: runners.count ?? 0,
		runCount: runs.count ?? 0,
		achievementCount: achievements.count ?? 0,
		teamCount: teams.count ?? 0
	};
}

// ─── Site Settings (DB with YAML fallback) ──────────────────────────────────

import { getChallenges as getChallengesYaml, getGlossary as getGlossaryYaml } from '$lib/server/data';
import type { ChallengesConfig, GlossaryConfig } from '$lib/types';

/** Get challenges config — DB first, YAML fallback */
export async function getChallengesConfig(supabase: SupabaseClient): Promise<ChallengesConfig> {
	try {
		const { data } = await supabase
			.from('site_settings')
			.select('value')
			.eq('key', 'challenges_config')
			.maybeSingle();
		if (data?.value && typeof data.value === 'object') return data.value as ChallengesConfig;
	} catch { /* fall through to YAML */ }
	return getChallengesYaml();
}

/** Get glossary config — DB first, YAML fallback */
export async function getGlossaryConfig(supabase: SupabaseClient): Promise<GlossaryConfig> {
	try {
		const { data } = await supabase
			.from('site_settings')
			.select('value')
			.eq('key', 'glossary_config')
			.maybeSingle();
		if (data?.value && typeof data.value === 'object') return data.value as GlossaryConfig;
	} catch { /* fall through to YAML */ }
	return getGlossaryYaml();
}

// ─── Glossary Terms (for tooltip rendering — cached) ─────────────────────────

import type { GlossaryTerm } from '$lib/utils/markdown';

/** Module-level cache for glossary terms.
 *  Cloudflare Worker isolates keep module state between requests on the same
 *  instance, so this avoids hitting Supabase on every single page load.
 *  TTL: 5 minutes. */
let _glossaryCache: { terms: GlossaryTerm[]; expires: number } | null = null;
const GLOSSARY_TTL_MS = 5 * 60 * 1000;

/** Load all glossary terms for use with renderMarkdown(content, terms).
 *  Results are cached in-memory for 5 minutes to avoid querying on every request. */
export async function getGlossaryTerms(supabase: SupabaseClient): Promise<GlossaryTerm[]> {
	if (_glossaryCache && Date.now() < _glossaryCache.expires) {
		return _glossaryCache.terms;
	}

	try {
		const { data, error } = await supabase
			.from('glossary_terms')
			.select('slug, label, definition, aliases')
			.order('label');
		if (error) throw error;
		const terms = (data || []) as GlossaryTerm[];
		_glossaryCache = { terms, expires: Date.now() + GLOSSARY_TTL_MS };
		return terms;
	} catch {
		// On failure, return stale cache if available
		return _glossaryCache?.terms ?? [];
	}
}

// =============================================================================
// SQL for Supabase RPCs (run these in the Supabase SQL editor if not created yet)
// =============================================================================
//
// -- Run counts grouped by game (used by /games page)
// CREATE OR REPLACE FUNCTION get_run_counts_by_game()
// RETURNS TABLE(game_id text, run_count bigint) AS $$
//   SELECT game_id, COUNT(*) as run_count
//   FROM runs WHERE status = 'approved'
//   GROUP BY game_id;
// $$ LANGUAGE sql STABLE;
//
// -- Run counts grouped by runner (used by /runners page)
// CREATE OR REPLACE FUNCTION get_run_counts_by_runner()
// RETURNS TABLE(runner_id text, run_count bigint) AS $$
//   SELECT runner_id, COUNT(*) as run_count
//   FROM runs WHERE status = 'approved'
//   GROUP BY runner_id;
// $$ LANGUAGE sql STABLE;
