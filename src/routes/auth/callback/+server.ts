// =============================================================================
// Auth Callback — Server-Side Code Exchange
// =============================================================================
// This GET handler replaces the old client-side +page.svelte approach.
//
// Flow:
// 1. User signs in → redirected to Discord/Twitch → back to Supabase
// 2. Supabase redirects here with ?code=xxx
// 3. This handler creates a server Supabase client with cookie access
// 4. exchangeCodeForSession reads the PKCE verifier from cookies,
//    sends both to Supabase, and receives session tokens
// 5. Session tokens are written to cookies via the setAll adapter
// 6. User is redirected to their intended destination
//
// Why server-side? The PKCE code verifier is stored in a cookie by
// createBrowserClient. A server handler can read that cookie directly.
// The old client-side approach lost the verifier because persistSession
// was set to false.
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
			redirect(303, '/sign-in?error=auth_failed');
		}
	}

	// ─── Post-login redirect ─────────────────────────────────────
	// The sign-in page sets a cookie with the intended destination.
	const next = cookies.get('crc_auth_redirect') || '/';
	cookies.delete('crc_auth_redirect', { path: '/' });

	// Security: only allow relative paths to prevent open redirect
	const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/';

	// Check if user has a profile — if not, send them to create one
	if (code) {
		const profileCheck = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			cookies: {
				getAll: () => cookies.getAll(),
				setAll: () => {} // read-only for this check
			}
		});

		const { data: { user } } = await profileCheck.auth.getUser();
		if (user) {
			// Check runner_profiles (approved users)
			const { data: profile } = await profileCheck
				.from('runner_profiles')
				.select('runner_id')
				.eq('user_id', user.id)
				.maybeSingle();

			if (!profile) {
				// Check pending_profiles for profile completion
				const { data: pending } = await profileCheck
					.from('pending_profiles')
					.select('has_profile')
					.eq('user_id', user.id)
					.maybeSingle();

				if (!pending || !pending.has_profile) {
					// No profile or stub only — send to profile creation
					redirect(303, '/profile/create');
				}
			}
		}
	}

	redirect(303, safePath);
};
