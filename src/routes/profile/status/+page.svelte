<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	type ProfileStatus = 'loading' | 'no-profile' | 'pending' | 'approved' | 'rejected';
	let status = $state<ProfileStatus>('loading');
	let runnerId = $state('');
	let displayName = $state('');
	let submittedAt = $state('');
	let rejectionReason = $state('');

	onMount(async () => {
		if (!$user) return;

		try {
			const { data: profile, error } = await supabase
				.from('profiles')
				.select('runner_id, display_name, status, created_at, rejection_reason')
				.eq('user_id', $user.id)
				.single();

			if (error || !profile) {
				status = 'no-profile';
				return;
			}

			runnerId = profile.runner_id || '';
			displayName = profile.display_name || '';
			submittedAt = profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
			rejectionReason = profile.rejection_reason || '';

			if (profile.status === 'pending') status = 'pending';
			else if (profile.status === 'rejected') status = 'rejected';
			else status = 'approved';
		} catch {
			status = 'no-profile';
		}
	});
</script>

<svelte:head><title>{m.profile_status_title()}</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<p class="muted mb-3"><a href={localizeHref('/')}>{m.profile_status_back()}</a></p>

		<div class="profile-status">
			{#if status === 'loading'}
				<div class="card">
					<div class="status-loading">
						<div class="spinner"></div>
						<p class="muted">{m.profile_status_checking()}</p>
					</div>
				</div>

			{:else if status === 'no-profile'}
				<div class="card">
					<div class="status-icon">ðŸ“</div>
					<h1>{m.profile_status_no_profile()}</h1>
					<p class="muted">{m.profile_status_no_profile_desc()}</p>
					<a href={localizeHref('/profile/create')} class="btn btn--primary">{m.profile_status_create()}</a>
				</div>

			{:else if status === 'pending'}
				<div class="card">
					<div class="status-icon">â³</div>
					<h1>{m.profile_status_pending()}</h1>
					<div class="status-details">
						<div class="status-detail"><span class="muted">{m.profile_status_display_name()}</span> <strong>{displayName}</strong></div>
						<div class="status-detail"><span class="muted">{m.profile_status_runner_id()}</span> <code>{runnerId}</code></div>
						{#if submittedAt}
							<div class="status-detail"><span class="muted">{m.profile_status_submitted()}</span> {submittedAt}</div>
						{/if}
					</div>
					<div class="status-notice">
						<p>{@html m.profile_status_review_time({ bold_start: '<strong>', bold_end: '</strong>' })}</p>
						<p class="muted">{m.profile_status_review_desc()}</p>
					</div>
					<div class="status-progress">
						<div class="progress-step is-done"><span class="progress-dot"></span><span>{m.profile_status_step_submitted()}</span></div>
						<div class="progress-line"></div>
						<div class="progress-step is-active"><span class="progress-dot"></span><span>{m.profile_status_step_review()}</span></div>
						<div class="progress-line"></div>
						<div class="progress-step"><span class="progress-dot"></span><span>{m.profile_status_step_approved()}</span></div>
					</div>
				</div>

			{:else if status === 'rejected'}
				<div class="card card--danger">
					<div class="status-icon">âŒ</div>
					<h1>{m.profile_status_rejected()}</h1>
					<div class="status-details">
						<div class="status-detail"><span class="muted">{m.profile_status_display_name()}</span> <strong>{displayName}</strong></div>
						<div class="status-detail"><span class="muted">{m.profile_status_runner_id()}</span> <code>{runnerId}</code></div>
					</div>
					{#if rejectionReason}
						<div class="rejection-reason">
							<strong>{m.profile_status_rejection_reason()}</strong>
							<p>{rejectionReason}</p>
						</div>
					{/if}
					<p class="muted">{m.profile_status_try_again_desc()}</p>
					<a href={localizeHref('/profile/create')} class="btn btn--primary">{m.profile_status_try_again()}</a>
				</div>

			{:else}
				<div class="card">
					<div class="status-icon">âœ…</div>
					<h1>{m.profile_status_approved()}</h1>
					<div class="status-details">
						<div class="status-detail"><span class="muted">{m.profile_status_display_name()}</span> <strong>{displayName}</strong></div>
						<div class="status-detail"><span class="muted">{m.profile_status_runner_id()}</span> <code>{runnerId}</code></div>
					</div>
					<p class="muted">{m.profile_status_approved_desc()}</p>
					<div class="status-actions">
						<a href={localizeHref(`/runners/${runnerId}`)} class="btn btn--primary">{m.profile_status_view()}</a>
						<a href={localizeHref('/profile/edit')} class="btn">{m.profile_status_edit()}</a>
						<a href={localizeHref('/submit')} class="btn">{m.profile_status_submit_run()}</a>
					</div>
				</div>
			{/if}
		</div>
	</div>
</AuthGuard>

<style>
	.profile-status { max-width: 600px; margin: 0 auto; text-align: center; }
	.mb-3 { margin-bottom: 1rem; }
	.status-loading { padding: 2rem; }
	.status-icon { font-size: 3rem; margin-bottom: 1rem; }

	.status-details { display: flex; flex-direction: column; gap: 0.5rem; margin: 1.5rem 0; padding: 1rem; background: var(--bg); border-radius: 8px; text-align: left; }
	.status-detail { font-size: 0.9rem; }
	.status-detail code { background: var(--surface); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85rem; }

	.status-notice { margin: 1.5rem 0; text-align: left; padding: 1rem; background: rgba(99, 102, 241, 0.06); border-radius: 8px; }
	.status-notice p { margin: 0 0 0.5rem; }
	.status-notice p:last-child { margin: 0; }

	/* Progress Bar */
	.status-progress { display: flex; align-items: center; justify-content: center; gap: 0; margin: 2rem 0 1rem; }
	.progress-step { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--muted); }
	.progress-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border); background: var(--bg); }
	.progress-step.is-done .progress-dot { background: var(--accent); border-color: var(--accent); }
	.progress-step.is-active .progress-dot { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
	.progress-step.is-active { color: var(--fg); font-weight: 600; }
	.progress-step.is-done { color: var(--accent); }
	.progress-line { flex: 1; max-width: 80px; height: 2px; background: var(--border); }

	/* Rejection */
	.card--danger { border-color: rgba(239, 68, 68, 0.3); }
	.rejection-reason { text-align: left; padding: 1rem; background: rgba(239, 68, 68, 0.06); border-radius: 8px; margin: 1rem 0; border-left: 3px solid #ef4444; }
	.rejection-reason p { margin: 0.5rem 0 0; }

	.status-actions { display: flex; gap: 0.75rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none; border: 1px solid var(--border); background: none; color: var(--fg); }
</style>
