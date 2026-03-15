// =============================================================================
// Auth Redirect Cookie — httpOnly Server Endpoint
// =============================================================================
// Sets the post-login redirect path as an httpOnly cookie. This replaces the
// client-side document.cookie approach which couldn't set httpOnly.
//
// Called by the sign-in page / auth popup before initiating OAuth.
// =============================================================================

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	// CSRF: Reject cross-origin requests
	const origin = request.headers.get('Origin');
	if (origin && origin !== url.origin) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	let redirectPath = '/';

	try {
		const body = await request.json();
		const raw = body?.redirect || '/';
		// Security: only allow relative paths to prevent open redirect
		redirectPath = (raw.startsWith('/') && !raw.startsWith('//')) ? raw : '/';
	} catch {
		// If JSON parsing fails, default to '/'
	}

	cookies.set('crc_auth_redirect', redirectPath, {
		path: '/',
		maxAge: 300,
		sameSite: 'lax',
		secure: true,
		httpOnly: true
	});

	return json({ ok: true });
};
