// =============================================================================
// Auth Callback — Server-Side Code Exchange
// =============================================================================
// Handles both normal (full-page redirect) and popup OAuth flows.
//
// Normal flow: exchanges code → redirects to intended destination
// Popup flow:  exchanges code → renders HTML that postMessages the opener
//              and closes itself. The opener (parent page) refreshes session.
//
// The popup flag is set via a ?popup=1 query param on the callback URL.
// =============================================================================

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServerClient } from '@supabase/ssr';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const isPopup = url.searchParams.get('popup') === '1';
	let authError = false;
	let needsProfile = false;

	if (code) {
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

		const { error } = await supabase.auth.exchangeCodeForSession(code);

		if (error) {
			console.error('Auth callback error:', error.message);
			authError = true;
		} else {
			// Check if user needs to create a profile
			const profileCheck = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				cookies: {
					getAll: () => cookies.getAll(),
					setAll: () => {} // read-only for this check
				}
			});

			const { data: { user } } = await profileCheck.auth.getUser();
			if (user) {
				const { data: profile } = await profileCheck
					.from('profiles')
					.select('runner_id')
					.eq('user_id', user.id)
					.maybeSingle();

				if (!profile) {
					const { data: pending } = await profileCheck
						.from('pending_profiles')
						.select('has_profile')
						.eq('user_id', user.id)
						.maybeSingle();

					if (!pending || !pending.has_profile) {
						needsProfile = true;
					}
				}
			}
		}
	} else {
		authError = true;
	}

	// ─── Popup flow: render HTML that notifies opener ─────────────
	if (isPopup) {
		const result = authError
			? '{"ok":false,"error":"auth_failed"}'
			: needsProfile
				? '{"ok":true,"needsProfile":true}'
				: '{"ok":true}';

		const html = `<!DOCTYPE html>
<html><head><title>Signing in...</title></head>
<body>
<p>Signing in... this window will close automatically.</p>
<script>
	if (window.opener) {
		window.opener.postMessage(JSON.parse('${result}'), window.location.origin);
	}
	window.close();
</script>
</body></html>`;

		return new Response(html, {
			status: 200,
			headers: { 'Content-Type': 'text/html' }
		});
	}

	// ─── Normal flow: redirect ───────────────────────────────────
	if (authError) {
		redirect(303, '/sign-in?error=auth_failed');
	}

	if (needsProfile) {
		redirect(303, '/profile/create');
	}

	const next = cookies.get('crc_auth_redirect') || '/';
	cookies.delete('crc_auth_redirect', { path: '/' });
	const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/';

	redirect(303, safePath);
};
