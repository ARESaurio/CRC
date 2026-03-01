<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let status = $state<'loading' | 'success' | 'error'>('loading');
	let provider = $state('account');
	let errorMessage = $state('');

	onMount(async () => {
		try {
			// Get provider from sessionStorage
			if (browser) {
				provider = sessionStorage.getItem('crc_link_provider') || 'account';
				sessionStorage.removeItem('crc_link_provider');
				sessionStorage.removeItem('crc_linking_account');
			}

			// Small delay to ensure session is processed
			await new Promise(r => setTimeout(r, 500));

			const { data: { session } } = await supabase.auth.getSession();

			if (session) {
				status = 'success';
				// Store for settings page to show a confirmation
				if (browser) sessionStorage.setItem('crc_just_linked', provider);
				// Redirect after brief success display
				setTimeout(() => goto('/profile/settings'), 1500);
			} else {
				status = 'error';
				errorMessage = 'Account linking failed. Please try again.';
			}
		} catch (err: any) {
			status = 'error';
			errorMessage = err?.message || 'An unexpected error occurred.';
		}
	});
</script>

<svelte:head><title>Linking Account... | CRC</title></svelte:head>

<div class="page-width">
	<div class="callback">
		<div class="callback__content">
			{#if status === 'loading'}
				<div class="callback__spinner"><div class="spinner spinner--large"></div></div>
				<h1>Linking account...</h1>
				<p class="muted">Please wait while we link your account.</p>
			{:else if status === 'success'}
				<div class="callback__icon">✓</div>
				<h1 class="callback__success">Account Linked!</h1>
				<p class="muted">Your {provider} account has been linked successfully.</p>
				<p class="muted mt-1">Redirecting to settings...</p>
			{:else}
				<h1>Linking Failed</h1>
				<div class="callback__error">{errorMessage}</div>
				<div class="callback__actions">
					<a href="/profile/settings" class="btn btn--primary">Back to Settings</a>
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
	@keyframes spin { to { transform: rotate(360deg); } }
	h1 { margin-bottom: 0.5rem; }
	.callback__icon { font-size: 3rem; color: #28a745; margin-bottom: 1rem; }
	.callback__success { color: #28a745; }
	.callback__error { color: var(--danger, #dc3545); background: rgba(220, 53, 69, 0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
	.callback__actions { margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: center; }
	.mt-1 { margin-top: 0.5rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
</style>
