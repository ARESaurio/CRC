<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { session, isLoading } from '$stores/auth';
	import { debugHidesAuth } from '$stores/debug';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PUBLIC_SITE_URL } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let signingIn = $state(false);
	let errorMessage = $state('');

	// If already signed in (and not in debug non-user mode), redirect
	$effect(() => {
		if (!$isLoading && $session && !$debugHidesAuth) {
			goto(localizeHref('/profile'));
		}
	});

	// Show error from failed callback
	$effect(() => {
		const err = $page.url.searchParams.get('error');
		if (err === 'auth_failed') {
			errorMessage = m.signin_auth_failed();
		}
	});

	async function signInWith(provider: 'discord' | 'twitch') {
		signingIn = true;
		errorMessage = '';

		try {
			// Set redirect cookie via httpOnly server endpoint
			const rawRedirect = $page.url.searchParams.get('redirect') || '/';
			const postLoginRedirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';
			await fetch('/auth/set-redirect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ redirect: postLoginRedirect })
			});

			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: `${PUBLIC_SITE_URL}/auth/callback`
				}
			});
			if (error) throw error;
		} catch (err: any) {
			errorMessage = err?.message || m.signin_generic_error();
			signingIn = false;
		}
	}
</script>

<svelte:head><title>{m.signin_page_title()}</title></svelte:head>

<div class="page-width">
	<div class="sign-in-page">
		<div class="sign-in-card">
			<h2>{m.signin_title()}</h2>
			<p class="muted">{m.signin_description()}</p>
			<p class="first-time">{m.signin_first_time()}</p>

			{#if errorMessage}
				<div class="alert alert--error">{errorMessage}</div>
			{/if}

			<div class="sign-in-buttons">
				<button
					class="btn btn--discord"
					onclick={() => signInWith('discord')}
					disabled={signingIn}
				>
					{signingIn ? m.signin_redirecting() : m.signin_with_discord()}
				</button>
				<button
					class="btn btn--twitch"
					onclick={() => signInWith('twitch')}
					disabled={signingIn}
				>
					{signingIn ? m.signin_redirecting() : m.signin_with_twitch()}
				</button>
			</div>

			<div class="sign-in-footer">
				<p class="muted">{@html m.signin_agree({
					terms_link: `<a href="${localizeHref('/legal/terms')}">${m.footer_terms_of_service()}</a>`,
					privacy_link: `<a href="${localizeHref('/legal/privacy')}">${m.footer_privacy_policy()}</a>`
				})}</p>
			</div>
		</div>
	</div>
</div>

<style>
	.sign-in-page {
		display: flex;
		justify-content: center;
		padding: 3rem 0;
	}
	.sign-in-card {
		max-width: 420px;
		width: 100%;
		text-align: center;
		padding: 2.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
	}
	.sign-in-card h2 {
		margin: 0 0 0.5rem;
		font-size: 1.5rem;
	}
	.sign-in-card > .muted {
		margin-bottom: 0.5rem;
	}
	.first-time {
		font-size: 0.85rem;
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.25);
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1.5rem;
	}
	.sign-in-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, opacity 0.15s;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn--discord {
		background: #5865F2;
		color: #fff;
	}
	.btn--discord:hover:not(:disabled) { background: #4752C4; }
	.btn--twitch {
		background: #9146FF;
		color: #fff;
	}
	.btn--twitch:hover:not(:disabled) { background: #772CE8; }
	.sign-in-footer {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.sign-in-footer .muted { font-size: 0.8rem; }
	.sign-in-footer :global(a) { color: var(--accent); text-decoration: none; }
	.sign-in-footer :global(a:hover) { text-decoration: underline; }
	.alert--error {
		padding: 0.75rem 1rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
		text-align: left;
	}
</style>
