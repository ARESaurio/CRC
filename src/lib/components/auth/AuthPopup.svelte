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

	Migrated to bits-ui Dialog for accessible focus trapping and keyboard handling.
-->
<script lang="ts">
	import { X } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { PUBLIC_SITE_URL } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as Dialog from '$components/ui/dialog';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let signingIn = $state(false);
	let errorMessage = $state('');
	let popupWindow: Window | null = null;
	let popupCheckInterval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		const err = $page.url.searchParams.get('error');
		if (err === 'auth_failed') {
			errorMessage = m.signin_auth_failed();
		}
	});

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

		window.removeEventListener('message', handleMessage);
		if (popupCheckInterval) {
			clearInterval(popupCheckInterval);
			popupCheckInterval = null;
		}

		if (data.ok) {
			if (data.needsProfile) {
				goto(localizeHref('/profile/create'));
			} else {
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
			const currentPath = $page.url.pathname;
			await fetch('/auth/set-redirect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ redirect: currentPath })
			});

			const { data, error } = await supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: `${PUBLIC_SITE_URL}/auth/callback?popup=1`,
					skipBrowserRedirect: true
				}
			});

			if (error || !data?.url) throw error || new Error('No URL returned');

			popupWindow = openCenteredPopup(data.url, 'crc-auth', 500, 700);

			if (!popupWindow) {
				window.location.href = data.url;
				return;
			}

			window.addEventListener('message', handleMessage);

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

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="auth-popup">
			<Dialog.Close aria-label="Close"><X size={14} /></Dialog.Close>

			<Dialog.Title class="auth-popup__title">{m.signin_title()}</Dialog.Title>
			<Dialog.Description>{m.signin_description()}</Dialog.Description>

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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.auth-popup) {
		text-align: center;
		padding: 2.5rem;
		max-width: 420px;
	}
	:global(.auth-popup__title) {
		font-size: 1.5rem;
		margin: 0 0 0.5rem;
	}
	.first-time {
		font-size: 0.85rem;
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.25);
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		margin: 1rem 0 1.5rem;
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
	.btn:disabled { opacity: 0.6; cursor: not-allowed; }
	.btn--discord { background: #5865F2; color: #fff; }
	.btn--discord:hover:not(:disabled) { background: #4752C4; }
	.btn--twitch { background: #9146FF; color: #fff; }
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
