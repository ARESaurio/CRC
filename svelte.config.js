import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Cloudflare Pages options
			routes: {
				include: ['/*'],
				exclude: ['<all>']
			}
		}),

		alias: {
			$data: 'src/data',
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$types: 'src/lib/types'
		},

		paths: {
			base: ''
		},

		// CSP: SvelteKit generates per-request nonces for inline scripts,
		// eliminating the need for 'unsafe-inline' in script-src.
		//
		// This is the SINGLE SOURCE OF TRUTH for CSP. Do NOT set CSP in:
		//   - _headers (already excluded)
		//   - Cloudflare dashboard (response header transform rules, etc.)
		// Duplicate static CSP headers conflict with SvelteKit's nonce-based
		// policy and cause scripts to be blocked.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],

				'script-src': [
					'self',
					'https://challenges.cloudflare.com',       // Turnstile CAPTCHA
					'https://static.cloudflareinsights.com',   // CF Web Analytics beacon
					'sha256-YoiQItOfTglMSQOXGDvfciKRxsG8+mEOtQSS6VFIMtQ=' // inline theme script in app.html
				],

				'style-src': ['self', 'unsafe-inline'],

				// 'https:' covers all HTTPS image sources including:
				// cdn.discordapp.com (Discord avatars), static-cdn.jtvnw.net (Twitch avatars),
				// img.youtube.com (video thumbnails), flagcdn.com (country flags),
				// *.supabase.co (storage: game covers, banners, news images)
				'img-src': ['self', 'data:', 'blob:', 'https:'],

				'font-src': ['self'],

				'connect-src': [
					'self',
					'https://*.supabase.co',                   // Supabase REST API + storage
					'wss://*.supabase.co',                     // Supabase Realtime (WebSocket)
					'https://crc-api.280sauce.workers.dev',    // Cloudflare Worker (PUBLIC_WORKER_URL)
					'https://challenges.cloudflare.com',       // Turnstile verification
					'https://cloudflareinsights.com',          // CF Analytics beacon telemetry
					'https://noembed.com'                      // Video URL metadata lookup
				],

				'frame-src': [
					'https://challenges.cloudflare.com',       // Turnstile iframe
					'https://www.youtube-nocookie.com',        // YouTube embeds
					'https://player.twitch.tv'                 // Twitch embeds
				],

				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
