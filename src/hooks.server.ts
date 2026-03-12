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
//
// SECURITY: Protected routes (profile/*, messages/*, admin/*, submit/*, support/*)
// use getUser() which makes a server round-trip to verify the token hasn't been
// revoked. Public routes use getSession() (JWT decode only) for performance.
// =============================================================================

import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';

/** Routes where we verify the token server-side via getUser() instead of
 *  just decoding the JWT. Covers any path where a user can view private
 *  data or perform mutations. */
const PROTECTED_PREFIXES = ['/profile', '/messages', '/admin', '/submit', '/support'];

function isProtectedRoute(pathname: string): boolean {
	return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
	// ─── Skip URL inspection during prerender ────────────────────
	const isPrerender = event.isSubRequest ||
		(!event.cookies.getAll().length && !event.request.headers.get('cookie'));

	// ─── Drop stray auth codes ───────────────────────────────────
	// If an OAuth ?code= lands on the wrong page, strip it and redirect
	// to sign-in rather than forwarding to callback. The code is a
	// one-time PKCE token tied to the original redirect_uri so it
	// wouldn't exchange successfully from a different path anyway.
	if (
		!isPrerender &&
		event.url.searchParams.has('code') &&
		!event.url.pathname.startsWith('/auth/callback')
	) {
		redirect(303, '/sign-in');
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
	const hasCookies = event.cookies.getAll().length > 0 ||
		!!event.request.headers.get('cookie');

	if (hasCookies && !event.isSubRequest) {
		if (isProtectedRoute(event.url.pathname)) {
			// SECURITY: For protected routes, verify the token with Supabase
			// (server round-trip). A revoked or tampered JWT will be rejected.
			const { data: { user }, error } = await event.locals.supabase.auth.getUser();
			if (error || !user) {
				event.locals.session = null;
			} else {
				// getUser() confirms validity; now get the full session object
				// (which includes access_token needed by client-side code)
				const { data: { session } } = await event.locals.supabase.auth.getSession();
				event.locals.session = session;
			}
		} else {
			// Public routes: JWT decode only (no round-trip, better performance)
			const {
				data: { session }
			} = await event.locals.supabase.auth.getSession();
			event.locals.session = session;
		}
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
