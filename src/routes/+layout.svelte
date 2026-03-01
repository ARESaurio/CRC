<script lang="ts">
	import '../styles/main.scss';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { hydrateSession, listenForAuthChanges, session } from '$stores/auth';
	import { loadCustomThemeFromStorage, applyCustomTheme } from '$stores/theme';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import Header from '$components/layout/Header.svelte';
	import Footer from '$components/layout/Footer.svelte';
	import BackToTop from '$components/BackToTop.svelte';
	import CookieConsent from '$components/CookieConsent.svelte';
	import DebugBar from '$components/DebugBar.svelte';
	import Toast from '$components/Toast.svelte';

	let { data, children } = $props();

	// Hydrate the client auth store from the server-side session
	// (which comes from httpOnly cookies via hooks.server.ts)
	hydrateSession(data.session);

	/** Try to load custom theme from Supabase and apply it (overwrites localStorage) */
	async function syncThemeFromSupabase() {
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) return;

			const res = await fetch(
				`${PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${sess.user.id}&select=theme_settings`,
				{
					headers: {
						'apikey': PUBLIC_SUPABASE_ANON_KEY,
						'Authorization': `Bearer ${sess.access_token}`
					}
				}
			);
			if (!res.ok) return;
			const rows = await res.json();
			if (rows.length > 0 && rows[0].theme_settings) {
				const t = rows[0].theme_settings;
				applyCustomTheme(t);
				// Update localStorage so next refresh is instant
				localStorage.setItem('crc-custom-theme', JSON.stringify(t));
			}
		} catch {
			// Supabase sync failed — localStorage theme is already applied, that's fine
		}
	}

	onMount(() => {
		// 1. Apply custom theme from localStorage (inline script in app.html
		//    already did this before paint, but this ensures the store is in sync)
		loadCustomThemeFromStorage();

		// 2. If user is authenticated, sync from Supabase (overrides localStorage if newer)
		const unsub = session.subscribe((sess) => {
			if (sess) syncThemeFromSupabase();
		});

		// 3. Listen for client-side auth state changes
		const unsubAuth = listenForAuthChanges(supabase);

		return () => {
			unsub();
			if (typeof unsubAuth === 'function') unsubAuth();
		};
	});
</script>

<svelte:head>
	<meta name="description" content="Tracking challenge runs, deathless runs, and no-hit achievements across games" />
</svelte:head>

<div class="site-wrapper">
	<DebugBar />
	<div class="dev-banner">
		<p>🚧 <strong>CRC is still in development.</strong> Feel free to explore! Check out the <a href="/games">Games</a> pages, <a href="/sign-in">sign up</a> to create your profile, or <a href="https://discord.gg/HHwCt5zENp" target="_blank" rel="noopener">join our Discord</a>.</p>
	</div>
	<Header />
	<main>
		{@render children()}
	</main>
	<Footer />
	<BackToTop />
	<CookieConsent />
	<Toast />
</div>

<style>
	.dev-banner {
		background: rgba(245, 158, 11, 0.15);
		border-bottom: 1px solid rgba(245, 158, 11, 0.3);
		padding: 0.5rem 1rem;
		text-align: center;
		font-size: 0.85rem;
		color: #fbbf24;
	}
	.dev-banner p { margin: 0; }
	.dev-banner a { color: #fbbf24; font-weight: 600; text-decoration: underline; }
	.dev-banner a:hover { color: #fff; }
	.site-wrapper {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	main {
		flex: 1;
		padding: 2rem 0;
	}
</style>
