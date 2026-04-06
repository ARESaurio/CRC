<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { user, session } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_SITE_URL, PUBLIC_WORKER_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { getAccessToken } from '$lib/admin';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { formatDate } from '$lib/utils';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';

	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	let deleting = $state(false);
	let deleteError = $state('');
	let exporting = $state(false);
	let exportMessage = $state('');

	// Turnstile for account deletion
	let deleteTurnstileToken = $state('');
	let deleteTurnstileWidgetId = $state<string | null>(null);

	// Linked accounts
	interface LinkedAccount {
		id: string;
		provider: string;
		provider_username: string;
		provider_avatar_url: string;
		provider_email: string;
		linked_at: string;
	}
	let linkedAccounts = $state<LinkedAccount[]>([]);
	let linkedLoading = $state(true);
	let linkedMessage = $state('');
	let removingId = $state<string | null>(null);
	let justLinked = $state('');
	let linkingProvider = $state<string | null>(null);

	// Forum signature
	let signature = $state('');
	let signatureOriginal = $state('');
	let signatureSaving = $state(false);
	let signatureMessage = $state('');

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => Promise<void>) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => Promise<void>) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	async function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) await confirmCallback();
		confirmCallback = null;
	}

	// Providers the user can link (exclude ones already connected)
	const ALL_PROVIDERS = ['discord', 'twitch'] as const;
	let availableProviders = $derived(
		ALL_PROVIDERS.filter(p => !linkedAccounts.some(a => a.provider.toLowerCase() === p))
	);

	onMount(async () => {
		if (browser) {
			justLinked = sessionStorage.getItem('crc_just_linked') || '';
			if (justLinked) sessionStorage.removeItem('crc_just_linked');
		}
		// Wait for auth session before querying
		const { data: { session: sess } } = await supabase.auth.getSession();
		if (sess?.user) {
			await syncLinkedAccounts(sess.user.id);
			await loadLinkedAccounts(sess.user.id);

			// Load signature
			const { data: profile } = await supabase.from('profiles').select('signature').eq('user_id', sess.user.id).maybeSingle();
			if (profile?.signature) {
				signature = profile.signature;
				signatureOriginal = profile.signature;
			}
		} else {
			linkedLoading = false;
		}
	});

	// Render Turnstile widget when delete confirmation is shown
	$effect(() => {
		if (!showDeleteConfirm || !browser) return;
		deleteTurnstileToken = '';

		function renderWidget() {
			const container = document.getElementById('turnstile-container-delete');
			if (!container || !(window as any).turnstile) return;
			if (deleteTurnstileWidgetId !== null) {
				(window as any).turnstile.reset(deleteTurnstileWidgetId);
				return;
			}
			deleteTurnstileWidgetId = (window as any).turnstile.render('#turnstile-container-delete', {
				sitekey: PUBLIC_TURNSTILE_SITE_KEY,
				callback: (token: string) => { deleteTurnstileToken = token; },
				'expired-callback': () => { deleteTurnstileToken = ''; },
				theme: 'auto',
				size: 'normal',
			});
		}

		// Load Turnstile script if not already present
		if (!(window as any).turnstile) {
			if (!document.querySelector('script[src*="turnstile"]')) {
				const script = document.createElement('script');
				script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoadDelete&render=explicit';
				script.async = true;
				document.head.appendChild(script);
			}
			(window as any).onTurnstileLoadDelete = renderWidget;
		} else {
			// Small delay to ensure the DOM container is mounted
			requestAnimationFrame(renderWidget);
		}
	});

	/**
	 * Sync auth.identities → linked_accounts table.
	 * Supabase linkIdentity() adds identities at the auth layer but nothing
	 * writes to our linked_accounts table. This function bridges that gap.
	 */
	async function syncLinkedAccounts(userId: string) {
		try {
			const { data: identityData } = await supabase.auth.getUserIdentities();
			const identities = identityData?.identities || [];
			if (!identities.length) return;

			// Get existing linked_accounts rows
			const { data: existing } = await supabase
				.from('linked_accounts')
				.select('provider')
				.eq('user_id', userId);

			const existingProviders = new Set((existing || []).map((r: any) => r.provider));

			// Insert any identities missing from linked_accounts
			for (const identity of identities) {
				if (existingProviders.has(identity.provider)) continue;

				const meta = identity.identity_data || {};
				await supabase.from('linked_accounts').insert({
					user_id: userId,
					provider: identity.provider,
					provider_user_id: identity.id,
					provider_username: meta.full_name || meta.name || meta.preferred_username || null,
					provider_avatar_url: meta.avatar_url || meta.picture || null,
					provider_email: meta.email || null,
					provider_metadata: meta,
					linked_at: identity.created_at || new Date().toISOString(),
				});
			}
		} catch (err) {
			console.error('syncLinkedAccounts error:', err);
		}
	}

	async function loadLinkedAccounts(userId?: string) {
		linkedLoading = true;
		const uid = userId || $user?.id;
		if (!uid) { linkedLoading = false; return; }
		const { data, error } = await supabase
			.from('linked_accounts')
			.select('id, provider, provider_username, provider_avatar_url, provider_email, linked_at')
			.eq('user_id', uid)
			.order('linked_at', { ascending: true });

		if (!error && data) linkedAccounts = data;
		linkedLoading = false;
	}

	async function removeLinkedAccount(account: LinkedAccount) {
		if (linkedAccounts.length <= 1) {
			linkedMessage = 'You must keep at least one linked account.';
			return;
		}
		openConfirm('Remove Account', `Remove your ${account.provider} account (${account.provider_username || account.provider_email})?`, async () => {
			removingId = account.id;
			const { error } = await supabase
				.from('linked_accounts')
				.delete()
				.eq('id', account.id);

			if (error) {
				linkedMessage = 'Failed to remove account. Please try again.';
			} else {
				linkedAccounts = linkedAccounts.filter(a => a.id !== account.id);
				linkedMessage = `${account.provider} account removed.`;
			}
			removingId = null;
		});
	}

	function providerIcon(provider: string): string {
	const icons: Record<string, string> = { discord: 'message-square', twitch: 'monitor', google: 'search', github: 'file-text' };
		return icons[provider.toLowerCase()] || 'link';
	}

	async function linkAccount(provider: 'discord' | 'twitch') {
		linkingProvider = provider;
		linkedMessage = '';
		try {
			// Set redirect back to settings after OAuth (httpOnly via server endpoint)
			await fetch('/auth/set-redirect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ redirect: '/profile/settings' })
			});
			if (browser) sessionStorage.setItem('crc_just_linked', provider);

			const { error } = await supabase.auth.linkIdentity({
				provider,
				options: { redirectTo: `${PUBLIC_SITE_URL}/auth/callback` }
			});
			if (error) throw error;
		} catch (err: any) {
			linkedMessage = err?.message || `Failed to link ${provider}. Please try again.`;
			linkingProvider = null;
		}
	}

	function providerLabel(provider: string): string {
		return provider.charAt(0).toUpperCase() + provider.slice(1);
	}

	async function exportData() {
		exporting = true;
		exportMessage = '';
		try {
			const token = await getAccessToken();
			if (!token) { exportMessage = 'Not authenticated. Please sign in again.'; return; }

			const res = await fetch(`${PUBLIC_WORKER_URL}/export-data`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify({})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Export failed' }));
				exportMessage = err.error || `Export failed (${res.status})`;
				return;
			}

			const userData = await res.json();
			const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `crc-data-export-${new Date().toISOString().split('T')[0]}.json`;
			a.click();
			URL.revokeObjectURL(url);
			exportMessage = m.settings_export_success();
		} catch (err) {
			exportMessage = m.settings_export_failed();
		} finally {
			exporting = false;
		}
	}

	async function saveSignature() {
		const u = $user;
		if (!u) return;
		signatureSaving = true;
		signatureMessage = '';
		const trimmed = signature.trim().slice(0, 300);
		const { error } = await supabase.from('profiles').update({ signature: trimmed || null }).eq('user_id', u.id);
		if (error) {
			signatureMessage = 'Failed to save signature.';
		} else {
			signatureOriginal = trimmed;
			signatureMessage = 'Signature saved!';
			setTimeout(() => { signatureMessage = ''; }, 3000);
		}
		signatureSaving = false;
	}

	async function signOutAllDevices() {
		await supabase.auth.signOut({ scope: 'global' });
		goto('/');
	}

	async function deleteAccount() {
		if (!deleteTurnstileToken) {
			deleteError = 'Please complete the verification challenge.';
			return;
		}
		deleting = true;
		deleteError = '';
		try {
			const token = await getAccessToken();
			if (!token) { deleteError = 'Not authenticated. Please sign in again.'; return; }

			const res = await fetch(`${PUBLIC_WORKER_URL}/delete-account`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify({ turnstile_token: deleteTurnstileToken })
			});

			const data = await res.json().catch(() => ({ error: 'Deletion failed' }));
			if (!res.ok || !data.ok) {
				deleteError = data.error || `Deletion failed (${res.status})`;
				return;
			}

			// Sign out locally and redirect
			await supabase.auth.signOut();
			goto('/?account_deleted=1');
		} catch (err: any) {
			deleteError = err?.message || 'Failed to delete account. Please try again.';
		} finally {
			deleting = false;
			// Reset Turnstile widget so user can retry
			if (deleteTurnstileWidgetId !== null && (window as any).turnstile) {
				(window as any).turnstile.reset(deleteTurnstileWidgetId);
				deleteTurnstileToken = '';
			}
		}
	}
</script>

<svelte:head><title>{m.settings_page_title()}</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="settings-page">
			<h2>{m.settings_heading()}</h2>

			<section class="settings-section">
				<h2>{m.settings_linked_accounts()}</h2>
				<p>{m.settings_linked_desc()}</p>
				{#if justLinked}
					<div class="alert alert--success">{m.settings_linked_success({ provider: justLinked })}</div>
				{/if}
				{#if linkedMessage}
					<p class="linked-msg">{linkedMessage}</p>
				{/if}
				{#if linkedLoading}
					<div class="linked-loading muted">{m.settings_loading_accounts()}</div>
				{:else if linkedAccounts.length === 0}
					<div class="linked-empty muted">{m.settings_no_accounts()}</div>
				{:else}
					<div class="linked-list">
						{#each linkedAccounts as account (account.id)}
							<div class="linked-account">
								{#if account.provider_avatar_url}
									<img class="linked-avatar" src={account.provider_avatar_url} alt="" />
								{:else}
									<span class="linked-avatar linked-avatar--placeholder">{providerIcon(account.provider)}</span>
								{/if}
								<div class="linked-info">
									<strong>{account.provider_username || account.provider_email || 'Unknown'}</strong>
									<span class="muted">{providerIcon(account.provider)} {providerLabel(account.provider)}</span>
									<span class="muted" style="font-size: 0.75rem;">{m.settings_linked_date({ date: formatDate(account.linked_at) })}</span>
								</div>
								<Button.Root
									variant="outline"
									size="sm"
									disabled={linkedAccounts.length <= 1 || removingId === account.id}
									title={linkedAccounts.length <= 1 ? m.settings_keep_one() : m.settings_remove_provider({ provider: account.provider })}
									onclick={() => removeLinkedAccount(account)}
								>
									{removingId === account.id ? m.settings_removing() : m.settings_remove()}
								</Button.Root>
							</div>
						{/each}
					</div>
				{/if}
				{#if !linkedLoading && availableProviders.length > 0}
					<div class="link-new">
						<p class="muted" style="font-size: 0.85rem; margin-bottom: 0.5rem;">{m.settings_link_another()}</p>
						<div class="link-new__buttons">
							{#each availableProviders as provider}
								<Button.Root
									variant="outline"
									size="sm"
									disabled={linkingProvider === provider}
									onclick={() => linkAccount(provider)}
								>
									{linkingProvider === provider ? m.settings_redirecting() : `${providerIcon(provider)} Link ${providerLabel(provider)}`}
								</Button.Root>
							{/each}
						</div>
					</div>
				{/if}
			</section>

			<section class="settings-section">
				<h2>{m.settings_security()}</h2>
				<p>{m.settings_security_desc()}</p>
				<Button.Root variant="outline" onclick={signOutAllDevices}>
					{m.settings_sign_out_everywhere()}
				</Button.Root>
			</section>

			<section class="settings-section">
				<h2>Forum Signature</h2>
				<p>This appears below every post you make on the forum. Markdown supported. Max 300 characters.</p>
				<div class="sig-editor">
					<textarea
						class="sig-editor__input"
						bind:value={signature}
						rows="3"
						maxlength="300"
						placeholder="Your forum signature..."
					></textarea>
					<div class="sig-editor__footer">
						<span class="sig-editor__count" class:sig-editor__count--warn={signature.length > 250}>{signature.length}/300</span>
						<div class="sig-editor__actions">
							{#if signature !== signatureOriginal}
								<button class="btn btn--reset" onclick={() => { signature = signatureOriginal; }}>Reset</button>
							{/if}
							<Button.Root
								variant="accent"
								size="sm"
								onclick={saveSignature}
								disabled={signatureSaving || signature === signatureOriginal}
							>
								{signatureSaving ? 'Saving...' : 'Save Signature'}
							</Button.Root>
						</div>
					</div>
					{#if signatureMessage}
						<p class="sig-editor__msg" class:sig-editor__msg--ok={signatureMessage.includes('saved')}>{signatureMessage}</p>
					{/if}
				</div>
			</section>

			<section class="settings-section">
				<h2>{m.settings_data_rights()}</h2>
				<p>{m.settings_data_rights_desc()}</p>
				<div class="rights-grid">
					<div class="rights-item">
						<strong>{m.settings_access_export()}</strong>
						<p>{m.settings_access_export_desc()}</p>
						<Button.Root
							variant="outline"
							onclick={exportData}
							disabled={exporting}
						>
							{exporting ? m.settings_exporting() : m.settings_export_data()}
						</Button.Root>
						{#if exportMessage}
							<p class="export-msg">{exportMessage}</p>
						{/if}
					</div>
					<div class="rights-item">
						<strong>{m.settings_correction()}</strong>
						<p>{m.settings_correction_desc()}</p>
						<a href={localizeHref('/profile/edit')} class="btn btn--outline">{m.profile_edit()}</a>
					</div>
					<div class="rights-item">
						<strong>{m.settings_consent()}</strong>
						<p>{m.settings_consent_desc()}</p>
						<Button.Root variant="outline" onclick={() => { import('$stores/consent').then(m => m.showCookieSettings.set(true)); }}>{m.cookie_settings_title()}</Button.Root>
					</div>
					<div class="rights-item">
						<strong>{m.settings_deletion()}</strong>
						<p>{m.settings_deletion_desc()}</p>
					</div>
				</div>
				<p class="muted" style="margin-top: 1rem; font-size: 0.8rem;">
					{@html m.settings_privacy_contact({ email_start: '<a href="mailto:privacy@challengerun.net">', email_end: '</a>', link_start: `<a href="${localizeHref('/legal/privacy#your-rights')}">`, link_end: '</a>' })}
				</p>
			</section>

			<section class="settings-section settings-section--danger">
				<h2>{m.settings_danger_zone()}</h2>
				{#if !showDeleteConfirm}
					<p>{m.settings_danger_desc()}</p>
					<Button.Root variant="danger" onclick={() => showDeleteConfirm = true}>
						{m.settings_delete_account()}
					</Button.Root>
				{:else}
					<p>{@html m.settings_delete_confirm({ bold_start: '<strong>', bold_end: '</strong>' })}</p>
					{#if deleteError}
						<p class="delete-error">{deleteError}</p>
					{/if}
					<div class="delete-confirm">
						<input
							type="text"
							bind:value={deleteConfirmText}
							placeholder={m.settings_delete_placeholder()}
						/>
						<div id="turnstile-container-delete" style="margin: 0.75rem 0;"></div>
						<Button.Root
							variant="danger"
							disabled={deleteConfirmText !== 'DELETE' || !deleteTurnstileToken || deleting}
							onclick={deleteAccount}
						>
							{deleting ? m.settings_deleting() : m.settings_delete_permanent()}
						</Button.Root>
						<Button.Root variant="ghost" onclick={() => { showDeleteConfirm = false; deleteConfirmText = ''; deleteError = ''; }}>
							{m.btn_cancel()}
						</Button.Root>
					</div>
					<p class="muted" style="margin-top: 0.5rem; font-size: 0.8rem;">
						{m.settings_delete_note()}
					</p>
				{/if}
			</section>

			<div class="back-link">
				<a href={localizeHref('/profile')}>{m.settings_back()}</a>
			</div>
		</div>
	</div>
</AuthGuard>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="btn btn--danger" onclick={handleConfirmAction}>Remove</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.settings-page {
		max-width: 600px;
		margin: 2rem auto;
	}
	.settings-section {
		margin-bottom: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--border);
	}
	.settings-section h2 {
		font-size: 1.1rem;
		margin-bottom: 0.75rem;
	}
	.settings-section p {
		margin-bottom: 0.75rem;
		font-size: 0.9rem;
	}

	/* Linked accounts */
	.alert--success {
		background: rgba(40, 167, 69, 0.1);
		border: 1px solid rgba(40, 167, 69, 0.3);
		color: #28a745;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}
	.linked-msg { font-size: 0.85rem; color: var(--accent); margin-bottom: 0.75rem; }
	.linked-loading, .linked-empty { padding: 1rem; text-align: center; font-size: 0.9rem; }
	.linked-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.linked-account {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.linked-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}
	.linked-avatar--placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--border);
		font-size: 1.25rem;
	}
	.linked-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	.linked-info strong {
		font-size: 0.9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.linked-info .muted { font-size: 0.8rem; }
	.link-new { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed var(--border); }
	.link-new__buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.btn--outline {
		padding: 0.5rem 1rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: none;
		color: var(--fg);
		cursor: pointer;
		font-size: 0.9rem;
		font-family: inherit;
	}
	.btn--outline:hover { border-color: var(--accent); color: var(--accent); }
	.btn--outline:disabled { opacity: 0.4; cursor: not-allowed; }

	:global(.btn--danger) {
		padding: 0.5rem 1rem;
		border: 1px solid #ef4444;
		border-radius: 6px;
		background: none;
		color: #ef4444;
		cursor: pointer;
		font-size: 0.9rem;
	}
	:global(.btn--danger:hover) { background: #ef4444; color: #fff; }
	:global(.btn--danger:disabled) { opacity: 0.4; cursor: not-allowed; }
	.settings-section--danger {
		border-color: rgba(239, 68, 68, 0.2);
	}
	.settings-section--danger h2 {
		color: #ef4444;
	}
	.delete-confirm {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.delete-confirm input {
		padding: 0.5rem 0.75rem;
		border: 1px solid #ef4444;
		border-radius: 6px;
		background: var(--surface);
		color: var(--fg);
		font-size: 0.9rem;
		width: 150px;
	}
	.export-msg {
		color: var(--accent);
		font-size: 0.85rem;
		margin-top: 0.5rem;
	}
	.rights-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}
	.rights-item {
		padding: 0.75rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.rights-item strong { display: block; margin-bottom: 0.25rem; font-size: 0.9rem; }
	.rights-item p { font-size: 0.8rem; color: var(--muted); margin: 0 0 0.5rem 0; }
	.rights-item .btn--outline { font-size: 0.8rem; padding: 0.35rem 0.75rem; }
	@media (max-width: 500px) {
		.rights-grid { grid-template-columns: 1fr; }
	}
	.delete-error {
		color: #ef4444;
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}
	.back-link a {
		color: var(--muted);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.back-link a:hover { color: var(--accent); }

	/* Signature editor */
	.sig-editor { margin-top: 0.5rem; }
	.sig-editor__input {
		width: 100%;
		padding: 0.5rem 0.65rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--fg);
		font-family: inherit;
		font-size: 0.85rem;
		resize: vertical;
		box-sizing: border-box;
	}
	.sig-editor__input:focus { outline: none; border-color: var(--accent); }
	.sig-editor__footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 0.4rem;
		gap: 0.5rem;
	}
	.sig-editor__count { font-size: 0.75rem; color: var(--muted); }
	.sig-editor__count--warn { color: #f59e0b; }
	.sig-editor__actions { display: flex; gap: 0.4rem; align-items: center; }
	.sig-editor__msg { font-size: 0.82rem; margin-top: 0.3rem; color: #ef4444; }
	.sig-editor__msg--ok { color: var(--accent); }
</style>
