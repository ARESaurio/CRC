<script lang="ts">
	import { session, user } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { isValidVideoUrl } from '$lib/utils';
	import { checkBannedTerms } from '$lib/utils/banned-terms';

	let { data } = $props();
	const game = $derived(data.game);
	const platforms = $derived(data.platforms || []);

	// ── Form State ──
	let categoryTier = $state('');
	let categorySlug = $state('');
	let selectedChallenges = $state<string[]>([]);
	let character = $state('');
	let glitchId = $state('');
	let selectedRestrictions = $state<string[]>([]);
	let videoUrl = $state('');
	let platform = $state('');
	let dateCompleted = $state('');
	let runTimeRta = $state('');
	let runTimePrimary = $state('');
	let submitterNotes = $state('');

	// ── Video Metadata State ──
	let videoTitle = $state('');
	let videoFetching = $state(false);
	let videoFetchError = $state('');

	// ── UI State ──
	let submitting = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// ── Game timing config ──
	const gameTimingMethod = $derived(game.timing_method || '');
	const hasGameTiming = $derived(!!gameTimingMethod && gameTimingMethod.toLowerCase() !== 'rta');
	const gameTimingLabel = $derived(gameTimingMethod || 'Primary Time');
	// RTA is always available unless game explicitly removes it
	// If game timing IS rta, we only show one field
	const showRtaSeparately = $derived(hasGameTiming);

	// ── Derived category options ──
	const tierOptions = $derived(() => {
		const tiers: { value: string; label: string; categories: { slug: string; label: string; fixed_loadout?: any }[] }[] = [];
		if (game.full_runs?.length) tiers.push({ value: 'full_runs', label: 'Full Runs', categories: game.full_runs.map((c: any) => ({ slug: c.slug, label: c.label, fixed_loadout: c.fixed_loadout })) });
		if (game.mini_challenges?.length) {
			const cats: { slug: string; label: string; fixed_loadout?: any }[] = [];
			for (const group of game.mini_challenges) {
				if (group.children?.length) {
					for (const child of group.children) cats.push({ slug: child.slug, label: `${group.label} › ${child.label}`, fixed_loadout: child.fixed_loadout });
				} else {
					cats.push({ slug: group.slug, label: group.label, fixed_loadout: group.fixed_loadout });
				}
			}
			tiers.push({ value: 'mini_challenges', label: 'Mini-Challenges', categories: cats });
		}
		if (game.player_made?.length) tiers.push({ value: 'player_made', label: 'Player-Made', categories: game.player_made.map((c: any) => ({ slug: c.slug, label: c.label, fixed_loadout: c.fixed_loadout })) });
		return tiers;
	});

	const currentTier = $derived(tierOptions().find(t => t.value === categoryTier));
	const categoryOptions = $derived(currentTier?.categories || []);

	// ── Fixed Loadout ──
	const selectedCategory = $derived(categoryOptions.find(c => c.slug === categorySlug));
	const fixedLoadout = $derived(selectedCategory?.fixed_loadout?.enabled ? selectedCategory.fixed_loadout : null);

	// Pre-fill locked fields when a fixed-loadout category is selected
	$effect(() => {
		const fl = fixedLoadout;
		if (fl) {
			if (fl.character) character = fl.character;
			if (fl.challenge) selectedChallenges = [fl.challenge];
			if (fl.restriction) selectedRestrictions = [fl.restriction];
		}
	});

	// Clear fixed values when switching to a non-fixed category
	let prevCategorySlug = $state('');
	$effect(() => {
		if (categorySlug !== prevCategorySlug) {
			const prevCat = categoryOptions.find(c => c.slug === prevCategorySlug);
			const prevFl = prevCat?.fixed_loadout?.enabled ? prevCat.fixed_loadout : null;
			if (prevFl && !fixedLoadout) {
				// Was fixed, now isn't — clear the locked values
				if (prevFl.character) character = '';
				if (prevFl.challenge) selectedChallenges = selectedChallenges.filter(c => c !== prevFl.challenge);
				if (prevFl.restriction) selectedRestrictions = selectedRestrictions.filter(r => r !== prevFl.restriction);
			}
			prevCategorySlug = categorySlug;
		}
	});

	// ── Validation ──
	const videoValid = $derived(!videoUrl || isValidVideoUrl(videoUrl));
	const notesWarning = $derived(checkBannedTerms(submitterNotes));
	const canSubmit = $derived(
		!!$session &&
		!!categoryTier &&
		!!categorySlug &&
		!!videoUrl &&
		videoValid &&
		!notesWarning &&
		!submitting
	);

	// ── Video Title Fetch ──
	let fetchDebounce: ReturnType<typeof setTimeout> | null = null;

	function onVideoUrlChange() {
		videoTitle = '';
		videoFetchError = '';
		if (fetchDebounce) clearTimeout(fetchDebounce);
		if (!videoUrl || !isValidVideoUrl(videoUrl)) return;
		videoFetching = true;
		fetchDebounce = setTimeout(() => fetchVideoMeta(videoUrl), 600);
	}

	async function fetchVideoMeta(url: string) {
		try {
			const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
			if (!res.ok) throw new Error('Fetch failed');
			const json = await res.json();
			if (json.error) {
				videoFetchError = 'Could not retrieve video info.';
			} else {
				videoTitle = json.title || '';
				// Try to extract upload date from YouTube video
				if (!dateCompleted && json.upload_date) {
					// noembed sometimes returns upload_date as YYYY-MM-DD
					dateCompleted = json.upload_date;
				}
			}
		} catch {
			videoFetchError = 'Could not retrieve video info.';
		} finally {
			videoFetching = false;
		}
	}

	// Auto-fetch when video URL changes
	$effect(() => {
		videoUrl;
		onVideoUrlChange();
	});

	// ── Helpers ──
	function toggleChallenge(slug: string) {
		if (selectedChallenges.includes(slug)) {
			selectedChallenges = selectedChallenges.filter(c => c !== slug);
		} else {
			selectedChallenges = [...selectedChallenges, slug];
		}
	}

	function toggleRestriction(slug: string) {
		if (selectedRestrictions.includes(slug)) {
			selectedRestrictions = selectedRestrictions.filter(r => r !== slug);
		} else {
			selectedRestrictions = [...selectedRestrictions, slug];
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		submitting = true;
		errorMsg = '';
		successMsg = '';

		try {
			const { data: userData } = await supabase.auth.getUser();
			if (!userData?.user) throw new Error('You must be signed in to submit a run.');

			const { data: profile } = await supabase
				.from('profiles')
				.select('runner_id, status')
				.eq('user_id', userData.user.id)
				.single();

			if (!profile?.runner_id) {
				errorMsg = 'You need a runner ID to submit runs.';
				goto(`/profile/setup?next=${encodeURIComponent($page.url.pathname)}`);
				return;
			}
			if (profile.status !== 'approved') {
				throw new Error('Your profile is still pending approval. You can browse the site, but submissions are locked until an admin approves your profile.');
			}

			const payload: Record<string, any> = {
				schema_version: 7,
				game_id: game.game_id,
				category_tier: categoryTier,
				category: categorySlug,
				standard_challenges: selectedChallenges,
				character: character || undefined,
				glitch_id: glitchId || undefined,
				restrictions: selectedRestrictions.length > 0 ? selectedRestrictions : undefined,
				platform: platform || undefined,
				runner_id: profile.runner_id,
				video_url: videoUrl,
				submitted_at: new Date().toISOString(),
				submitter_notes: submitterNotes.trim() || undefined,
			};

			// Date (optional)
			if (dateCompleted) payload.run_date = dateCompleted;

			// Timing: RTA is always captured
			if (runTimeRta) payload.time_rta = runTimeRta;

			// Game-specific timing (IGT, etc.)
			if (showRtaSeparately && runTimePrimary) {
				payload.time_primary = runTimePrimary;
			} else if (!showRtaSeparately && runTimeRta) {
				// If game timing IS rta (or unset), time_primary = rta
				payload.time_primary = runTimeRta;
			}

			const { error } = await supabase.from('pending_runs').insert(payload);
			if (error) throw error;

			successMsg = 'Run submitted successfully! A verifier will review it shortly.';
			categoryTier = ''; categorySlug = ''; selectedChallenges = []; character = '';
			glitchId = ''; selectedRestrictions = []; videoUrl = ''; platform = ''; dateCompleted = '';
			runTimeRta = ''; runTimePrimary = ''; submitterNotes = ''; videoTitle = '';
		} catch (err: any) {
			errorMsg = err.message || 'Submission failed. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Submit Run - {game.game_name} | CRC</title>
</svelte:head>

<h2>Submit a {game.game_name} Run</h2>
<p class="muted mb-3">
	Fill in your run details below. All options are specific to {game.game_name}.
	<span class="required-hint"><span class="req">*</span> indicates required fields</span>
</p>

{#if !$session}
	<div class="card">
		<div class="empty-state">
			<span class="empty-state__icon">🔐</span>
			<h3>Sign In Required</h3>
			<p class="muted">You need to be signed in to submit a run.</p>
			<a href="/sign-in?redirect=/games/{game.game_id}/submit" class="btn btn--accent mt-2">Sign In</a>
		</div>
	</div>
{:else if successMsg}
	<div class="card">
		<div class="success-state">
			<span class="success-state__icon">✅</span>
			<h3>Submitted!</h3>
			<p class="muted">{successMsg}</p>
			<div class="success-actions">
				<button class="btn btn--accent" onclick={() => successMsg = ''}>Submit Another</button>
				<a href="/games/{game.game_id}/runs" class="btn">View Runs</a>
			</div>
		</div>
	</div>
{:else}
	<form class="submit-form" onsubmit={handleSubmit}>
		<!-- Category Selection -->
		<div class="submit-section">
			<p class="submit-section__title">Category <span class="req">*</span></p>
			<p class="submit-section__sub">Select the run tier and category.</p>
			<div class="field-row">
				<div class="field">
					<label for="tier" class="field-label">Tier <span class="req">*</span></label>
					<select id="tier" bind:value={categoryTier} required>
						<option value="">Select tier...</option>
						{#each tierOptions() as tier}
							<option value={tier.value}>{tier.label}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="category" class="field-label">Category <span class="req">*</span></label>
					<select id="category" bind:value={categorySlug} required disabled={!categoryTier}>
						<option value="">Select category...</option>
						{#each categoryOptions as cat}
							<option value={cat.slug}>{cat.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- Challenges -->
		{#if game.challenges_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">Challenges{#if fixedLoadout?.challenge} <span class="fixed-badge">🔒 Fixed</span>{/if}</p>
				<p class="submit-section__sub">Select all challenges completed in this run.</p>
				<div class="chip-grid">
					{#each game.challenges_data as ch}
						{@const isLocked = fixedLoadout?.challenge === ch.slug}
						<button type="button" class="chip" class:chip--active={selectedChallenges.includes(ch.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleChallenge(ch.slug); }} disabled={isLocked}>{ch.label}{#if isLocked} 🔒{/if}</button>
					{/each}
				</div>
				{#if fixedLoadout?.challenge}
					<span class="field-hint mt-1">This challenge is required for the selected category.</span>
				{/if}
			</div>
		{/if}

		<!-- Character -->
		{#if game.character_column?.enabled && game.characters_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">{game.character_column.label}{#if fixedLoadout?.character} <span class="fixed-badge">🔒 Fixed</span>{/if}</p>
				<div class="field">
					<select bind:value={character} disabled={!!fixedLoadout?.character}>
						<option value="">Select {game.character_column.label.toLowerCase()}...</option>
						{#each game.characters_data as ch}
							<option value={ch.slug}>{ch.label}</option>
						{/each}
					</select>
					{#if fixedLoadout?.character}
						<span class="field-hint">Locked by category — this {game.character_column.label.toLowerCase()} is required for this challenge.</span>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Glitch Category -->
		{#if game.glitches_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">Glitch Category</p>
				<div class="field">
					<select bind:value={glitchId}>
						<option value="">Select glitch policy...</option>
						{#each game.glitches_data as g}
							<option value={g.slug}>{g.label}</option>
						{/each}
					</select>
				</div>
			</div>
		{/if}

		<!-- Restrictions -->
		{#if game.restrictions_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">Restrictions{#if fixedLoadout?.restriction} <span class="fixed-badge">🔒 Fixed</span>{/if}</p>
				<p class="submit-section__sub">Select any optional restrictions applied to this run.</p>
				<div class="chip-grid">
					{#each game.restrictions_data as r}
						{@const isLocked = fixedLoadout?.restriction === r.slug}
						<button type="button" class="chip" class:chip--active={selectedRestrictions.includes(r.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleRestriction(r.slug); }} disabled={isLocked}>{r.label}{#if isLocked} 🔒{/if}</button>
					{/each}
				</div>
				{#if fixedLoadout?.restriction}
					<span class="field-hint mt-1">This restriction is required for the selected category.</span>
				{/if}
			</div>
		{/if}

		<!-- Video Proof -->
		<div class="submit-section">
			<p class="submit-section__title">Video Proof <span class="req">*</span></p>
			<div class="field">
				<label for="video" class="field-label">Video URL <span class="req">*</span></label>
				<input id="video" type="url" bind:value={videoUrl} required placeholder="https://youtube.com/watch?v=..." class:field--error={videoUrl && !videoValid} />
				{#if videoUrl && !videoValid}
					<span class="field-error">Must be a YouTube, Twitch, or supported video URL</span>
				{/if}
			</div>
			{#if videoFetching}
				<div class="video-meta"><span class="spinner spinner--small"></span> <span class="muted">Fetching video info...</span></div>
			{/if}
			{#if videoTitle}
				<div class="video-meta video-meta--success">
					<span class="video-meta__icon">🎬</span>
					<span class="video-meta__title">{videoTitle}</span>
				</div>
			{/if}
			{#if videoFetchError}
				<div class="video-meta video-meta--warn"><span class="muted">{videoFetchError}</span></div>
			{/if}
		</div>

		<!-- Platform -->
		<div class="submit-section">
			<p class="submit-section__title">Platform</p>
			<p class="submit-section__sub">What platform did you play on? Optional but helpful for verification.</p>
			<div class="field" style="max-width: 300px;">
				<select bind:value={platform}>
					<option value="">Select platform...</option>
					{#each platforms as p}
						<option value={p.id}>{p.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Run Timing -->
		<div class="submit-section">
			<p class="submit-section__title">Run Timing</p>
			<p class="submit-section__sub">
				{#if showRtaSeparately}
					Enter your RTA (real-time) and {gameTimingLabel} times. Both are optional but help with verification.
				{:else}
					Enter your run time. Format: HH:MM:SS or MM:SS. Optional but recommended.
				{/if}
			</p>
			<div class="field-row">
				{#if showRtaSeparately}
					<div class="field">
						<label for="time-primary" class="field-label">{gameTimingLabel} Time</label>
						<input id="time-primary" type="text" bind:value={runTimePrimary} placeholder="HH:MM:SS or MM:SS" />
						<span class="field-hint">{game.game_name}'s tracked timing</span>
					</div>
				{:else}
					<div class="field"></div>
				{/if}
				<div class="field">
					<label for="time-rta" class="field-label">RTA Time</label>
					<input id="time-rta" type="text" bind:value={runTimeRta} placeholder="HH:MM:SS or MM:SS" />
					<span class="field-hint">Real-time (wall clock)</span>
				</div>
			</div>
		</div>

		<!-- Date Completed -->
		<div class="submit-section">
			<p class="submit-section__title">Date Completed</p>
			<p class="submit-section__sub">When was this run completed? Optional — will use submission date if left blank.</p>
			<div class="field" style="max-width: 240px;">
				<input id="date" type="date" bind:value={dateCompleted} max={new Date().toISOString().split('T')[0]} />
			</div>
		</div>

		<!-- Runner Notes -->
		<div class="submit-section">
			<p class="submit-section__title">Runner Notes</p>
			<p class="submit-section__sub">Optional notes about your run (strategy, memorable moments, attempts count, etc.). Max 500 characters.</p>
			<div class="field">
				<textarea
					bind:value={submitterNotes}
					placeholder="e.g. 'First clear after 47 attempts! Almost died to the final boss.'"
					maxlength="500"
					rows="3"
					class:field--error={!!notesWarning}
				></textarea>
				<div class="field-row-between">
					{#if notesWarning}
						<span class="field-error">{notesWarning}</span>
					{:else}
						<span></span>
					{/if}
					<span class="field-hint">{submitterNotes.length}/500</span>
				</div>
			</div>
		</div>

		<!-- Error Message -->
		{#if errorMsg}
			<div class="submit-error">{errorMsg}</div>
		{/if}

		<!-- Submit -->
		<div class="submit-actions">
			<button type="submit" class="btn" class:btn--accent={canSubmit} class:btn--muted={!canSubmit} disabled={!canSubmit}>
				{#if submitting}
					<span class="spinner spinner--small"></span> Submitting...
				{:else}
					Submit Run
				{/if}
			</button>
		</div>
	</form>
{/if}

<style>
	h2 { margin: 0 0 0.25rem; text-align: center; }
	.mb-3 { margin-bottom: 1rem; text-align: center; }
	.mt-1 { margin-top: 0.5rem; }
	.mt-2 { margin-top: 0.75rem; }
	.mt-section { margin-top: 1.5rem; }
	.required-hint { font-size: 0.8rem; }
	.req { color: #ef4444; font-weight: 600; }

	.empty-state, .success-state { text-align: center; padding: 2rem 1rem; max-width: 720px; margin: 0 auto; }
	.empty-state__icon, .success-state__icon { display: block; font-size: 3rem; margin-bottom: 0.75rem; opacity: 0.5; }
	.empty-state h3, .success-state h3 { margin: 0 0 0.5rem; }
	.empty-state p, .success-state p { margin: 0; max-width: 400px; margin-inline: auto; }
	.success-actions { display: flex; gap: 0.75rem; justify-content: center; margin-top: 1rem; }

	.submit-form { display: flex; flex-direction: column; gap: 1.5rem; max-width: 720px; margin: 0 auto; }
	.submit-section { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; }
	.submit-section__title { margin: 0 0 0.25rem; font-weight: 600; font-size: 0.95rem; }
	.submit-section__sub { margin: 0 0 0.75rem; font-size: 0.8rem; color: var(--text-muted); }

	.field { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem; }
	.field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
	.field-hint { font-size: 0.75rem; color: var(--text-muted); }
	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.field-row-between { display: flex; justify-content: space-between; align-items: center; }

	input, select, textarea {
		width: 100%; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; resize: vertical;
	}
	input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(var(--accent-rgb, 59, 195, 110), 0.15); }
	input:hover:not(:disabled):not(:focus), select:hover:not(:disabled):not(:focus), textarea:hover:not(:disabled):not(:focus) { border-color: color-mix(in srgb, var(--border) 50%, var(--accent)); }
	input::placeholder, textarea::placeholder { color: var(--border); }
	select:disabled { opacity: 0.5; }
	.field--error { border-color: #ef4444 !important; }
	.field-error { color: #ef4444; font-size: 0.75rem; }

	/* Video meta */
	.video-meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.85rem; }
	.video-meta--success { padding: 0.5rem 0.75rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; }
	.video-meta--warn { padding: 0.4rem 0.75rem; background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.15); border-radius: 6px; }
	.video-meta__icon { font-size: 1rem; }
	.video-meta__title { color: var(--fg); font-weight: 500; }

	/* Chip Grid */
	.chip-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.chip {
		padding: 0.4rem 0.75rem; border-radius: 20px; font-size: 0.8rem; font-family: inherit;
		background: var(--surface); border: 1px solid var(--border); color: var(--fg);
		cursor: pointer; transition: all 0.15s;
	}
	.chip:hover { border-color: var(--accent); }
	.chip--active { background: var(--accent); color: #fff; border-color: var(--accent); }
	.chip--locked { opacity: 0.85; cursor: not-allowed; }
	.chip--locked.chip--active { background: var(--accent); border-color: var(--accent); }

	/* Fixed loadout badge */
	.fixed-badge { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; font-weight: 600; color: var(--accent); background: rgba(99, 102, 241, 0.08); padding: 0.1rem 0.4rem; border-radius: 4px; vertical-align: middle; }

	.submit-actions { display: flex; gap: 0.75rem; align-items: center; justify-content: flex-end; }
	.btn--accent {
		background: var(--accent); color: #fff; padding: 0.6rem 1.5rem; border-radius: 8px;
		border: 1px solid var(--accent); font-weight: 600; font-size: 0.95rem; cursor: pointer; text-decoration: none;
		display: inline-flex; align-items: center; gap: 0.5rem;
		box-shadow: 0 0 12px rgba(var(--accent-rgb, 59, 195, 110), 0.3);
		transition: opacity 0.15s, box-shadow 0.15s;
	}
	.btn--accent:hover { opacity: 0.9; }
	.btn--muted {
		padding: 0.6rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem;
		display: inline-flex; align-items: center; gap: 0.5rem;
		background: var(--surface); color: var(--muted); border: 1px solid var(--border);
		cursor: not-allowed; opacity: 0.6;
	}
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); text-decoration: none; font-size: 0.9rem; cursor: pointer; }

	.submit-error { padding: 0.6rem 0.75rem; border-radius: 6px; font-size: 0.85rem; background: rgba(231,76,60,0.15); color: #e74c3c; border: 1px solid rgba(231,76,60,0.3); }

	.spinner--small { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; display: inline-block; animation: spin 0.6s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 640px) {
		.field-row { grid-template-columns: 1fr; }
		.submit-actions { flex-direction: column; }
		.btn--accent, .btn { width: 100%; justify-content: center; text-align: center; }
	}
</style>
