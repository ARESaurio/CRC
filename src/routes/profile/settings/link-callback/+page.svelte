<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let status = $state<'loading' | 'success' | 'error'>('loading');
	let provider = $state('account');
	let errorMessage = $state('');

	onMount(async () => {
		try {
			if (browser) {
				provider = sessionStorage.getItem('crc_link_provider') || 'account';
				sessionStorage.removeItem('crc_link_provider');
				sessionStorage.removeItem('crc_linking_account');
			}

			await new Promise(r => setTimeout(r, 500));

			const { data: { session } } = await supabase.auth.getSession();

			if (session) {
				status = 'success';
				if (browser) sessionStorage.setItem('crc_just_linked', provider);
				setTimeout(() => goto(localizeHref('/profile/settings')), 1500);
			} else {
				status = 'error';
				errorMessage = m.link_callback_error_default();
			}
		} catch (err: any) {
			status = 'error';
			errorMessage = err?.message || m.link_callback_error_generic();
		}
	});
</script>

<svelte:head><title>{m.link_callback_title()}</title></svelte:head>

<div class="page-width">
	<div class="callback">
		<div class="callback__content">
			{#if status === 'loading'}
				<div class="callback__spinner"><div class="spinner spinner--large"></div></div>
				<h1>{m.link_callback_linking()}</h1>
				<p class="muted">{m.link_callback_please_wait()}</p>
			{:else if status === 'success'}
				<div class="callback__icon">✓</div>
				<h1 class="callback__success">{m.link_callback_success()}</h1>
				<p class="muted">{m.link_callback_success_desc({ provider })}</p>
				<p class="muted mt-1">{m.link_callback_redirecting()}</p>
			{:else}
				<h1>{m.link_callback_failed()}</h1>
				<div class="callback__error">{errorMessage}</div>
				<div class="callback__actions">
					<a href={localizeHref('/profile/settings')} class="btn btn--primary">{m.link_callback_back()}</a>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.callback { display: flex; align-items: center; justify-content: center; min-height: 60vh; text-align: center; }
	.callback__content { max-width: 400px; padding: 2rem; }
	.callback__spinner { margin-bottom: 1.5rem; }
	.spinner--large { width: 48px; height: 48px; border: 4px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto; animation: spin 0.8s linear infinite; }
	h1 { margin-bottom: 0.5rem; }
	.callback__icon { font-size: 3rem; color: #28a745; margin-bottom: 1rem; }
	.callback__success { color: #28a745; }
	.callback__error { color: var(--danger, #dc3545); background: rgba(220, 53, 69, 0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
	.callback__actions { margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center; }
	.mt-1 { margin-top: 0.5rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
</style>
