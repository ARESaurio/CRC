import { getRunsForCategory, getRunsForCategories } from '$lib/server/supabase';
import { findCategory } from '$lib/server/data';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	// Use game from the layout instead of re-fetching it
	const { game } = await parent();
	if (!game) throw error(404, 'Game not found');

	const category = findCategory(game, params.tier, params.category);
	if (!category) throw error(404, 'Category not found');

	// If this is a parent group, load runs for all its children
	const runs = category.isGroup && category.childSlugs?.length
		? await getRunsForCategories(locals.supabase, params.game_id, category.childSlugs)
		: await getRunsForCategory(locals.supabase, params.game_id, params.category);

	return { category, runs, tier: params.tier };
};
