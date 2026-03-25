<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$stores/auth';
	import { debugRole, debugHidesAuth } from '$stores/debug';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { getAccessToken } from '$lib/admin';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import { showToast } from '$stores/toast';
	import { COUNTRIES } from '$lib/data/countries';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import * as m from '$lib/paraglide/messages';
	import { CheckCircle, AlertTriangle, Send , X } from 'lucide-svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

	// ── Server Data ───────────────────────────────────────────────────────────
	let { data } = $props();

	// ── State ─────────────────────────────────────────────────────────────────
	type PageState = 'loading' | 'has-profile' | 'has-pending' | 'create';
	let pageState = $state<PageState>('loading');
	let existingRunnerId = $state('');

	// Hydrate from server data immediately (no client-side Supabase needed)
	$effect(() => {
		if ($debugRole) {
			displayName = 'New Runner';
			runnerId = 'new-runner';
			pageState = 'create';
			return;
		}

		if (data.profileState === 'has-profile' || data.profileState === 'has-pending') {
			existingRunnerId = data.existingRunnerId || '';
			pageState = data.profileState;
		} else if (data.profileState === 'create') {
			pageState = 'create';
		}
	});

	// ── Form Fields ───────────────────────────────────────────────────────────
	let runnerId = $state('');
	let displayName = $state('');
	let pronouns = $state('');
	let location = $state('');
	let locationSearch = $state('');
	let representing = $state('');
	let representingSearch = $state('');
	let bio = $state('');
	let socialTwitch = $state('');
	let socialYoutube = $state('');
	let socialTwitter = $state('');
	let socialBluesky = $state('');
	let socialInstagram = $state('');
	let otherLinks = $state<string[]>(['']);

	// ── Country Typeahead ─────────────────────────────────────────────────────
	let locationSearchText = $state('');
	let representingSearchText = $state('');
	function filteredCountries(search: string) {
		if (!search.trim()) return COUNTRIES.slice(0, 20);
		const s = search.toLowerCase();
		return COUNTRIES.filter(c =>
			c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s)
		).slice(0, 20);
	}
	function handleLocationSelect(code: string) {
		location = code;
		const c = COUNTRIES.find(x => x.code === code);
		if (c) locationSearch = c.flag + ' ' + c.name;
		locationSearchText = '';
	}
	function clearLocation() {
		location = '';
		locationSearch = '';
		locationSearchText = '';
	}
	function handleRepresentingSelect(code: string) {
		representing = code;
		const c = COUNTRIES.find(x => x.code === code);
		if (c) representingSearch = c.flag + ' ' + c.name;
		representingSearchText = '';
	}
	function clearRepresenting() {
		representing = '';
		representingSearch = '';
		representingSearchText = '';
	}

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

	// ── Auto-fill from OAuth on mount ─────────────────────────────────────────
	onMount(() => {
		if (pageState !== 'create') return;
		if ($debugRole) return;
		if (!$user) return;

		const name = $user.user_metadata?.full_name || $user.user_metadata?.name || '';
		displayName = name;
		runnerId = generateRunnerId(name);
		if (runnerId.length >= 3) {
			validateRunnerId(runnerId);
		}
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
			if (representing) socials.representing = representing;
			const others = otherLinks.filter(l => l.trim());
			if (others.length > 0) socials.other = others;

			// Use pre-approved status from server data (avoids extra client-side query)
			const isPreApproved = data.isPreApproved === true;

			// Upsert pending_profiles with form data (insert if new user, update if existing)
			const { error } = await supabase
				.from('pending_profiles')
				.upsert({
					user_id: $user.id,
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
				}, { onConflict: 'user_id' });

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

				if (rpError) throw rpError;

				message = { type: 'success', text: 'Profile created! Redirecting...' };
				showToast('success', 'Profile created! Redirecting to your page...');
				setTimeout(() => goto(`/runners/${finalId}`), 1500);
			} else {
				// Notify staff via Discord that a profile needs review (best-effort)
				try {
					const token = await getAccessToken();
					if (token) {
						fetch(`${PUBLIC_WORKER_URL}/notify-profile-submitted`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
							body: JSON.stringify({ display_name: displayName.trim(), runner_id: finalId }),
						}).catch(() => {}); // fire-and-forget
					}
				} catch { /* non-critical */ }

				message = { type: 'success', text: 'Profile submitted for approval! Redirecting...' };
				showToast('success', 'Profile submitted for approval!');
				setTimeout(() => goto('/profile/status'), 1500);
			}
		} catch (err: any) {
			message = { type: 'error', text: err?.message || m.create_submit_error() };
			showToast('error', err?.message || m.create_submit_error());
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>{m.create_page_title()}</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="profile-create">
			<!-- Loading -->
			{#if pageState === 'loading'}
				<div class="card">
					<div class="sign-in-loading">
						<div class="spinner"></div>
						<p class="muted">{m.create_loading()}</p>
					</div>
				</div>

			<!-- Already has profile -->
			{:else if pageState === 'has-profile'}
				<div class="card">
					<h1>{m.create_has_profile()}</h1>
					<p class="muted">{m.create_has_profile_desc()}</p>
					<div class="profile-create__actions">
						<a href={localizeHref(`/runners/${existingRunnerId}`)} class="btn btn--primary">{m.create_view_profile()}</a>
						<a href={localizeHref("/profile/edit")} class="btn">{m.profile_edit()}</a>
					</div>
				</div>

			<!-- Pending -->
			{:else if pageState === 'has-pending'}
				<div class="card">
					<h1>{m.create_pending()}</h1>
					<p class="muted">{m.create_pending_desc()}</p>
					<a href={localizeHref("/profile/status")} class="btn btn--primary">{m.create_check_status()}</a>
				</div>

			<!-- Create Form -->
			{:else}
				<h1 class="page-title">{m.create_heading()}</h1>

				{#if message}
					<div class="form-message form-message--{message.type}">{message.text}</div>
				{/if}

				<div class="create-form">
					<!-- Sticky section indicator -->
					<div class="create-header">
						<div class="create-header__left">
							<p class="create-header__label">{m.create_set_up()}</p>
							<p class="muted create-header__sub">{m.create_customize_later()}</p>
						</div>
						<div class="create-header__right">
							<span class="create-header__step">{m.create_step()}</span>
						</div>
					</div>

					<!-- Linked Account -->
					<section class="form-section">
						<h2 class="form-section__title">{m.create_linked_account()}</h2>
						<div class="oauth-card">
							<img class="oauth-card__avatar" src={oauthAvatar} alt="" />
							<div class="oauth-card__info">
								<p class="oauth-card__name">{oauthName}</p>
								<p class="oauth-card__provider muted">{m.create_via_provider({ provider: oauthProvider.charAt(0).toUpperCase() + oauthProvider.slice(1) })}</p>
							</div>
						</div>
					</section>

					<!-- Basic Info -->
					<section class="form-section">
						<h2 class="form-section__title">{m.create_basic_info()}</h2>
						<p class="form-section__desc muted">{@html m.create_required_hint({ req: '<span class="required-marker">*</span>' })}</p>

						<div class="field">
							<label for="runner_id" class="field__label">{m.create_runner_id()} <span class="required-marker">*</span></label>
							<div class="field__hint">{m.create_runner_id_url()} <code>challengerun.net/runners/<strong>{runnerIdPreview}</strong>/</code></div>
							<input
								type="text" id="runner_id" class="field__input"
								class:is-valid={runnerIdStatus === 'valid'}
								class:is-invalid={runnerIdStatus === 'taken' || runnerIdStatus === 'invalid'}
								value={runnerId}
								oninput={onRunnerIdInput}
								placeholder={m.create_runner_id_placeholder()} required minlength="3" autocomplete="off"
							/>
							<div class="field__rules">
								<strong>{m.create_runner_id_format()}</strong> {m.create_runner_id_rules()}
							</div>
							<div class="field__validation"
								class:is-valid={runnerIdStatus === 'valid'}
								class:is-invalid={runnerIdStatus === 'taken' || runnerIdStatus === 'invalid'}
								class:is-checking={runnerIdStatus === 'checking'}
							>
								{#if runnerIdStatus === 'checking'}{m.create_checking()}
								{:else if runnerIdStatus === 'valid'}<span class="text-success">{m.create_available()}</span>
								{:else if runnerIdStatus === 'taken'}<span class="text-danger">{m.create_taken()}</span>
								{:else if runnerIdStatus === 'invalid'}<span class="text-danger">✗ {runnerIdError}</span>
								{/if}
							</div>
						</div>

						<!-- Display Name (70%) + Pronouns (30%) -->
						<div class="field-row field-row--70-30">
							<div class="field">
								<label for="display_name" class="field__label">{m.create_display_name()} <span class="required-marker">*</span></label>
								<div class="field__hint">{m.create_display_hint()}</div>
								<input type="text" id="display_name" class="field__input" bind:value={displayName} placeholder={m.create_display_placeholder()} minlength="2" maxlength="50" required />
							</div>
							<div class="field">
								<label for="pronouns" class="field__label">{m.create_pronouns()}</label>
								<div class="field__hint">&nbsp;</div>
								<input type="text" id="pronouns" class="field__input" bind:value={pronouns} placeholder={m.create_pronouns_placeholder()} maxlength="30" />
							</div>
						</div>

						<!-- Location + Representing (two-column) -->
						<div class="field-row">
							<div class="field field--flex">
								<label for="location" class="field__label">{m.create_location()}</label>
								<div class="country-combobox-wrap" oninput={(e: Event) => { locationSearchText = (e.target as HTMLInputElement).value; }}>
									<Combobox.Root class="country-combobox" bind:inputValue={locationSearch} onValueChange={(v: string) => handleLocationSelect(v)} onOpenChange={(o: boolean) => { if (!o) locationSearchText = ''; }}>
										<Combobox.Input placeholder={m.create_location_placeholder()} />
										<Combobox.Content>
											{#each filteredCountries(locationSearchText) as c}
												<Combobox.Item value={c.code} label="{c.flag} {c.name}" forceMount>{c.flag} {c.name}</Combobox.Item>
											{/each}
											{#if filteredCountries(locationSearchText).length === 0}
												<div class="combobox-empty">{m.create_no_countries()}</div>
											{/if}
										</Combobox.Content>
									</Combobox.Root>
									{#if location}
										<button type="button" class="combobox-clear" onclick={clearLocation} title="Clear"><X size={14} /></button>
									{/if}
								</div>
							</div>
							<div class="field field--flex">
								<label for="representing" class="field__label">{m.create_representing()}</label>
								<div class="country-combobox-wrap" oninput={(e: Event) => { representingSearchText = (e.target as HTMLInputElement).value; }}>
									<Combobox.Root class="country-combobox" bind:inputValue={representingSearch} onValueChange={(v: string) => handleRepresentingSelect(v)} onOpenChange={(o: boolean) => { if (!o) representingSearchText = ''; }}>
										<Combobox.Input placeholder={m.create_representing_placeholder()} />
										<Combobox.Content>
											{#each filteredCountries(representingSearchText) as c}
												<Combobox.Item value={c.code} label="{c.flag} {c.name}" forceMount>{c.flag} {c.name}</Combobox.Item>
											{/each}
											{#if filteredCountries(representingSearchText).length === 0}
												<div class="combobox-empty">{m.create_no_countries()}</div>
											{/if}
										</Combobox.Content>
									</Combobox.Root>
									{#if representing}
										<button type="button" class="combobox-clear" onclick={clearRepresenting} title="Clear"><X size={14} /></button>
									{/if}
								</div>
								<p class="field__hint" style="margin-top: 0.25rem;">{m.create_representing_hint()}</p>
							</div>
						</div>

						<div class="field">
							<label for="bio" class="field__label">{m.create_bio()}</label>
							<div class="field__hint">{m.create_bio_hint()}</div>
							<textarea id="bio" class="field__input field__textarea" bind:value={bio} placeholder={m.create_bio_placeholder()} maxlength="1000" rows="4"></textarea>
							<div class="field__char-count">{bioCount}/1000</div>
						</div>
					</section>

					<!-- Social Links -->
					<section class="form-section">
						<h2 class="form-section__title">{m.create_social_links()}</h2>
						<p class="form-section__desc muted">{m.create_social_hint()}</p>

						<div class="field-row">
							<div class="field">
								<label class="field__label">Twitch</label>
								<input type="url" class="field__input" bind:value={socialTwitch} placeholder="https://www.twitch.tv/your_username" />
							</div>
							<div class="field">
								<label class="field__label">YouTube</label>
								<input type="url" class="field__input" bind:value={socialYoutube} placeholder="https://www.youtube.com/@your_channel" />
							</div>
						</div>
						<div class="field-row">
							<div class="field">
								<label class="field__label">Twitter / X</label>
								<input type="url" class="field__input" bind:value={socialTwitter} placeholder="https://twitter.com/your_handle" />
							</div>
							<div class="field">
								<label class="field__label">Bluesky</label>
								<input type="url" class="field__input" bind:value={socialBluesky} placeholder="https://bsky.app/profile/your.handle" />
							</div>
						</div>
						<div class="field-row">
							<div class="field">
								<label class="field__label">Instagram</label>
								<input type="url" class="field__input" bind:value={socialInstagram} placeholder="https://www.instagram.com/your_username" />
							</div>
							<div class="field"></div>
						</div>

						{#each otherLinks as link, i}
							<div class="field field--other">
								<label class="field__label">{m.create_other_link()}</label>
								{#if i > 0}
									<button type="button" class="field__remove" onclick={() => otherLinks = otherLinks.filter((_, idx) => idx !== i)}>{m.create_remove()}</button>
								{/if}
								<input type="url" class="field__input" bind:value={otherLinks[i]} placeholder="https://your-website-or-social.com" />
							</div>
						{/each}
						{#if otherLinks.length < 3}
							<Button.Root size="sm" onclick={() => otherLinks = [...otherLinks, '']} style="margin-top: 0.5rem;">
								{m.create_add_link()}
							</Button.Root>
							<span class="muted" style="margin-left: 0.5rem; font-size: 0.85rem;">({otherLinks.length}/3)</span>
						{/if}
					</section>


					<!-- Submit -->
					<section class="form-section">
						<div class="customization-tip">
							<span class="customization-tip__icon">🎨</span>
							<div>
								<strong>{m.create_customization_tip()}</strong>
								<p class="muted">{m.create_customization_desc()}</p>
							</div>
						</div>

						<div class="moderation-notice">
							<strong>{m.create_moderation_notice()}</strong>
							<p class="muted">
								{m.create_moderation_desc()}
							</p>
						</div>

						<div class="form-actions">
							{#if bannedTermsWarning}
								<p class="form-message form-message--error">{bannedTermsWarning}</p>
							{/if}
							<Button.Root variant="accent" size="lg" onclick={handleSubmit} disabled={submitting || !!bannedTermsWarning}>
								{submitting ? `⏳ ${m.btn_submitting()}` : `🚀 ${m.btn_submit_for_review()}`}
							</Button.Root>
						</div>
					</section>
				</div>
			{/if}
		</div>
	</div>
</AuthGuard>

<style>
	.profile-create { max-width: 680px; margin: 0 auto; }
	.profile-create__actions { display: flex; gap: 1rem; margin-top: 1rem; }
	.sign-in-loading { text-align: center; padding: 2rem; }
	.page-title { font-size: 1.6rem; margin: 0 0 1.5rem; }

	/* Sticky header — sits at the top of the form, sticks on scroll */
	.create-header {
		display: flex; align-items: center; justify-content: space-between;
		position: sticky; top: 0; z-index: 50;
		background: var(--bg); padding: 0.75rem 0; margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}
	.create-header__label { margin: 0; font-size: 0.95rem; font-weight: 600; }
	.create-header__sub { margin: 0.1rem 0 0; font-size: 0.8rem; }
	.create-header__right { flex-shrink: 0; }
	.create-header__step {
		font-size: 0.75rem; font-weight: 600; color: var(--text-muted);
		background: var(--surface); padding: 0.3rem 0.65rem; border-radius: 4px;
		border: 1px solid var(--border);
	}

	/* Form sections */
	.form-section { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
	.form-section:last-child { border-bottom: none; }
	.form-section__title { font-size: 1.1rem; margin: 0 0 0.35rem; }
	.form-section__desc { font-size: 0.85rem; margin-bottom: 1.25rem; }

	/* OAuth card */
	.oauth-card {
		display: flex; align-items: center; gap: 1rem;
		padding: 1rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 10px;
	}
	.oauth-card__avatar { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--border); }
	.oauth-card__name { margin: 0; font-weight: 600; }
	.oauth-card__provider { margin: 0; font-size: 0.85rem; }

	/* Fields */
	.field { margin-bottom: 1.25rem; position: relative; }
	.field--flex { flex: 1; }
	.field-row { display: flex; gap: 1rem; }
	.field-row .field { flex: 1; }
	/* 70/30 column split */
	.field-row--70-30 > .field:first-child { flex: 7; }
	.field-row--70-30 > .field:last-child  { flex: 3; }
	.field__label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.35rem; }
	.field__hint { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; min-height: 1.1em; }
	.field__input {
		width: 100%; padding: 0.6rem 0.75rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 8px; color: var(--fg); font-size: 0.9rem; font-family: inherit; box-sizing: border-box;
	}
	.field__input:focus {
		outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
	}
	.field__textarea { resize: vertical; }
	.field__char-count { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }

	/* Runner ID validation */
	.field__rules {
		font-size: 0.8rem; color: var(--muted); margin: 0.25rem 0 0.5rem; padding: 0.5rem 0.75rem;
		background: var(--surface); border-radius: 6px; border-left: 3px solid var(--accent); line-height: 1.5;
	}
	.field__validation { font-size: 0.85rem; margin-top: 0.25rem; min-height: 1.25rem; }
	.field__validation.is-valid { color: #28a745; }
	.field__validation.is-invalid { color: #dc3545; }
	.field__validation.is-checking { color: var(--muted); }
	.field__input.is-valid { border-color: #28a745; }
	.field__input.is-invalid { border-color: #dc3545; }

	/* Country combobox */
	.country-combobox-wrap { position: relative; }
	.combobox-clear {
		position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
		background: none; border: none; color: var(--muted); cursor: pointer;
		font-size: 0.85rem; padding: 2px 6px; border-radius: 4px; z-index: 1;
	}
	.combobox-clear:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
	.combobox-empty { padding: 0.5rem 0.65rem; color: var(--muted); font-size: 0.85rem; }

	/* Other links */
	.field--other { position: relative; }
	.field__remove {
		position: absolute; right: 0; top: 0; background: none; border: none;
		color: #dc3545; cursor: pointer; font-size: 0.85rem; padding: 0.25rem 0.5rem;
	}
	.field__remove:hover { text-decoration: underline; }

	/* Customization tip */
	.customization-tip {
		display: flex; gap: 1rem; padding: 1rem; margin-bottom: 1.5rem;
		background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.15);
		border-radius: 10px;
	}
	.customization-tip__icon { font-size: 1.5rem; flex-shrink: 0; }
	.customization-tip strong { display: block; margin-bottom: 0.15rem; }
	.customization-tip p { margin: 0; font-size: 0.85rem; }

	/* Moderation notice */
	.moderation-notice {
		padding: 1rem; background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.15);
		border-radius: 10px; margin-bottom: 1.5rem;
	}
	.moderation-notice p { margin: 0.35rem 0 0; font-size: 0.85rem; }

	/* Messages */
	.form-message { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.9rem; }
	.form-message--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.form-message--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	/* Actions */
	.form-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 1rem; }

	/* Markers */
	.required-marker { color: #dc3545; }
	.text-success { color: #28a745; }
	.text-danger { color: #dc3545; }

	/* Buttons */
	.btn {
		display: inline-flex; align-items: center; padding: 0.5rem 1.25rem; border-radius: 8px;
		font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none;
		border: 1px solid var(--border); background: none; color: var(--fg); font-family: inherit;
	}
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn--lg { padding: 0.65rem 1.75rem; font-size: 1rem; font-weight: 600; }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }

	.spinner {
		width: 36px; height: 36px; border: 3px solid var(--border);
		border-top-color: var(--accent); border-radius: 50%;
		margin: 0 auto 1rem; animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 600px) {
		.field-row, .field-row--70-30 { flex-direction: column; gap: 0; }
		.profile-create__actions { flex-direction: column; }
	}
</style>
