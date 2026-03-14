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
		// NOTE: When SvelteKit handles CSP, remove the Content-Security-Policy
		// line from _headers to avoid conflicts (SvelteKit sets the header
		// on SSR responses; _headers applies to all responses including static).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com', 'sha256-YoiQItOfTglMSQOXGDvfciKRxsG8+mEOtQSS6VFIMtQ='],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'https:'],
				'font-src': ['self'],
				'connect-src': ['self', 'https://*.supabase.co', 'https://crc-run-submissions.280sauce.workers.dev', 'https://challenges.cloudflare.com', 'https://noembed.com', 'https://cloudflareinsights.com'],
				'frame-src': ['https://challenges.cloudflare.com', 'https://www.youtube-nocookie.com', 'https://player.twitch.tv'],
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
