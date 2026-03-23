<!--
	AuthPopup.svelte — Opens OAuth sign-in in a popup window.

	Flow:
	1. User clicks a provider button
	2. We set the redirect cookie via the httpOnly server endpoint
	3. We call supabase.auth.signInWithOAuth with skipBrowserRedirect: true
	4. We open the returned URL in a centered popup
	5. OAuth provider redirects back to /auth/callback?popup=1
	6. Callback exchanges the code, sets session cookies, then postMessages the result
	7. This component receives the message, reloads the page to pick up the new session

	If the popup is blocked, we fall back to full-page redirect (normal flow).
-->
<script lang="ts">
	import { X } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { PUBLIC_SITE_URL } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let { onClose }: { onClose?: () => void } = $props();

	let signingIn = $state(false);
	let errorMessage = $state('');
	let popupWindow: Window | null = null;
	let popupCheckInterval: ReturnType<typeof setInterval> | null = null;

	// Show error from URL if present
	$effect(() => {
		const err = $page.url.searchParams.get('error');
		if (err === 'auth_failed') {
			errorMessage = m.signin_auth_failed();
		}
	});

	// Clean up on unmount
	$effect(() => {
		return () => {
			if (popupCheckInterval) clearInterval(popupCheckInterval);
		};
	});

	function openCenteredPopup(url: string, name: string, w: number, h: number): Window | null {
		const left = window.screenX + (window.outerWidth - w) / 2;
		const top = window.screenY + (window.outerHeight - h) / 2;
		return window.open(
			url, name,
			`width=${w},height=${h},left=${left},top=${top},popup=1,noopener=0`
		);
	}

	function handleMessage(event: MessageEvent) {
		if (event.origin !== window.location.origin) return;
		const data = event.data;
		if (!data || typeof data !== 'object' || !('ok' in data)) return;

		// Clean up
		window.removeEventListener('message', handleMessage);
		if (popupCheckInterval) {
			clearInterval(popupCheckInterval);
			popupCheckInterval = null;
		}

		if (data.ok) {
			if (data.needsProfile) {
				goto(localizeHref('/profile/create'));
			} else {
				// Reload to pick up the new session cookies
				window.location.reload();
			}
		} else {
			errorMessage = m.signin_auth_failed();
			signingIn = false;
		}
	}

	async function signInWith(provider: 'discord' | 'twitch') {
		signingIn = true;
		errorMessage = '';

		try {
			// 1. Set redirect cookie via httpOnly server endpoint
			const currentPath = $page.url.pathname;
			await fetch('/auth/set-redirect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ redirect: currentPath })
			});

			// 2. Get the OAuth URL without navigating
			const { data, error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: `${PUBLIC_SITE_URL}/auth/callback?popup=1`,
					skipBrowserRedirect: true
				}
			});

			if (error || !data?.url) throw error || new Error('No URL returned');

			// 3. Open popup
			popupWindow = openCenteredPopup(data.url, 'crc-auth', 500, 700);

			if (!popupWindow) {
				// Popup blocked — fall back to full-page redirect
				window.location.href = data.url;
				return;
			}

			// 4. Listen for the callback message
			window.addEventListener('message', handleMessage);

			// 5. Poll for popup closure (user closed it manually)
			popupCheckInterval = setInterval(() => {
				if (popupWindow?.closed) {
					if (popupCheckInterval) clearInterval(popupCheckInterval);
					popupCheckInterval = null;
					window.removeEventListener('message', handleMessage);
					signingIn = false;
				}
			}, 500);

		} catch (err: any) {
			errorMessage = err?.message || m.signin_generic_error();
			signingIn = false;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="auth-backdrop" onclick={onClose}>
	<div class="auth-popup" onclick={(e) => e.stopPropagation()}>
		<button type="button" class="auth-popup__close" onclick={onClose} aria-label="Close"><X size={14} /></button>

		<h2>{m.signin_title()}</h2>
		<p class="muted">{m.signin_description()}</p>
		<p class="first-time">{m.signin_first_time()}</p>

		{#if errorMessage}
			<div class="alert alert--error">{errorMessage}</div>
		{/if}

		<div class="auth-buttons">
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

		<div class="auth-footer">
			<p class="muted">{@html m.signin_agree({
				terms_link: `<a href="${localizeHref('/legal/terms')}">${m.footer_terms_of_service()}</a>`,
				privacy_link: `<a href="${localizeHref('/legal/privacy')}">${m.footer_privacy_policy()}</a>`
			})}</p>
		</div>
	</div>
</div>

<style>
	.auth-backdrop {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.15s ease-out;
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	.auth-popup {
		position: relative;
		max-width: 420px;
		width: calc(100% - 2rem);
		text-align: center;
		padding: 2.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		animation: popIn 0.2s ease-out;
	}
	@keyframes popIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
	.auth-popup__close {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		background: none;
		border: none;
		font-size: 1.25rem;
		color: var(--muted);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
	}
	.auth-popup__close:hover { color: var(--fg); }
	.auth-popup h2 {
		margin: 0 0 0.5rem;
		font-size: 1.5rem;
	}
	.auth-popup > .muted {
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
	.auth-buttons {
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
	.auth-footer {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.auth-footer .muted { font-size: 0.8rem; }
	:global(.auth-footer a) { color: var(--accent); text-decoration: none; }
	:global(.auth-footer a:hover) { text-decoration: underline; }
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
