<script lang="ts">
	import { user, session } from '$stores/auth';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.profile_title()}</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="profile-page">
			<div class="profile-header">
				<img
					class="profile-avatar"
					src={$user?.user_metadata?.avatar_url || '/img/site/default-runner.png'}
					alt="Your avatar"
				/>
				<div class="profile-info">
					<h1>{$user?.user_metadata?.full_name || $user?.user_metadata?.name || m.profile_default_name()}</h1>
					<p class="muted">
						{$user?.user_metadata?.provider_id
							? m.profile_connected_via({ provider: $user?.app_metadata?.provider || 'OAuth' })
							: $user?.email || ''}
					</p>
					<div class="profile-actions">
						<a href={localizeHref('/profile/edit')} class="btn btn--outline">{m.profile_edit()}</a>
						<a href={localizeHref('/profile/submissions')} class="btn btn--outline">📋 {m.user_menu_submissions()}</a>
						<a href={localizeHref('/profile/settings')} class="btn btn--outline">{m.profile_settings()}</a>
					</div>
				</div>
			</div>

			<section class="profile-section">
				<h2>{m.profile_account_details()}</h2>
				<div class="detail-grid">
					<div class="detail-item">
						<span class="detail-label">{m.profile_email()}</span>
						<span class="detail-value">{$user?.email || m.profile_not_set()}</span>
					</div>
					<div class="detail-item">
						<span class="detail-label">{m.profile_provider()}</span>
						<span class="detail-value">{$user?.app_metadata?.provider || m.profile_unknown()}</span>
					</div>
					<div class="detail-item">
						<span class="detail-label">{m.profile_user_id()}</span>
						<span class="detail-value id-value">{$user?.id || '—'}</span>
					</div>
					<div class="detail-item">
						<span class="detail-label">{m.profile_joined()}</span>
						<span class="detail-value">
							{$user?.created_at ? new Date($user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
						</span>
					</div>
				</div>
			</section>

			<section class="profile-section">
				<h2>{m.profile_my_runs()}</h2>
				<p class="muted">{m.profile_my_runs_desc()}</p>
			</section>

			<section class="profile-section">
				<h2>{m.profile_my_achievements()}</h2>
				<p class="muted">{m.profile_my_achievements_desc()}</p>
			</section>
		</div>
	</div>
</AuthGuard>

<style>
	.profile-page {
		max-width: 800px;
		margin: 2rem auto;
	}
	.profile-header {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		margin-bottom: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--border);
	}
	.profile-avatar {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid var(--border);
	}
	.profile-info h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
	}
	.profile-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.profile-section {
		margin-bottom: 2rem;
	}
	.profile-section h2 {
		font-size: 1.15rem;
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 1rem;
	}
	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.detail-label {
		font-size: 0.8rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.detail-value {
		font-size: 0.95rem;
	}
	.id-value {
		font-family: monospace;
		font-size: 0.8rem;
		word-break: break-all;
	}
	@media (max-width: 600px) {
		.profile-header {
			flex-direction: column;
			align-items: center;
			text-align: center;
		}
		.profile-actions {
			justify-content: center;
		}
	}
</style>
