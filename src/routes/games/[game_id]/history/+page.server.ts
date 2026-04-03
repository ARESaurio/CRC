import type { PageServerLoad } from './$types';
import { getPosts } from '$lib/server/data';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { game } = await parent();

	// Fetch game_history (action log) and rules_changelog (diffs) in parallel
	const [historyRes, changelogRes] = await Promise.all([
		locals.supabase
			.from('game_history')
			.select('action, created_at, target, note, actor_name')
			.eq('game_id', game.game_id)
			.order('created_at', { ascending: false })
			.limit(200),
		locals.supabase
			.from('rules_changelog')
			.select('id, rules_version, changed_by, change_summary, sections_changed, old_rules, new_rules, created_at')
			.eq('game_id', game.game_id)
			.order('rules_version', { ascending: false })
			.limit(100),
	]);

	const history = (historyRes.error || !historyRes.data) ? [] : historyRes.data.map((row: any) => ({
		action: row.action,
		date: row.created_at,
		target: row.target || undefined,
		note: row.note || undefined,
		by: row.actor_name || undefined,
	}));

	const changelogRaw = (changelogRes.error || !changelogRes.data) ? [] : changelogRes.data;

	// Resolve changed_by UUIDs to runner names
	const editorIds = [...new Set(changelogRaw.map((c: any) => c.changed_by).filter(Boolean))];
	let editorMap: Record<string, string> = {};
	if (editorIds.length > 0) {
		const { data: profiles } = await locals.supabase
			.from('profiles')
			.select('user_id, runner_id, display_name')
			.in('user_id', editorIds);
		for (const p of (profiles || [])) {
			editorMap[p.user_id] = p.runner_id || p.display_name || 'Staff';
		}
	}

	const changelog = changelogRaw.map((c: any) => ({
		id: c.id,
		version: c.rules_version,
		summary: c.change_summary,
		sections: c.sections_changed || [],
		oldRules: c.old_rules || {},
		newRules: c.new_rules || {},
		date: c.created_at,
		editor: editorMap[c.changed_by] || 'Staff',
	}));

	// News posts related to this game
	const allPosts = getPosts();
	const gameNews = allPosts
		.filter((p) => p.game_id === game.game_id)
		.map((p) => ({
			slug: p.slug,
			title: p.title,
			date: p.date instanceof Date ? p.date.toISOString() : p.date,
			author: p.author || null,
			categories: p.categories || [],
		}));

	return { history, changelog, gameNews };
};
