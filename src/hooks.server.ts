// =============================================================================
// Server Hooks — Auth Middleware
// =============================================================================
// Uses @supabase/ssr to create a server-side Supabase client that reads/writes
// auth tokens via cookies. Runs on every request.
//
// Cookie flow:
// 1. createBrowserClient (browser) stores PKCE verifier in a cookie
// 2. /auth/callback (server) exchanges code, sets session cookies
// 3. This hook reads session cookies on every subsequent request
// =============================================================================

import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
	// ─── Safety net: redirect stray auth codes to callback ───────
	// If Supabase redirects the ?code= to the wrong path (e.g. homepage),
	// catch it here and forward to the proper callback handler.
	if (
		event.url.searchParams.has('code') &&
		!event.url.pathname.startsWith('/auth/callback')
	) {
		const code = event.url.searchParams.get('code');
		redirect(303, `/auth/callback?code=${code}`);
	}

	// ─── Create Supabase server client with cookie adapter ───────
	// IMPORTANT: Always create the client, even when no cookies exist.
	// Server load functions (homepage, games, runners, etc.) need it
	// to query public data for unauthenticated visitors.
	event.locals.supabase = createServerClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => {
					return event.cookies.getAll();
				},
				setAll: (cookiesToSet) => {
					for (const { name, value, options } of cookiesToSet) {
						event.cookies.set(name, value, {
							path: '/',
							secure: true,
							sameSite: 'lax',
							...options
						});
					}
				}
			}
		}
	);

	// ─── Restore session from cookies ────────────────────────────
	// For unauthenticated visitors (no cookies), getSession() safely
	// returns null without errors. For authenticated users, it validates
	// the access token and refreshes if needed.
	const hasCookies = event.cookies.getAll().length > 0 ||
		!!event.request.headers.get('cookie');

	if (hasCookies && !event.isSubRequest) {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		event.locals.session = session;
	} else {
		event.locals.session = null;
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			// Required for Supabase client to work properly
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
