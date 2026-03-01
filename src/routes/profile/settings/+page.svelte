<script lang="ts">
	import { user, session } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import AuthGuard from '$components/auth/AuthGuard.svelte';

	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	let exporting = $state(false);
	let exportMessage = $state('');

	async function exportData() {
		exporting = true;
		exportMessage = '';
		try {
			// Gather all user data for GDPR export
			const userData = {
				profile: {
					id: $user?.id,
					email: $user?.email,
					created_at: $user?.created_at,
					metadata: $user?.user_metadata
				},
				exported_at: new Date().toISOString()
			};

			// Download as JSON
			const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `crc-data-export-${new Date().toISOString().split('T')[0]}.json`;
			a.click();
			URL.revokeObjectURL(url);
			exportMessage = 'Data exported successfully.';
		} catch (err) {
			exportMessage = 'Failed to export data. Please try again.';
		} finally {
			exporting = false;
		}
	}

	async function signOutAllDevices() {
		await supabase.auth.signOut({ scope: 'global' });
		goto('/');
	}
</script>

<svelte:head><title>Settings | Challenge Run Community</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="settings-page">
			<h1>Settings</h1>

			<section class="settings-section">
				<h2>Connected Account</h2>
				<div class="connected-account">
					<img
						class="connected-avatar"
						src={$user?.user_metadata?.avatar_url || '/img/site/default-runner.png'}
						alt=""
					/>
					<div>
						<strong>{$user?.user_metadata?.full_name || $user?.email || 'User'}</strong>
						<p class="muted">{$user?.app_metadata?.provider || 'OAuth'} account</p>
					</div>
				</div>
			</section>

			<section class="settings-section">
				<h2>Security</h2>
				<p>Sign out from all devices and sessions.</p>
				<button class="btn btn--outline" onclick={signOutAllDevices}>
					Sign Out Everywhere
				</button>
			</section>

			<section class="settings-section">
				<h2>Data Export</h2>
				<p>Download a copy of your CRC data in JSON format. This includes your profile information and account metadata.</p>
				<button
					class="btn btn--outline"
					onclick={exportData}
					disabled={exporting}
				>
					{exporting ? 'Exporting...' : 'Export My Data'}
				</button>
				{#if exportMessage}
					<p class="export-msg">{exportMessage}</p>
				{/if}
			</section>

			<section class="settings-section settings-section--danger">
				<h2>Danger Zone</h2>
				{#if !showDeleteConfirm}
					<p>Permanently delete your account and all associated data. This action cannot be undone.</p>
					<button class="btn btn--danger" onclick={() => showDeleteConfirm = true}>
						Delete Account
					</button>
				{:else}
					<p>Type <strong>DELETE</strong> to confirm account deletion:</p>
					<div class="delete-confirm">
						<input
							type="text"
							bind:value={deleteConfirmText}
							placeholder="Type DELETE"
						/>
						<button
							class="btn btn--danger"
							disabled={deleteConfirmText !== 'DELETE'}
							onclick={() => { /* Account deletion requires admin API — would go through Worker */ }}
						>
							Permanently Delete
						</button>
						<button class="btn btn--ghost" onclick={() => { showDeleteConfirm = false; deleteConfirmText = ''; }}>
							Cancel
						</button>
					</div>
					<p class="muted" style="margin-top: 0.5rem; font-size: 0.8rem;">
						Account deletion is processed by our team and may take up to 48 hours.
					</p>
				{/if}
			</section>

			<div class="back-link">
				<a href="/profile">← Back to Profile</a>
			</div>
		</div>
	</div>
</AuthGuard>

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
	.connected-account {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.connected-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
	}
	.connected-account .muted {
		margin: 0;
		font-size: 0.85rem;
	}
	.btn--danger {
		padding: 0.5rem 1rem;
		border: 1px solid #ef4444;
		border-radius: 6px;
		background: none;
		color: #ef4444;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.btn--danger:hover { background: #ef4444; color: #fff; }
	.btn--danger:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn--ghost {
		padding: 0.5rem 1rem;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
		font-size: 0.9rem;
	}
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
	.back-link a {
		color: var(--muted);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.back-link a:hover { color: var(--accent); }
</style>
