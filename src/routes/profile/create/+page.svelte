<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import AuthGuard from '$components/auth/AuthGuard.svelte';

	// ── State ─────────────────────────────────────────────────────────────────
	type PageState = 'loading' | 'has-profile' | 'has-pending' | 'create';
	let pageState = $state<PageState>('loading');
	let existingRunnerId = $state('');

	// ── Form Fields ───────────────────────────────────────────────────────────
	let runnerId = $state('');
	let displayName = $state('');
	let pronouns = $state('');
	let location = $state('');
	let bio = $state('');
	let socialTwitch = $state('');
	let socialYoutube = $state('');
	let socialTwitter = $state('');
	let socialBluesky = $state('');
	let socialInstagram = $state('');
	let otherLinks = $state<string[]>(['']);

	// ── Validation ────────────────────────────────────────────────────────────
	let runnerIdStatus = $state<'idle' | 'checking' | 'valid' | 'taken' | 'invalid'>('idle');
	let runnerIdError = $state('');
	let checkTimeout: ReturnType<typeof setTimeout> | null = null;

	let bioCount = $derived(bio.length);
	let runnerIdPreview = $derived(runnerId || 'your-id');

	// ── Banned terms validation ──────────────────────────────────
	const bannedTermsWarning = $derived.by(() => {
		const fields = [
			{ label: 'Display name', value: displayName },
			{ label: 'Bio', value: bio },
		];
		for (const f of fields) {
			const result = checkBannedTerms(f.value);
			if (result) return `${f.label}: ${result}`;
		}
		return null;
	});

	// ── Submit ────────────────────────────────────────────────────────────────
	let submitting = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// ── OAuth Info ────────────────────────────────────────────────────────────
	let oauthAvatar = $derived($user?.user_metadata?.avatar_url || '/img/site/default-runner.png');
	let oauthName = $derived($user?.user_metadata?.full_name || $user?.user_metadata?.name || 'User');
	let oauthProvider = $derived($user?.app_metadata?.provider || 'OAuth');

	// ── Init ──────────────────────────────────────────────────────────────────
	onMount(async () => {
		if (!$user) return;

		try {
			// 1. Check profiles — already approved
			const { data: approved } = await supabase
				.from('profiles')
				.select('runner_id, status')
				.eq('user_id', $user.id)
				.maybeSingle();

			if (approved?.runner_id) {
				if (approved.status === 'pending') {
					pageState = 'has-pending';
				} else {
					// Already approved — send them straight to their profile
					goto(`/runners/${approved.runner_id}`);
				}
				return;
			}

			// 2. Check pending_profiles — submitted but not yet approved
			const { data: pending } = await supabase
				.from('pending_profiles')
				.select('id, requested_runner_id, has_profile, status')
				.eq('user_id', $user.id)
				.maybeSingle();

			if (pending?.has_profile && pending.requested_runner_id) {
				pageState = 'has-pending';
				return;
			}
		} catch {
			// No profile found — show create form
		}

		// Auto-fill from OAuth
		const name = $user.user_metadata?.full_name || $user.user_metadata?.name || '';
		displayName = name;
		runnerId = generateRunnerId(name);
		if (runnerId.length >= 3) {
			validateRunnerId(runnerId);
		}

		pageState = 'create';
	});

	// ── Runner ID Logic ───────────────────────────────────────────────────────
	function generateRunnerId(username: string): string {
		return username
			.toLowerCase()
			.replace(/[\s_]+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/^-+|-+$/g, '')
			.replace(/-{2,}/g, '-');
	}

	function onRunnerIdInput(e: Event) {
		const input = e.target as HTMLInputElement;
		let value = input.value
			.toLowerCase()
			.replace(/_/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-{2,}/g, '-');
		runnerId = value;
		input.value = value;

		runnerIdStatus = 'idle';
		runnerIdError = '';
		if (checkTimeout) clearTimeout(checkTimeout);

		// Format validation
		if (!value) { runnerIdStatus = 'invalid'; runnerIdError = 'Runner ID is required'; return; }
		if (value.length < 3) { runnerIdStatus = 'invalid'; runnerIdError = 'Must be at least 3 characters'; return; }
		if (/^-|-$/.test(value)) { runnerIdStatus = 'invalid'; runnerIdError = 'Cannot start or end with a hyphen'; return; }

		validateRunnerId(value);
	}

	function validateRunnerId(value: string) {
		runnerIdStatus = 'checking';
		runnerIdError = '';

		checkTimeout = setTimeout(async () => {
			try {
				// Check profiles
				const { data: rpData } = await supabase
					.from('profiles')
					.select('runner_id')
					.eq('runner_id', value)
					.maybeSingle();

				if (rpData) {
					runnerIdStatus = 'taken';
					runnerIdError = 'Already taken';
					return;
				}

				// Check pending_profiles
				const { data: ppData } = await supabase
					.from('pending_profiles')
					.select('requested_runner_id')
					.eq('requested_runner_id', value)
					.eq('has_profile', true)
					.maybeSingle();

				if (ppData) {
					runnerIdStatus = 'taken';
					runnerIdError = 'Already taken';
				} else {
					runnerIdStatus = 'valid';
				}
			} catch {
				runnerIdStatus = 'valid'; // Assume available on error
			}
		}, 500);
	}

	// ── Submit ────────────────────────────────────────────────────────────────
	async function handleSubmit() {
		if (!$user) return;

		// Final validation
		const finalId = runnerId.replace(/-+$/, '');
		if (!finalId || finalId.length < 3) {
			message = { type: 'error', text: 'Runner ID must be at least 3 characters.' };
			return;
		}
		if (runnerIdStatus !== 'valid') {
			message = { type: 'error', text: 'Please choose an available Runner ID.' };
			return;
		}
		if (!displayName.trim()) {
			message = { type: 'error', text: 'Display Name is required.' };
			return;
		}
		if (bannedTermsWarning) {
			message = { type: 'error', text: bannedTermsWarning };
			return;
		}

		submitting = true;
		message = null;

		try {
			const socials: Record<string, string | string[] | null> = {};
			if (socialTwitch.trim()) socials.twitch = socialTwitch.trim();
			if (socialYoutube.trim()) socials.youtube = socialYoutube.trim();
			if (socialTwitter.trim()) socials.twitter = socialTwitter.trim();
			if (socialBluesky.trim()) socials.bluesky = socialBluesky.trim();
			if (socialInstagram.trim()) socials.instagram = socialInstagram.trim();
			const others = otherLinks.filter(l => l.trim());
			if (others.length > 0) socials.other = others;

			// Check if user is pre-approved (admin approved account before profile was filled out)
			const { data: pendingRow } = await supabase
				.from('pending_profiles')
				.select('status')
				.eq('user_id', $user.id)
				.maybeSingle();

			const isPreApproved = pendingRow?.status === 'approved';

			// Update pending_profiles with form data
			const { error } = await supabase
				.from('pending_profiles')
				.update({
					requested_runner_id: finalId,
					display_name: displayName.trim(),
					pronouns: pronouns.trim() || null,
					location: location.trim() || null,
					bio: bio.trim() || null,
					socials,
					avatar_url: $user.user_metadata?.avatar_url || null,
					has_profile: true,
					status: isPreApproved ? 'approved' : 'pending',
					submitted_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('user_id', $user.id);

			if (error) throw error;

			if (isPreApproved) {
				// Already approved — create profiles row directly
				const { error: rpError } = await supabase
					.from('profiles')
					.insert({
						user_id: $user.id,
						runner_id: finalId,
						display_name: displayName.trim(),
						pronouns: pronouns.trim() || null,
						location: location.trim() || null,
						bio: bio.trim() || null,
						socials,
						avatar_url: $user.user_metadata?.avatar_url || null,
						status: 'approved'
					});

				if (rpError) console.error('Failed to create profiles:', rpError);

				message = { type: 'success', text: 'Profile created! Redirecting...' };
				setTimeout(() => goto(`/runners/${finalId}`), 1500);
			} else {
				message = { type: 'success', text: 'Profile submitted for approval! Redirecting...' };
				setTimeout(() => goto('/profile/status'), 1500);
			}
		} catch (err: any) {
			message = { type: 'error', text: err?.message || 'Submission failed. Please try again.' };
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Create Runner Profile | Challenge Run Community</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<p class="muted mb-3"><a href="/sign-in">← Back to Sign In</a></p>

		<div class="profile-create">
			<!-- Loading -->
			{#if pageState === 'loading'}
				<div class="card">
					<div class="sign-in-loading">
						<div class="spinner"></div>
						<p class="muted">Loading...</p>
					</div>
				</div>

			<!-- Already has profile -->
			{:else if pageState === 'has-profile'}
				<div class="card">
					<h1>You Already Have a Profile</h1>
					<p class="muted">You can view or edit your existing profile.</p>
					<div class="profile-create__actions">
						<a href="/runners/{existingRunnerId}" class="btn btn--primary">View Profile</a>
						<a href="/profile/edit" class="btn">Edit Profile</a>
					</div>
				</div>

			<!-- Pending -->
			{:else if pageState === 'has-pending'}
				<div class="card">
					<h1>Profile Pending Approval</h1>
					<p class="muted">Your profile is awaiting moderator review. You'll be notified once it's approved.</p>
					<a href="/profile/status" class="btn btn--primary">Check Status</a>
				</div>

			<!-- Create Form -->
			{:else}
				<div class="card">
					<h1>Create Your Runner Profile</h1>
					<p class="muted mb-4">
						Fill out the form below to create your runner profile. Your profile will be reviewed by a moderator before it goes live.
						<span class="required-hint"><span class="required-marker">*</span> indicates required fields</span>
					</p>

					{#if message}
						<div class="form-message form-message--{message.type}">{message.text}</div>
					{/if}

					<!-- OAuth Info -->
					<div class="profile-form__section">
						<h2 class="profile-form__section-title">Linked Account</h2>
						<div class="profile-form__oauth-info">
							<img class="profile-form__oauth-avatar" src={oauthAvatar} alt="" />
							<div class="profile-form__oauth-details">
								<p class="profile-form__oauth-name">{oauthName}</p>
								<p class="profile-form__oauth-provider muted">via {oauthProvider.charAt(0).toUpperCase() + oauthProvider.slice(1)}</p>
							</div>
						</div>
					</div>

					<!-- Basic Info -->
					<div class="profile-form__section">
						<h2 class="profile-form__section-title">Basic Info</h2>

						<div class="profile-form__field">
							<label for="runner_id" class="profile-form__label">Runner ID <span class="required-marker">*</span></label>
							<div class="profile-form__hint">
								Your unique URL: <code>challengerun.net/runners/{runnerIdPreview}/</code>
							</div>
							<input
								type="text" id="runner_id" class="profile-form__input"
								class:is-valid={runnerIdStatus === 'valid'}
								class:is-invalid={runnerIdStatus === 'taken' || runnerIdStatus === 'invalid'}
								value={runnerId}
								oninput={onRunnerIdInput}
								placeholder="your-runner-id" required minlength="3" autocomplete="off"
							/>
							<div class="profile-form__char-rules">
								<strong>Allowed:</strong> lowercase letters (a-z), numbers (0-9), hyphens (-). Minimum 3 characters.
							</div>
							<div class="profile-form__validation"
								class:is-valid={runnerIdStatus === 'valid'}
								class:is-invalid={runnerIdStatus === 'taken' || runnerIdStatus === 'invalid'}
								class:is-checking={runnerIdStatus === 'checking'}
							>
								{#if runnerIdStatus === 'checking'}✓ Valid format. Checking availability...
								{:else if runnerIdStatus === 'valid'}<span class="text-success">✓ Available!</span>
								{:else if runnerIdStatus === 'taken'}✓ Valid format, but <span class="text-danger">already taken</span>
								{:else if runnerIdStatus === 'invalid'}<span class="text-danger">✗ {runnerIdError}</span>
								{/if}
							</div>
						</div>

						<div class="profile-form__field">
							<label for="display_name" class="profile-form__label">Display Name <span class="required-marker">*</span></label>
							<div class="profile-form__hint">How your name appears on the site (2-50 characters)</div>
							<input type="text" id="display_name" class="profile-form__input" bind:value={displayName} placeholder="Your Display Name" minlength="2" maxlength="50" required />
						</div>

						<div class="profile-form__row">
							<div class="profile-form__field">
								<label for="pronouns" class="profile-form__label">Pronouns</label>
								<input type="text" id="pronouns" class="profile-form__input" bind:value={pronouns} placeholder="e.g., they/them" maxlength="30" />
							</div>
							<div class="profile-form__field">
								<label for="location" class="profile-form__label">Location</label>
								<input type="text" id="location" class="profile-form__input" bind:value={location} placeholder="e.g., United States" maxlength="50" />
							</div>
						</div>

						<div class="profile-form__field">
							<label for="bio" class="profile-form__label">Bio</label>
							<div class="profile-form__hint">Tell us about yourself (max 1000 characters)</div>
							<textarea id="bio" class="profile-form__textarea" bind:value={bio} placeholder="A short bio about yourself..." maxlength="1000" rows="4"></textarea>
							<div class="profile-form__char-count">{bioCount}/1000</div>
						</div>
					</div>

					<!-- Social Links -->
					<div class="profile-form__section">
						<h2 class="profile-form__section-title">Social Links</h2>
						<p class="muted mb-3">Add links to your social profiles (all optional)</p>

						<div class="profile-form__field">
							<label class="profile-form__label">Twitch</label>
							<input type="url" class="profile-form__input" bind:value={socialTwitch} placeholder="https://www.twitch.tv/your_username" />
						</div>
						<div class="profile-form__field">
							<label class="profile-form__label">YouTube</label>
							<input type="url" class="profile-form__input" bind:value={socialYoutube} placeholder="https://www.youtube.com/@your_channel" />
						</div>
						<div class="profile-form__field">
							<label class="profile-form__label">Twitter / X</label>
							<input type="url" class="profile-form__input" bind:value={socialTwitter} placeholder="https://twitter.com/your_handle" />
						</div>
						<div class="profile-form__field">
							<label class="profile-form__label">Bluesky</label>
							<input type="url" class="profile-form__input" bind:value={socialBluesky} placeholder="https://bsky.app/profile/your.handle" />
						</div>
						<div class="profile-form__field">
							<label class="profile-form__label">Instagram</label>
							<input type="url" class="profile-form__input" bind:value={socialInstagram} placeholder="https://www.instagram.com/your_username" />
						</div>

						<!-- Other Links -->
						{#each otherLinks as link, i}
							<div class="profile-form__field other-link-field">
								<label class="profile-form__label">Other (optional)</label>
								{#if i > 0}
									<button type="button" class="other-link-remove" onclick={() => otherLinks = otherLinks.filter((_, idx) => idx !== i)}>Remove</button>
								{/if}
								<input type="url" class="profile-form__input" bind:value={otherLinks[i]} placeholder="https://your-website-or-social.com" />
							</div>
						{/each}
						{#if otherLinks.length < 3}
							<button type="button" class="btn btn--small" onclick={() => otherLinks = [...otherLinks, '']} style="margin-top: 0.5rem;">
								+ Add Another Link
							</button>
							<span class="muted" style="margin-left: 0.5rem; font-size: 0.85rem;">({otherLinks.length}/3)</span>
						{/if}
					</div>

					<!-- Submit -->
					<div class="profile-form__section">
						<div class="profile-form__notice">
							<strong>📋 Moderation Notice</strong>
							<p class="muted">
								Your profile will be reviewed by a moderator before it appears on the site.
								This usually takes 1-2 days. You'll be able to submit runs once approved.
							</p>
						</div>

						<div class="profile-form__actions">
							{#if bannedTermsWarning}
								<p class="form-message form-message--error">{bannedTermsWarning}</p>
							{/if}
							<button type="button" class="btn btn--primary" onclick={handleSubmit} disabled={submitting || !!bannedTermsWarning}>
								{submitting ? '⏳ Submitting...' : 'Submit for Review'}
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</AuthGuard>

<style>
	.profile-create { max-width: 700px; margin: 0 auto; }
	.profile-create__actions { display: flex; gap: 1rem; margin-top: 1rem; }
	.mb-3 { margin-bottom: 1rem; }
	.mb-4 { margin-bottom: 1.5rem; }
	.sign-in-loading { text-align: center; padding: 2rem; }

	/* Sections */
	.profile-form__section { margin-bottom: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
	.profile-form__section:first-of-type { border-top: none; padding-top: 0; }
	.profile-form__section-title { font-size: 1.1rem; margin: 0 0 1rem; }

	/* OAuth Info */
	.profile-form__oauth-info { display: flex; align-items: center; gap: 1rem; }
	.profile-form__oauth-avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--border); }
	.profile-form__oauth-name { margin: 0; font-weight: 600; }
	.profile-form__oauth-provider { margin: 0; font-size: 0.85rem; }

	/* Fields */
	.profile-form__field { margin-bottom: 1.25rem; position: relative; }
	.profile-form__row { display: flex; gap: 1rem; }
	.profile-form__row .profile-form__field { flex: 1; }
	.profile-form__label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.35rem; }
	.profile-form__hint { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; }
	.profile-form__input, .profile-form__textarea {
		width: 100%; padding: 0.6rem 0.75rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 8px; color: var(--fg); font-size: 0.9rem; font-family: inherit;
	}
	.profile-form__input:focus, .profile-form__textarea:focus {
		outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
	}
	.profile-form__textarea { resize: vertical; }
	.profile-form__char-count { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }

	/* Runner ID Validation */
	.profile-form__char-rules {
		font-size: 0.8rem; color: var(--muted); margin: 0.25rem 0 0.5rem; padding: 0.5rem 0.75rem;
		background: var(--surface); border-radius: 6px; border-left: 3px solid var(--accent); line-height: 1.5;
	}
	.profile-form__validation { font-size: 0.85rem; margin-top: 0.25rem; min-height: 1.25rem; }
	.profile-form__validation.is-valid { color: #28a745; }
	.profile-form__validation.is-invalid { color: #dc3545; }
	.profile-form__validation.is-checking { color: var(--muted); }
	.profile-form__input.is-valid { border-color: #28a745; }
	.profile-form__input.is-invalid { border-color: #dc3545; }

	/* Messages */
	.form-message { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.9rem; }
	.form-message--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.form-message--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	/* Notice */
	.profile-form__notice {
		padding: 1rem; background: rgba(99, 102, 241, 0.08); border-radius: 8px; margin-bottom: 1.5rem;
	}
	.profile-form__notice p { margin: 0.5rem 0 0; }
	.profile-form__actions { display: flex; gap: 1rem; }

	/* Other links */
	.other-link-field { position: relative; }
	.other-link-remove {
		position: absolute; right: 0; top: 0; background: none; border: none;
		color: #dc3545; cursor: pointer; font-size: 0.85rem; padding: 0.25rem 0.5rem;
	}
	.other-link-remove:hover { text-decoration: underline; }

	/* Markers */
	.required-marker { color: #dc3545; }
	.required-hint { display: block; margin-top: 0.5rem; font-size: 0.8rem; }
	.text-success { color: #28a745; }
	.text-danger { color: #dc3545; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none; border: 1px solid var(--border); background: none; color: var(--fg); }
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn--primary { background: var(--accent); color: white; border-color: var(--accent); }
	.btn--primary:hover { opacity: 0.9; color: white; }
	.btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }

	@media (max-width: 600px) {
		.profile-form__row { flex-direction: column; gap: 0; }
		.profile-create__actions { flex-direction: column; }
	}
</style>
