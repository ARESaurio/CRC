import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { staffRole } = await parent();

	// Admin or super_admin only
	if (staffRole !== 'admin' && staffRole !== 'super_admin') {
		throw redirect(302, '/admin');
	}

	const { data: terms } = await locals.supabase
		.from('glossary_terms')
		.select('id, slug, label, definition, aliases, created_at, updated_at')
		.order('label');

	return {
		terms: terms || []
	};
};
