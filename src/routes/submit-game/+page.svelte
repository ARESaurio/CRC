<script lang="ts">
	import { PUBLIC_WORKER_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import AuthGuard from '$components/auth/AuthGuard.svelte';

	let { data } = $props();
	let genres = $derived(data.genres);
	let platforms = $derived(data.platforms);

	// ── Form State ────────────────────────────────────────────
	// Section 1: Game Info
	let gameName = $state('');
	let aliases = $state('');
	let description = $state('');

	// Section 2: Platforms & Genres
	let selectedPlatforms = $state<string[]>([]);
	let selectedGenres = $state<string[]>([]);
	let platformSearch = $state('');

	let filteredPlatforms = $derived.by(() => {
		if (!platformSearch.trim()) return platforms;
		const q = platformSearch.toLowerCase();
		return platforms.filter((p: any) => p.label.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
	});

	function togglePlatform(slug: string) {
		if (selectedPlatforms.includes(slug)) {
			selectedPlatforms = selectedPlatforms.filter(s => s !== slug);
		} else {
			selectedPlatforms = [...selectedPlatforms, slug];
		}
	}
	function toggleGenre(slug: string) {
		if (selectedGenres.includes(slug)) {
			selectedGenres = selectedGenres.filter(s => s !== slug);
		} else {
			selectedGenres = [...selectedGenres, slug];
		}
	}

	// Section 3: Categories
	let fullRunCategories = $state<string[]>(['']);
	let miniChallengeCategories = $state<string[]>([]);

	function addFullRun() { fullRunCategories = [...fullRunCategories, '']; }
	function removeFullRun(i: number) { fullRunCategories = fullRunCategories.filter((_, idx) => idx !== i); }
	function addMiniChallenge() { miniChallengeCategories = [...miniChallengeCategories, '']; }
	function removeMiniChallenge(i: number) { miniChallengeCategories = miniChallengeCategories.filter((_, idx) => idx !== i); }

	// Section 4: Challenges
	const STANDARD_CHALLENGES = [
		'Hitless', 'Damageless', 'Deathless', 'Flawless',
		'Blindfolded', 'Minimalist', 'Pacifist', 'Speedrun'
	];
	let selectedChallenges = $state<string[]>([]);
	let customChallenges = $state<string[]>([]);

	function toggleChallenge(c: string) {
		if (selectedChallenges.includes(c)) {
			selectedChallenges = selectedChallenges.filter(s => s !== c);
		} else {
			selectedChallenges = [...selectedChallenges, c];
		}
	}
	function addCustomChallenge() { customChallenges = [...customChallenges, '']; }
	function removeCustomChallenge(i: number) { customChallenges = customChallenges.filter((_, idx) => idx !== i); }

	// Section 5: Characters
	let characterEnabled = $state(false);
	let characterLabel = $state('Character');
	let characterOptions = $state<string[]>([]);

	function addCharacter() { characterOptions = [...characterOptions, '']; }
	function removeCharacter(i: number) { characterOptions = characterOptions.filter((_, idx) => idx !== i); }

	// Section 6: Restrictions
	let restrictions = $state<string[]>([]);
	function addRestriction() { restrictions = [...restrictions, '']; }
	function removeRestriction(i: number) { restrictions = restrictions.filter((_, idx) => idx !== i); }

	// Section 7: Timing
	let timingMethod = $state('RTA');
	const TIMING_OPTIONS = [
		{ value: 'RTA', label: 'RTA (Real Time Attack)' },
		{ value: 'IGT', label: 'IGT (In-Game Time)' },
		{ value: 'LRT', label: 'LRT (Load-Removed Time)' },
	];

	// Section 8: Glitches
	const GLITCH_PRESETS = ['Unrestricted', 'No Major Glitches (NMG)', 'Glitchless'];
	let selectedGlitches = $state<string[]>([]);
	let customGlitches = $state<string[]>([]);
	let glitchDocLinks = $state('');

	function toggleGlitch(g: string) {
		if (selectedGlitches.includes(g)) {
			selectedGlitches = selectedGlitches.filter(s => s !== g);
		} else {
			selectedGlitches = [...selectedGlitches, g];
		}
	}
	function addCustomGlitch() { customGlitches = [...customGlitches, '']; }
	function removeCustomGlitch(i: number) { customGlitches = customGlitches.filter((_, idx) => idx !== i); }

	// Section 9: Rules
	let generalRules = $state('');

	// Section 10: Involvement & Notes
	const INVOLVEMENT_OPTIONS = [
		'I would like to be credited for helping set this page up.',
		'I am interested in helping moderate this game.',
		'I am interested in helping verify runs for this game.',
	];
	let involvement = $state<string[]>([]);
	let additionalNotes = $state('');

	function toggleInvolvement(opt: string) {
		if (involvement.includes(opt)) {
			involvement = involvement.filter(s => s !== opt);
		} else {
			involvement = [...involvement, opt];
		}
	}

	// ── Turnstile ─────────────────────────────────────────────
	let turnstileToken = $state('');
	let turnstileReady = $state(false);
	let turnstileWidgetId = $state<string | null>(null);

	$effect(() => {
		if (!document.querySelector('script[src*="turnstile"]')) {
			const script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
			script.async = true;
			document.head.appendChild(script);
		}

		(window as any).onTurnstileLoad = () => {
			turnstileReady = true;
			renderTurnstile();
		};

		if ((window as any).turnstile) {
			turnstileReady = true;
			renderTurnstile();
		}
	});

	function renderTurnstile() {
		const container = document.getElementById('turnstile-container-game');
		if (!container || !(window as any).turnstile) return;
		if (turnstileWidgetId !== null) {
			(window as any).turnstile.reset(turnstileWidgetId);
			return;
		}
		turnstileWidgetId = (window as any).turnstile.render('#turnstile-container-game', {
			sitekey: PUBLIC_TURNSTILE_SITE_KEY,
			callback: (token: string) => { turnstileToken = token; },
			'expired-callback': () => { turnstileToken = ''; },
			theme: 'auto'
		});
	}

	// ── Validation ────────────────────────────────────────────
	const bannedTermsWarning = $derived.by(() => {
		const fields = [
			{ label: 'Game name', value: gameName },
			{ label: 'Description', value: description },
			{ label: 'Rules', value: generalRules },
			{ label: 'Notes', value: additionalNotes },
			{ label: 'Aliases', value: aliases },
		];
		for (const f of fields) {
			const result = checkBannedTerms(f.value);
			if (result) return `${f.label}: ${result}`;
		}
		return null;
	});

	let submitting = $state(false);
	let result = $state<{ ok: boolean; message: string } | null>(null);

	let canSubmit = $derived(gameName.trim() && turnstileToken && !submitting && !bannedTermsWarning);

	// ── Collapsible sections ──────────────────────────────────
	let openSections = $state<Record<string, boolean>>({
		info: true, platforms: true, categories: true,
		challenges: false, characters: false, restrictions: false,
		timing: false, glitches: false, rules: false, involvement: false
	});

	function toggleSection(key: string) {
		openSections = { ...openSections, [key]: !openSections[key] };
	}

	// ── Submit ────────────────────────────────────────────────
	async function handleSubmit() {
		if (!canSubmit || !$user) return;
		submitting = true;
		result = null;

		const clean = (arr: string[]) => arr.map(s => s.trim()).filter(Boolean);
		const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

		const allChallenges = [
			...selectedChallenges.map(c => ({ slug: slugify(c), label: c })),
			...clean(customChallenges).map(c => ({ slug: slugify(c), label: c })),
		];
		const allGlitches = [
			...selectedGlitches.map(g => ({ slug: slugify(g), label: g })),
			...clean(customGlitches).map(g => ({ slug: slugify(g), label: g })),
		];

		const payload = {
			game_name: gameName.trim(),
			aliases: clean(aliases.split(',')),
			description: description.trim() || null,
			platforms: selectedPlatforms,
			genres: selectedGenres,
			full_run_categories: clean(fullRunCategories).map(c => ({ slug: slugify(c), label: c })),
			mini_challenges: clean(miniChallengeCategories).map(c => ({ slug: slugify(c), label: c })),
			challenges: allChallenges,
			character_enabled: characterEnabled,
			character_label: characterLabel.trim() || 'Character',
			characters: clean(characterOptions).map(c => ({ slug: slugify(c), label: c })),
			restrictions: clean(restrictions).map(r => ({ slug: slugify(r), label: r })),
			timing_method: timingMethod,
			glitches: allGlitches,
			glitch_doc_links: glitchDocLinks.trim() || null,
			general_rules: generalRules.trim() || null,
			involvement,
			additional_notes: additionalNotes.trim() || null,
			turnstile_token: turnstileToken,
		};

		try {
			// Get auth token (sent in body, matching worker pattern)
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess?.access_token) throw new Error('Not authenticated. Please sign in again.');

			const res = await fetch(`${PUBLIC_WORKER_URL}/submit-game`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...payload, token: sess.access_token })
			});
			const data = await res.json();
			if (res.ok && data.ok) {
				result = { ok: true, message: 'Game submitted for review! Our team will review your request and set up the game page if approved.' };
				window.scrollTo({ top: 0, behavior: 'smooth' });
			} else {
				result = { ok: false, message: data.error || 'Submission failed. Please try again.' };
			}
		} catch (err: any) {
			result = { ok: false, message: err?.message || 'Network error. Please check your connection.' };
		} finally {
			submitting = false;
			if (turnstileWidgetId !== null && (window as any).turnstile) {
				(window as any).turnstile.reset(turnstileWidgetId);
				turnstileToken = '';
			}
		}
	}
</script>

<svelte:head><title>Request a Game | Challenge Run Community</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="submit-page">
			<h1>Request a Game</h1>
			<p class="page-desc">Suggest a new game for the Challenge Run Community. Fill in as much as you can — our team will review and refine.</p>
			<p class="page-desc muted">Fields marked <span class="req">*</span> are required. Everything else is optional but helps us set up the game faster.</p>

			{#if result}
				<div class="alert alert--{result.ok ? 'success' : 'error'}">{result.message}</div>
				{#if result.ok}
					<div class="success-actions">
						<a href="/games" class="btn">Browse Games</a>
						<button class="btn btn--accent" onclick={() => { result = null; gameName = ''; }}>Submit Another</button>
					</div>
				{/if}
			{/if}

			{#if !result?.ok}
				<div class="form-sections">

					<!-- ═══ Section 1: Game Info ═══ -->
					<section class="form-section" class:open={openSections.info}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('info')}>
							<span class="section-toggle__label">🎮 Game Info</span>
							<span class="section-toggle__chevron">{openSections.info ? '▲' : '▼'}</span>
						</button>
						{#if openSections.info}
							<div class="section-body">
								<div class="fg">
									<label class="fl" for="gameName">Game Name <span class="req">*</span></label>
									<input id="gameName" type="text" class="fi" bind:value={gameName} placeholder="e.g. Hollow Knight" maxlength="200" />
								</div>
								<div class="fg">
									<label class="fl" for="aliases">Short Names / Aliases</label>
									<input id="aliases" type="text" class="fi" bind:value={aliases} placeholder="e.g. HK, Hollow Knight: Voidheart Edition" maxlength="500" />
									<p class="fh">Comma-separated. Other names people use for this game.</p>
								</div>
								<div class="fg">
									<label class="fl" for="description">Description</label>
									<textarea id="description" class="fi" bind:value={description} placeholder="Brief description of the game and why it fits CRC..." rows="3" maxlength="2000"></textarea>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 2: Platforms & Genres ═══ -->
					<section class="form-section" class:open={openSections.platforms}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('platforms')}>
							<span class="section-toggle__label">🖥️ Platforms & Genres</span>
							<span class="section-toggle__chevron">{openSections.platforms ? '▲' : '▼'}</span>
						</button>
						{#if openSections.platforms}
							<div class="section-body">
								<div class="fg">
									<label class="fl">Platforms</label>
									<input type="text" class="fi mb-2" bind:value={platformSearch} placeholder="Search platforms..." />
									{#if selectedPlatforms.length > 0}
										<div class="selected-chips mb-2">
											{#each selectedPlatforms as slug}
												{@const plat = platforms.find((p: any) => p.slug === slug)}
												<button type="button" class="chip chip--selected" onclick={() => togglePlatform(slug)}>{plat?.label || slug} ✕</button>
											{/each}
										</div>
									{/if}
									<div class="checkbox-grid">
										{#each filteredPlatforms as p}
											<label class="check-item">
												<input type="checkbox" checked={selectedPlatforms.includes(p.slug)} onchange={() => togglePlatform(p.slug)} />
												<span>{p.label}</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="fg">
									<label class="fl">Genres</label>
									<div class="checkbox-grid">
										{#each genres as g}
											<label class="check-item">
												<input type="checkbox" checked={selectedGenres.includes(g.slug)} onchange={() => toggleGenre(g.slug)} />
												<span>{g.label}</span>
											</label>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 3: Categories ═══ -->
					<section class="form-section" class:open={openSections.categories}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('categories')}>
							<span class="section-toggle__label">📂 Run Categories</span>
							<span class="section-toggle__chevron">{openSections.categories ? '▲' : '▼'}</span>
						</button>
						{#if openSections.categories}
							<div class="section-body">
								<div class="fg">
									<label class="fl">Full Run Categories</label>
									<p class="fh mb-2">Major categories like "Any%", "All Bosses", "100%".</p>
									{#each fullRunCategories as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={fullRunCategories[i]} placeholder="e.g. Any%, All Bosses" maxlength="100" />
											{#if fullRunCategories.length > 1}
												<button type="button" class="list-row__remove" onclick={() => removeFullRun(i)}>✕</button>
											{/if}
										</div>
									{/each}
									<button type="button" class="btn btn--small mt-2" onclick={addFullRun}>+ Add Category</button>
								</div>
								<div class="fg">
									<label class="fl">Mini-Challenge Categories</label>
									<p class="fh mb-2">Smaller challenges like individual boss fights, specific sections, etc.</p>
									{#each miniChallengeCategories as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={miniChallengeCategories[i]} placeholder="e.g. Pantheon of Hallownest, Trial of the Fool" maxlength="100" />
											<button type="button" class="list-row__remove" onclick={() => removeMiniChallenge(i)}>✕</button>
										</div>
									{/each}
									<button type="button" class="btn btn--small mt-2" onclick={addMiniChallenge}>+ Add Mini-Challenge</button>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 4: Challenges ═══ -->
					<section class="form-section" class:open={openSections.challenges}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('challenges')}>
							<span class="section-toggle__label">⚔️ Challenges</span>
							<span class="section-toggle__chevron">{openSections.challenges ? '▲' : '▼'}</span>
						</button>
						{#if openSections.challenges}
							<div class="section-body">
								<div class="fg">
									<label class="fl">Standard Challenges</label>
									<p class="fh mb-2">Select all challenge types that apply to this game.</p>
									<div class="checkbox-grid">
										{#each STANDARD_CHALLENGES as c}
											<label class="check-item">
												<input type="checkbox" checked={selectedChallenges.includes(c)} onchange={() => toggleChallenge(c)} />
												<span>{c}</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="fg">
									<label class="fl">Custom Challenges</label>
									<p class="fh mb-2">Game-specific challenge types not listed above.</p>
									{#each customChallenges as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={customChallenges[i]} placeholder="e.g. No Shield" maxlength="100" />
											<button type="button" class="list-row__remove" onclick={() => removeCustomChallenge(i)}>✕</button>
										</div>
									{/each}
									<button type="button" class="btn btn--small mt-2" onclick={addCustomChallenge}>+ Add Challenge</button>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 5: Characters ═══ -->
					<section class="form-section" class:open={openSections.characters}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('characters')}>
							<span class="section-toggle__label">🧙 Characters / Weapons / Classes</span>
							<span class="section-toggle__chevron">{openSections.characters ? '▲' : '▼'}</span>
						</button>
						{#if openSections.characters}
							<div class="section-body">
								<label class="toggle-row">
									<input type="checkbox" class="toggle-check" bind:checked={characterEnabled} />
									<span class="toggle-slider"></span>
									<span class="toggle-label">This game has selectable characters, weapons, or classes</span>
								</label>
								{#if characterEnabled}
									<div class="fg mt-2">
										<label class="fl" for="charLabel">Column Label</label>
										<input id="charLabel" type="text" class="fi" bind:value={characterLabel} placeholder="Character" maxlength="50" />
										<p class="fh">What do you call it? "Character", "Weapon", "Class", "Loadout", etc.</p>
									</div>
									<div class="fg">
										<label class="fl">Options</label>
										{#each characterOptions as _, i}
											<div class="list-row">
												<input type="text" class="fi" bind:value={characterOptions[i]} placeholder="e.g. Knight, Mage" maxlength="100" />
												<button type="button" class="list-row__remove" onclick={() => removeCharacter(i)}>✕</button>
											</div>
										{/each}
										<button type="button" class="btn btn--small mt-2" onclick={addCharacter}>+ Add Option</button>
									</div>
								{/if}
							</div>
						{/if}
					</section>

					<!-- ═══ Section 6: Restrictions ═══ -->
					<section class="form-section" class:open={openSections.restrictions}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('restrictions')}>
							<span class="section-toggle__label">🚫 Game-Specific Restrictions</span>
							<span class="section-toggle__chevron">{openSections.restrictions ? '▲' : '▼'}</span>
						</button>
						{#if openSections.restrictions}
							<div class="section-body">
								<p class="fh mb-2">Restrictions specific to this game (e.g. "No Bone Charm", "Base Kit Only").</p>
								{#each restrictions as _, i}
									<div class="list-row">
										<input type="text" class="fi" bind:value={restrictions[i]} placeholder="e.g. No Bone Charm" maxlength="100" />
										<button type="button" class="list-row__remove" onclick={() => removeRestriction(i)}>✕</button>
									</div>
								{/each}
								<button type="button" class="btn btn--small mt-2" onclick={addRestriction}>+ Add Restriction</button>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 7: Timing ═══ -->
					<section class="form-section" class:open={openSections.timing}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('timing')}>
							<span class="section-toggle__label">⏱️ Timing Method</span>
							<span class="section-toggle__chevron">{openSections.timing ? '▲' : '▼'}</span>
						</button>
						{#if openSections.timing}
							<div class="section-body">
								<div class="fg">
									<label class="fl">Primary Timing Method</label>
									<div class="radio-group">
										{#each TIMING_OPTIONS as opt}
											<label class="radio-item">
												<input type="radio" name="timing" value={opt.value} bind:group={timingMethod} />
												<span>{opt.label}</span>
											</label>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 8: Glitches ═══ -->
					<section class="form-section" class:open={openSections.glitches}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('glitches')}>
							<span class="section-toggle__label">🐛 Glitch Categories</span>
							<span class="section-toggle__chevron">{openSections.glitches ? '▲' : '▼'}</span>
						</button>
						{#if openSections.glitches}
							<div class="section-body">
								<div class="fg">
									<label class="fl">Glitch Structure</label>
									<p class="fh mb-2">Select all that apply to this game.</p>
									<div class="checkbox-grid">
										{#each GLITCH_PRESETS as g}
											<label class="check-item">
												<input type="checkbox" checked={selectedGlitches.includes(g)} onchange={() => toggleGlitch(g)} />
												<span>{g}</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="fg">
									<label class="fl">Custom Glitch Categories</label>
									{#each customGlitches as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={customGlitches[i]} placeholder="e.g. No Wrong Warp" maxlength="100" />
											<button type="button" class="list-row__remove" onclick={() => removeCustomGlitch(i)}>✕</button>
										</div>
									{/each}
									<button type="button" class="btn btn--small mt-2" onclick={addCustomGlitch}>+ Add Glitch Category</button>
								</div>
								<div class="fg">
									<label class="fl" for="glitchDocs">Glitch Documentation Links</label>
									<textarea id="glitchDocs" class="fi" bind:value={glitchDocLinks} placeholder="Links to glitch guides, wikis, or documentation..." rows="2" maxlength="2000"></textarea>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 9: Rules ═══ -->
					<section class="form-section" class:open={openSections.rules}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('rules')}>
							<span class="section-toggle__label">📜 General Rules</span>
							<span class="section-toggle__chevron">{openSections.rules ? '▲' : '▼'}</span>
						</button>
						{#if openSections.rules}
							<div class="section-body">
								<div class="fg">
									<label class="fl" for="rules">Suggested Rules</label>
									<textarea id="rules" class="fi" bind:value={generalRules} placeholder="Any rules or requirements for challenge runs in this game..." rows="4" maxlength="5000"></textarea>
									<p class="fh">These will be reviewed and refined by our team.</p>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 10: Involvement & Notes ═══ -->
					<section class="form-section" class:open={openSections.involvement}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('involvement')}>
							<span class="section-toggle__label">🤝 Your Involvement</span>
							<span class="section-toggle__chevron">{openSections.involvement ? '▲' : '▼'}</span>
						</button>
						{#if openSections.involvement}
							<div class="section-body">
								<div class="fg">
									<label class="fl">How would you like to be involved?</label>
									{#each INVOLVEMENT_OPTIONS as opt}
										<label class="check-item mb-2">
											<input type="checkbox" checked={involvement.includes(opt)} onchange={() => toggleInvolvement(opt)} />
											<span>{opt}</span>
										</label>
									{/each}
								</div>
								<div class="fg">
									<label class="fl" for="notes">Additional Notes</label>
									<textarea id="notes" class="fi" bind:value={additionalNotes} placeholder="Anything else we should know..." rows="3" maxlength="2000"></textarea>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Turnstile + Submit ═══ -->
					<div class="submit-section">
						<div id="turnstile-container-game" class="turnstile-container"></div>
						{#if !turnstileReady}<p class="fh">Loading verification...</p>{/if}

						{#if bannedTermsWarning}
							<div class="alert alert--error">{bannedTermsWarning}</div>
						{/if}

						<button class="btn btn--accent btn--lg submit-btn" onclick={handleSubmit} disabled={!canSubmit}>
							{submitting ? 'Submitting...' : 'Submit Game Request'}
						</button>
					</div>

				</div> <!-- end form-sections -->
			{/if}

			<div class="submit-links">
				<p>Want to submit a run instead? <a href="/games">Find your game</a> and use the Submit Run page.</p>
			</div>
		</div>
	</div>
</AuthGuard>

<style>
	.submit-page { max-width: 720px; margin: 2rem auto; }
	.page-desc { font-size: 0.95rem; margin: 0.25rem 0; }
	.req { color: #ef4444; font-weight: 700; }

	/* Section accordion */
	.form-sections { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem; }
	.form-section {
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 12px; overflow: hidden;
	}
	.form-section.open { border-color: var(--accent); }
	.section-toggle {
		display: flex; justify-content: space-between; align-items: center;
		width: 100%; padding: 1rem 1.25rem; background: none; border: none;
		cursor: pointer; font-size: 1rem; font-weight: 600; color: var(--fg);
		text-align: left; font-family: inherit;
	}
	.section-toggle:hover { background: rgba(255,255,255,0.02); }
	.section-toggle__chevron { font-size: 0.75rem; color: var(--muted); }
	.section-body { padding: 0 1.25rem 1.25rem; }

	/* Form elements */
	.fg { margin-bottom: 1.25rem; }
	.fl { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
	.fi {
		width: 100%; padding: 0.6rem 0.75rem;
		border: 1px solid var(--border); border-radius: 6px;
		background: var(--bg); color: var(--fg);
		font-size: 0.95rem; font-family: inherit;
	}
	.fi:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }
	textarea.fi { resize: vertical; }
	.fh { font-size: 0.8rem; color: var(--muted); margin-top: 0.3rem; }

	/* Checkbox grids */
	.checkbox-grid {
		display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.25rem;
	}
	.check-item {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.35rem 0.5rem; border-radius: 6px; cursor: pointer;
		font-size: 0.9rem;
	}
	.check-item:hover { background: rgba(255,255,255,0.03); }
	.check-item input[type="checkbox"], .check-item input[type="radio"] { accent-color: var(--accent); }

	/* Radio group */
	.radio-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.radio-item {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.5rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;
	}
	.radio-item:hover { background: rgba(255,255,255,0.03); }

	/* Dynamic list rows */
	.list-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
	.list-row .fi { flex: 1; }
	.list-row__remove {
		background: none; border: 1px solid var(--border); border-radius: 6px;
		color: var(--muted); cursor: pointer; padding: 0 0.6rem; font-size: 1.1rem;
	}
	.list-row__remove:hover { color: #ef4444; border-color: #ef4444; background: rgba(239, 68, 68, 0.08); }

	/* Selected chips */
	.selected-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.chip { padding: 0.25rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; border: none; }
	.chip--selected { background: var(--accent); color: white; }

	/* Toggle switch (from profile edit) */
	.toggle-row { display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.5rem 0; user-select: none; }
	.toggle-check { display: none; }
	.toggle-slider {
		position: relative; width: 40px; height: 22px; flex-shrink: 0;
		background: var(--border); border-radius: 11px; transition: background 0.2s;
	}
	.toggle-slider::after {
		content: ''; position: absolute; top: 3px; left: 3px;
		width: 16px; height: 16px; border-radius: 50%;
		background: var(--fg); transition: transform 0.2s;
	}
	.toggle-check:checked + .toggle-slider { background: var(--accent); }
	.toggle-check:checked + .toggle-slider::after { transform: translateX(18px); background: #fff; }
	.toggle-label { font-size: 0.9rem; color: var(--fg); }

	/* Submit section */
	.submit-section { margin-top: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
	.turnstile-container { min-height: 65px; }
	.submit-btn { width: 100%; max-width: 400px; justify-content: center; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; }
	.btn:hover { border-color: var(--accent); }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn--accent { background: var(--accent); border-color: var(--accent); color: #fff; }
	.btn--accent:hover { filter: brightness(1.1); }
	.btn--accent:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
	.btn--lg { padding: 0.75rem 2rem; font-size: 1.05rem; min-height: 44px; }

	/* Alerts */
	.alert { padding: 1rem 1.25rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	.success-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
	.submit-links { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border); font-size: 0.9rem; }
	.submit-links a { color: var(--accent); }

	/* Utilities */
	.mb-2 { margin-bottom: 0.5rem; }
	.mt-2 { margin-top: 0.5rem; }
</style>
