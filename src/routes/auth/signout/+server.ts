// =============================================================================
// Sign-Out Server Endpoint
// =============================================================================
// Uses @supabase/ssr server client to properly clear all auth cookies.
// The old approach deleted hardcoded cookie names (sb-access-token,
// sb-refresh-token). With @supabase/ssr, cookie names are auto-generated
// and may be chunked, so we let the library handle cleanup.
// =============================================================================

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServerClient } from '@supabase/ssr';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	// CSRF: Reject cross-origin requests
	const origin = request.headers.get('Origin');
	if (origin && origin !== url.origin) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				for (const { name, value, options } of cookiesToSet) {
					cookies.set(name, value, {
						path: '/',
						secure: true,
						sameSite: 'lax',
						...options
					});
				}
			}
		}
	});

	await supabase.auth.signOut();

	// Also clear the old cookie names in case any linger from before
	cookies.delete('sb-access-token', { path: '/' });
	cookies.delete('sb-refresh-token', { path: '/' });

	return json({ ok: true });
};
