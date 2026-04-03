<script lang="ts">
	import { session, isLoading } from '$stores/auth';
	import { debugHidesAuth } from '$stores/debug';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	$effect(() => {
		if ($debugHidesAuth) return;
		if (!$isLoading && !$session) {
			goto(`/sign-in?redirect=${encodeURIComponent($page.url.pathname)}`);
		}
	});
</script>

{#if $isLoading}
	<div class="page-width">
		<div class="auth-loading">
			<div class="auth-spinner"></div>
			<p class="muted">{m.auth_guard_loading()}</p>
		</div>
	</div>
{:else if $debugHidesAuth}
	<div class="page-width">
		<div class="auth-blocked">
			<span class="auth-blocked__icon"><Lock size={32} /></span>
			<h2>{m.auth_guard_required()}</h2>
			<p class="muted">{@html m.auth_guard_desc({ link_start: `<a href="${localizeHref('/sign-in')}">`, link_end: '</a>' })}</p>
			<p class="auth-blocked__hint">{@html m.auth_guard_hint({ bold_start: '<strong>', bold_end: '</strong>' })}</p>
		</div>
	</div>
{:else if $session}
	{@render children()}
{/if}

<style>
	.auth-loading {
		text-align: center;
		padding: 4rem 0;
	}
	.auth-spinner {
		width: 36px;
		height: 36px;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		margin: 0 auto 1rem;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	.auth-blocked {
		text-align: center;
		padding: 4rem 0;
	}
	.auth-blocked__icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.75rem;
		opacity: 0.5;
	}
	.auth-blocked h2 {
		margin: 0 0 0.5rem;
	}
	.auth-blocked :global(a) {
		color: var(--accent);
		text-decoration: underline;
	}
	.auth-blocked__hint {
		margin-top: 1rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		padding: 0.5rem 1rem;
		background: rgba(245, 158, 11, 0.08);
		border: 1px solid rgba(245, 158, 11, 0.2);
		border-radius: 6px;
		display: inline-block;
	}
</style>
