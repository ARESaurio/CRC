<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { getAccessToken } from '$lib/admin';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import AuthGuard from '$components/auth/AuthGuard.svelte';

	// Where to redirect after setup (or skip)
	let redirectTo = $state('/');

	// Form fields
	let runnerId = $state('');
	let displayName = $state('');

	// Validation
	let runnerIdStatus = $state<'idle' | 'checking' | 'valid' | 'taken' | 'invalid'>('idle');
	let runnerIdError = $state('');
	let checkTimeout: ReturnType<typeof setTimeout> | null = null;

	// UI state
	let submitting = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let ready = $state(false);
	let alreadyHasProfile = $state(false);

	onMount(() => {
		// Read redirect from URL
		const next = $page.url.searchParams.get('next');
		if (next && next.startsWith('/')) redirectTo = next;
	});

	// Check if user already has a runner_id
	$effect(() => {
		const currentUser = $user;
		if (!currentUser) return;

		(async () => {
			// Check profiles table
			const { data: profile } = await supabase
				.from('profiles')
				.select('runner_id')
				.eq('user_id', currentUser.id)
				.maybeSingle();

			if (profile?.runner_id) {
				alreadyHasProfile = true;
				goto(redirectTo);
				return;
			}

			// Pre-fill display name from auth metadata
			const meta = currentUser.user_metadata;
			if (!displayName) {
				displayName = meta?.full_name || meta?.name || meta?.preferred_username || '';
			}

			ready = true;
		})();
	});

	// ── Runner ID validation ──────────────────────────────────
	function onRunnerIdInput() {
		const raw = runnerId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
		runnerId = raw;

		if (!raw) {
			runnerIdStatus = 'idle';
			runnerIdError = '';
			return;
		}

		if (raw.length < 2) {
			runnerIdStatus = 'invalid';
			runnerIdError = 'Must be at least 2 characters';
			return;
		}

		if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(raw) && raw.length > 1) {
			runnerIdStatus = 'invalid';
			runnerIdError = 'Must start/end with a letter or number';
			return;
		}

		const bannedResult = checkBannedTerms(raw);
		if (bannedResult) {
			runnerIdStatus = 'invalid';
			runnerIdError = bannedResult;
			return;
		}

		// Debounced availability check
		runnerIdStatus = 'checking';
		if (checkTimeout) clearTimeout(checkTimeout);
		checkTimeout = setTimeout(() => validateRunnerId(raw), 400);
	}

	async function validateRunnerId(id: string) {
		// Check profiles table
		const { data: p1 } = await supabase
			.from('profiles')
			.select('runner_id')
			.eq('runner_id', id)
			.maybeSingle();
		if (p1) { runnerIdStatus = 'taken'; runnerIdError = 'Already taken'; return; }

		// Check pending_profiles
		const { data: p2 } = await supabase
			.from('pending_profiles')
			.select('requested_runner_id')
			.eq('requested_runner_id', id)
			.maybeSingle();
		if (p2) { runnerIdStatus = 'taken'; runnerIdError = 'Already taken'; return; }

		runnerIdStatus = 'valid';
		runnerIdError = '';
	}

	// ── Submit ────────────────────────────────────────────────
	async function handleSubmit() {
		if (!$user || runnerIdStatus !== 'valid' || !displayName.trim()) return;
		submitting = true;
		message = null;

		try {
			const finalId = runnerId.trim().toLowerCase();
			const finalName = displayName.trim();

			// Check if user is pre-approved
			const { data: pendingRow } = await supabase
				.from('pending_profiles')
				.select('status')
				.eq('user_id', $user.id)
				.maybeSingle();

			const isPreApproved = pendingRow?.status === 'approved';

			// Upsert pending_profiles with minimal data (insert if new user, update if existing)
			const { error } = await supabase
				.from('pending_profiles')
				.upsert({
					user_id: $user.id,
					requested_runner_id: finalId,
					display_name: finalName,
					has_profile: true,
					status: isPreApproved ? 'approved' : 'pending',
					submitted_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}, { onConflict: 'user_id' });

			if (error) throw error;

			if (isPreApproved) {
				// Create profiles row directly
				const { error: rpError } = await supabase
					.from('profiles')
					.insert({
						user_id: $user.id,
						runner_id: finalId,
						display_name: finalName,
						avatar_url: $user.user_metadata?.avatar_url || null,
						status: 'approved'
					});

				if (rpError) console.error('Failed to create profile:', rpError);

				message = { type: 'success', text: 'Profile created! Redirecting...' };
				setTimeout(() => goto(redirectTo), 1000);
			} else {
				// Notify staff via Discord that a profile needs review (best-effort)
				try {
					const token = await getAccessToken();
					if (token) {
						fetch(`${PUBLIC_WORKER_URL}/notify-profile-submitted`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
							body: JSON.stringify({ display_name: finalName, runner_id: finalId }),
						}).catch(() => {}); // fire-and-forget
					}
				} catch { /* non-critical */ }

				message = { type: 'success', text: 'Profile submitted for approval! Redirecting...' };
				setTimeout(() => goto('/profile/status'), 1500);
			}
		} catch (err: any) {
			message = { type: 'error', text: err?.message || 'Something went wrong.' };
		}
		submitting = false;
	}

	function skip() {
		goto(redirectTo);
	}

	let canSubmit = $derived(
		runnerIdStatus === 'valid' && displayName.trim().length >= 2 && !submitting
	);
</script>

<svelte:head><title>Set Up Your Profile | Challenge Run Community</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		{#if alreadyHasProfile}
			<p style="text-align:center; padding:3rem 0;">Redirecting...</p>
		{:else if ready}
			<div class="setup-page">
				<div class="setup-card">
					<h1>Welcome to CRC!</h1>
					<p class="setup-subtitle">Pick a runner ID to get started. This is your unique handle on the site — it'll appear in your profile URL and on leaderboards.</p>

					<div class="field">
						<label for="runner-id">Runner ID</label>
						<div class="field-input-wrap">
							<span class="field-prefix">challengerun.net/runners/</span>
							<input
								id="runner-id"
								type="text"
								bind:value={runnerId}
								oninput={onRunnerIdInput}
								placeholder="your-id"
								maxlength="30"
								autocomplete="off"
							/>
						</div>
						{#if runnerIdStatus === 'checking'}
							<span class="field-hint">Checking...</span>
						{:else if runnerIdStatus === 'valid'}
							<span class="field-hint field-hint--ok">✓ Available</span>
						{:else if runnerIdStatus === 'taken' || runnerIdStatus === 'invalid'}
							<span class="field-hint field-hint--err">{runnerIdError}</span>
						{:else}
							<span class="field-hint">Lowercase letters, numbers, and hyphens only</span>
						{/if}
					</div>

					<div class="field">
						<label for="display-name">Display Name</label>
						<input
							id="display-name"
							type="text"
							bind:value={displayName}
							placeholder="How you want to be known"
							maxlength="50"
						/>
						<span class="field-hint">This is what people see. You can change it later.</span>
					</div>

					{#if message}
						<div class="msg" class:msg--ok={message.type === 'success'} class:msg--err={message.type === 'error'}>
							{message.text}
						</div>
					{/if}

					<div class="setup-actions">
						<button class="btn btn--primary" onclick={handleSubmit} disabled={!canSubmit}>
							{submitting ? 'Saving...' : 'Save & Continue'}
						</button>
						<button class="btn btn--ghost" onclick={skip}>
							Skip for now
						</button>
					</div>

					<p class="setup-note">You can fill out the rest of your profile later from the settings menu. You'll need a runner ID before you can submit runs.</p>
				</div>
			</div>
		{:else}
			<p style="text-align:center; padding:3rem 0;">Loading...</p>
		{/if}
	</div>
</AuthGuard>

<style>
	.setup-page {
		display: flex;
		justify-content: center;
		padding: 3rem 0;
	}
	.setup-card {
		width: 100%;
		max-width: 480px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 2rem;
	}
	.setup-card h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}
	.setup-subtitle {
		color: var(--text-muted, var(--muted));
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
		line-height: 1.5;
	}
	.field {
		margin-bottom: 1.25rem;
	}
	.field label {
		display: block;
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.35rem;
	}
	.field input {
		width: 100%;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		font-size: 0.95rem;
		font-family: inherit;
	}
	.field input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.field-input-wrap {
		display: flex;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
		background: var(--bg);
	}
	.field-input-wrap:focus-within {
		border-color: var(--accent);
	}
	.field-input-wrap input {
		border: none;
		border-radius: 0;
		background: transparent;
	}
	.field-prefix {
		padding: 0.6rem 0 0.6rem 0.75rem;
		color: var(--text-muted, var(--muted));
		font-size: 0.85rem;
		white-space: nowrap;
		user-select: none;
	}
	.field-hint {
		display: block;
		font-size: 0.8rem;
		color: var(--text-muted, var(--muted));
		margin-top: 0.3rem;
	}
	.field-hint--ok { color: var(--success, #22c55e); }
	.field-hint--err { color: var(--danger, #ef4444); }
	.msg {
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}
	.msg--ok {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.3);
		color: var(--success, #22c55e);
	}
	.msg--err {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: var(--danger, #ef4444);
	}
	.setup-actions {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.setup-actions .btn--primary {
		flex: 1;
	}
	.btn--ghost {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.6rem 1rem;
		color: var(--text-muted, var(--muted));
		cursor: pointer;
		font-family: inherit;
		font-size: 0.9rem;
	}
	.btn--ghost:hover {
		border-color: var(--accent);
		color: var(--fg);
	}
	.setup-note {
		font-size: 0.8rem;
		color: var(--text-muted, var(--muted));
		line-height: 1.5;
	}
</style>
