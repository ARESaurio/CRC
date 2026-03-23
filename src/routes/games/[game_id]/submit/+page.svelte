<script lang="ts">
	import { onMount } from 'svelte';
	import { session, user } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { isValidVideoUrl } from '$lib/utils';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import { showToast } from '$stores/toast';
	import { PUBLIC_WORKER_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { getCountry } from '$lib/data/countries';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, AlertTriangle, Send, Eye, Clock } , X } from 'lucide-svelte';

	let { data } = $props();
	const game = $derived(data.game);
	const allPlatforms = $derived(data.platforms || []);
	const runnerProfile = $derived(data.runnerProfile);

	// Filter platforms to this game's configured list (fall back to all if none set)
	const gamePlatforms = $derived(
		game.platforms?.length
			? allPlatforms.filter((p: any) => game.platforms.includes(p.id))
			: allPlatforms
	);

	// ── Form State ──
	let categoryTier = $state('');
	let categorySlug = $state('');
	let platform = $state('');
	let character = $state('');
	let selectedChallenges = $state<string[]>([]);
	let glitchId = $state('');
	let selectedRestrictions = $state<string[]>([]);
	let difficulty = $state('');
	let runTimeRta = $state('');
	let runTimePrimary = $state('');
	let dateCompleted = $state('');
	let videoUrl = $state('');
	let submitterNotes = $state('');

	// ── Typeahead State ──
	let platformSearch = $state('');
	let platformOpen = $state(false);
	let charSearch = $state('');
	let charOpen = $state(false);
	let glitchSearch = $state('');
	let glitchOpen = $state(false);
	let diffSearch = $state('');
	let diffOpen = $state(false);

	// ── Video Metadata State ──
	let videoTitle = $state('');
	let videoFetching = $state(false);
	let videoFetchError = $state('');

	// ── UI State ──
	let submitting = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// ── Turnstile CAPTCHA ──
	let turnstileToken = $state('');
	let turnstileReady = $state(false);
	let turnstileWidgetId = $state<string | null>(null);

	onMount(() => {
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
		const container = document.getElementById('turnstile-container-run');
		if (!container || !(window as any).turnstile) return;
		if (turnstileWidgetId !== null) {
			(window as any).turnstile.reset(turnstileWidgetId);
			return;
		}
		turnstileWidgetId = (window as any).turnstile.render('#turnstile-container-run', {
			sitekey: PUBLIC_TURNSTILE_SITE_KEY,
			callback: (token: string) => { turnstileToken = token; },
			'expired-callback': () => { turnstileToken = ''; },
			theme: 'auto'
		});
	}

	// ── Game timing config ──
	const gameTimingMethod = $derived(game.timing_method || '');
	const hasGameTiming = $derived(!!gameTimingMethod && gameTimingMethod.toLowerCase() !== 'rta');
	const gameTimingLabel = $derived(gameTimingMethod || 'Primary Time');
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

	$effect(() => {
		const fl = fixedLoadout;
		if (fl) {
			if (fl.character) { character = fl.character; charSearch = (game.characters_data || []).find((c: any) => c.slug === fl.character)?.label || fl.character; }
			if (fl.challenge) selectedChallenges = [fl.challenge];
			if (fl.restriction) selectedRestrictions = [fl.restriction];
		}
	});

	let prevCategorySlug = $state('');
	$effect(() => {
		if (categorySlug !== prevCategorySlug) {
			const prevCat = categoryOptions.find(c => c.slug === prevCategorySlug);
			const prevFl = prevCat?.fixed_loadout?.enabled ? prevCat.fixed_loadout : null;
			if (prevFl && !fixedLoadout) {
				if (prevFl.character) { character = ''; charSearch = ''; }
				if (prevFl.challenge) selectedChallenges = selectedChallenges.filter(c => c !== prevFl.challenge);
				if (prevFl.restriction) selectedRestrictions = selectedRestrictions.filter(r => r !== prevFl.restriction);
			}
			prevCategorySlug = categorySlug;
		}
	});

	// ── Validation ──
	const platformRequired = $derived(!!game.platform_required);
	const videoValid = $derived(!videoUrl || isValidVideoUrl(videoUrl));
	const notesWarning = $derived(checkBannedTerms(submitterNotes));
	const canSubmit = $derived(
		!!$session &&
		!!categoryTier &&
		!!categorySlug &&
		!!videoUrl &&
		videoValid &&
		!!turnstileToken &&
		!notesWarning &&
		!submitting &&
		(!platformRequired || !!platform)
	);

	// ── Typeahead Helpers ──
	function norm(s: string) { return s.trim().toLowerCase(); }
	function filterItems(items: { id?: string; slug?: string; label: string }[], search: string) {
		const q = norm(search);
		if (!q) return items.slice(0, 30);
		return items.filter(i => norm(i.label).includes(q) || norm(i.id || i.slug || '').includes(q)).slice(0, 30);
	}
	function handleBlur(closeFn: () => void) { setTimeout(closeFn, 180); }

	function selectPlatform(p: { id?: string; label: string }) { platform = p.id || ''; platformSearch = p.label; platformOpen = false; }
	function clearPlatform() { platform = ''; platformSearch = ''; }
	function selectCharacter(c: { slug?: string; label: string }) { character = c.slug || ''; charSearch = c.label; charOpen = false; }
	function clearCharacter() { character = ''; charSearch = ''; }
	function selectGlitch(g: { slug?: string; label: string }) { glitchId = g.slug || ''; glitchSearch = g.label; glitchOpen = false; }
	function clearGlitch() { glitchId = ''; glitchSearch = ''; }
	function selectDifficulty(d: { slug?: string; label: string }) { difficulty = d.slug || ''; diffSearch = d.label; diffOpen = false; }
	function clearDifficulty() { difficulty = ''; diffSearch = ''; }

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
				const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
				if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
					videoTitle = '';
					videoFetchError = '';
				} else {
					videoFetchError = 'Could not retrieve video info.';
				}
			} else {
				videoTitle = json.title || '';
				if (!dateCompleted && json.upload_date) {
					dateCompleted = json.upload_date;
				}
			}
		} catch {
			try {
				const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
				if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
					videoTitle = '';
					videoFetchError = '';
				} else {
					videoFetchError = 'Could not retrieve video info.';
				}
			} catch {
				videoFetchError = 'Could not retrieve video info.';
			}
		} finally {
			videoFetching = false;
		}
	}

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

	function toggleRestriction(slug: string, parentRestriction?: any) {
		// Single-select: deselect siblings first
		if (parentRestriction?.child_select === 'single' && parentRestriction.children?.length) {
			const sibSlugs = parentRestriction.children.map((c: any) => c.slug);
			const isAlreadyActive = selectedRestrictions.includes(slug);
			// Remove all siblings
			selectedRestrictions = selectedRestrictions.filter(r => !sibSlugs.includes(r));
			// Toggle: if it wasn't active, add it
			if (!isAlreadyActive) {
				selectedRestrictions = [...selectedRestrictions, slug];
			}
			return;
		}
		// Multi-select (default)
		if (selectedRestrictions.includes(slug)) {
			selectedRestrictions = selectedRestrictions.filter(r => r !== slug);
		} else {
			selectedRestrictions = [...selectedRestrictions, slug];
		}
	}

	let expandedRestrictions = $state<Set<string>>(new Set());
	function toggleRestrictionExpand(slug: string) {
		const next = new Set(expandedRestrictions);
		if (next.has(slug)) next.delete(slug); else next.add(slug);
		expandedRestrictions = next;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		submitting = true;
		errorMsg = '';
		successMsg = '';

		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess?.access_token) {
				throw new Error('You must be signed in to submit a run.');
			}

			const payload: Record<string, any> = {
				turnstile_token: turnstileToken,
				schema_version: 7,
				game_id: game.game_id,
				category_tier: categoryTier,
				category: categorySlug,
				standard_challenges: selectedChallenges.length > 0 ? selectedChallenges : [],
				character: character || undefined,
				difficulty: difficulty || undefined,
				glitch_id: glitchId || undefined,
				restrictions: selectedRestrictions.length > 0 ? selectedRestrictions : [],
				platform: platform || undefined,
				video_url: videoUrl,
				submitter_notes: submitterNotes.trim() || undefined,
			};

			if (dateCompleted) payload.run_date = dateCompleted;
			if (runTimeRta) payload.time_rta = runTimeRta;

			if (showRtaSeparately && runTimePrimary) {
				payload.time_primary = runTimePrimary;
			} else if (!showRtaSeparately && runTimeRta) {
				payload.time_primary = runTimeRta;
			}

			const res = await fetch(`${PUBLIC_WORKER_URL}/submit`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${sess.access_token}`
				},
				body: JSON.stringify(payload)
			});
			const data = await res.json();

			if (!res.ok || !data.ok) {
				throw new Error(data.error || 'Submission failed. Please try again.');
			}

			successMsg = 'Run submitted successfully! A verifier will review it shortly.';
			showToast('success', 'Run submitted! A verifier will review it shortly.');
			categoryTier = ''; categorySlug = ''; selectedChallenges = []; character = '';
			glitchId = ''; selectedRestrictions = []; videoUrl = ''; platform = ''; dateCompleted = '';
			runTimeRta = ''; runTimePrimary = ''; submitterNotes = ''; videoTitle = ''; difficulty = '';
			platformSearch = ''; charSearch = ''; glitchSearch = ''; diffSearch = '';
		} catch (err: any) {
			errorMsg = err.message || 'Submission failed. Please try again.';
			showToast('error', err.message || 'Submission failed.');
		} finally {
			submitting = false;
			if (turnstileWidgetId !== null && (window as any).turnstile) {
				(window as any).turnstile.reset(turnstileWidgetId);
				turnstileToken = '';
			}
		}
	}
</script>

<svelte:head>
	<title>Submit Run - {game.game_name} | CRC</title>
</svelte:head>

<h2>{m.submit_run_heading({ game_name: game.game_name })}</h2>
<p class="muted mb-3">
	{m.submit_run_description({ game_name: game.game_name })}
	<span class="required-hint"><span class="req">*</span> {m.required_fields_hint()}</span>
</p>

{#if !$session}
	<div class="card">
		<div class="empty-state">
			<span class="empty-state__icon">🔐</span>
			<h3>{m.sign_in_required()}</h3>
			<p class="muted">{m.sign_in_required_submit()}</p>
			<a href={localizeHref(`/sign-in?redirect=/games/${game.game_id}/submit`)} class="btn btn--accent mt-2">{m.btn_sign_in()}</a>
		</div>
	</div>
{:else if successMsg}
	<div class="card">
		<div class="success-state">
			<span class="success-state__icon">✅</span>
			<h3>{m.submitted_success()}</h3>
			<p class="muted">{successMsg}</p>
			<div class="success-actions">
				<button class="btn btn--accent" onclick={() => successMsg = ''}>{m.btn_submit_another()}</button>
				<a href={localizeHref(`/games/${game.game_id}/runs`)} class="btn">{m.btn_view_runs()}</a>
				<a href={localizeHref('/profile/submissions')} class="btn">📋 {m.user_menu_submissions()}</a>
			</div>
		</div>
	</div>
{:else}
	<form class="submit-form" onsubmit={handleSubmit}>

		<!-- 1. Category Selection -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_category()} <span class="req">*</span></p>
			<p class="submit-section__sub">{m.submit_run_category_sub()}</p>
			<div class="field-row">
				<div class="field">
					<label for="tier" class="field-label">{m.submit_run_tier()} <span class="req">*</span></label>
					<select id="tier" bind:value={categoryTier} required>
						<option value="">{m.submit_run_select_tier()}</option>
						{#each tierOptions() as tier}
							<option value={tier.value}>{tier.label}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="category" class="field-label">{m.submit_run_section_category()} <span class="req">*</span></label>
					<select id="category" bind:value={categorySlug} required disabled={!categoryTier}>
						<option value="">{m.submit_run_select_category()}</option>
						{#each categoryOptions as cat}
							<option value={cat.slug}>{cat.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- 2. Platform (typeahead, filtered to game) -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_platform()}{#if platformRequired} <span class="req">*</span>{/if}</p>
			<p class="submit-section__sub">{#if platformRequired}{m.submit_run_platform_required()}{:else}{m.submit_run_platform_optional()}{/if}</p>
			<div class="field" style="max-width: 300px;">
				<div class="ta">
					<input type="text" class="ta__input" placeholder={m.submit_run_type_platform()} autocomplete="off" bind:value={platformSearch}
						onclick={() => platformOpen = !platformOpen} oninput={() => { if (!platformOpen) platformOpen = true; }}
						onblur={() => handleBlur(() => { platformOpen = false; if (platform) { const match = gamePlatforms.find((p: any) => p.id === platform); platformSearch = match?.label || ''; } else platformSearch = ''; })} />
					{#if platform}<button type="button" class="ta__clear" onclick={clearPlatform}><X size={14} /></button>{/if}
					{#if platformOpen}
						{@const matches = filterItems(gamePlatforms, platformSearch)}
						<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.submit_run_no_matches()}</li>{:else}{#each matches as p}<li><button type="button" class="ta__opt" class:ta__opt--active={platform === p.id} onmousedown={() => selectPlatform(p)}>{p.label}</button></li>{/each}{/if}</ul>
					{/if}
				</div>
			</div>
		</div>

		<!-- 3. Runner (auto-fill + additional runners stub) -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_runner()}</p>
			<div class="field-row">
				<div class="field">
					<label class="field-label">{m.submit_run_your_profile()}</label>
					{#if runnerProfile}
						{@const locCountry = runnerProfile.location ? getCountry(runnerProfile.location) : null}
						{@const repCountry = runnerProfile.socials?.representing ? getCountry(runnerProfile.socials.representing) : null}
						<div class="runner-autofill">
							<img
								class="runner-autofill__avatar"
								src={runnerProfile.avatar_url || '/img/site/default-runner.png'}
								alt=""
							/>
							<div class="runner-autofill__info">
								<a href="/runners/{runnerProfile.runner_id}" class="runner-autofill__link">{runnerProfile.display_name}</a>
								{#if runnerProfile.pronouns}
									<span class="runner-autofill__pronouns">{runnerProfile.pronouns}</span>
								{/if}
								{#if locCountry || repCountry}
									<span class="runner-autofill__location">
										{#if locCountry}
											<img class="runner-autofill__flag" src="https://flagcdn.com/w40/{locCountry.code.toLowerCase()}.png" alt="{locCountry.name} flag" width="16" height="12" />
											{locCountry.name}
										{/if}
										{#if repCountry && repCountry.code !== locCountry?.code}
											<span class="runner-autofill__ally">· {m.submit_run_ally_of()}
												<img class="runner-autofill__flag" src="https://flagcdn.com/w40/{repCountry.code.toLowerCase()}.png" alt="{repCountry.name} flag" width="16" height="12" />
												{repCountry.name}
											</span>
										{/if}
									</span>
								{/if}
							</div>
						</div>
					{:else}
						<div class="runner-autofill runner-autofill--none">
							<span class="muted">{@html m.submit_run_no_profile({ link_start: '<a href="' + localizeHref('/profile/create') + '">', link_end: '</a>' })}</span>
						</div>
					{/if}
				</div>
				<div class="field">
					<label class="field-label">{m.submit_run_additional_runners()}</label>
					<div class="coming-soon-stub">
						<span class="coming-soon-stub__icon">👥</span>
						<span class="coming-soon-stub__text">{m.submit_run_multi_runner_soon()}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- 4. Character (typeahead) -->
		{#if game.character_column?.enabled && game.characters_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">{game.character_column.label}{#if fixedLoadout?.character} <span class="fixed-badge">🔒 {m.submit_run_fixed_badge()}</span>{/if}</p>
				<div class="field">
					{#if fixedLoadout?.character}
						<div class="ta">
							<input type="text" class="ta__input" value={charSearch} disabled />
						</div>
						<span class="field-hint">{m.submit_run_locked_hint({ label: game.character_column.label.toLowerCase() })}</span>
					{:else}
						<div class="ta">
							<input type="text" class="ta__input" placeholder={`${m.submit_run_type_platform().split("...")[0].replace(m.submit_run_type_platform().split(" ")[0], game.character_column.label)}...`} autocomplete="off" bind:value={charSearch}
								onclick={() => charOpen = !charOpen} oninput={() => { if (!charOpen) charOpen = true; }}
								onblur={() => handleBlur(() => { charOpen = false; if (character) { const match = (game.characters_data || []).find((c: any) => c.slug === character); charSearch = match?.label || ''; } else charSearch = ''; })} />
							{#if character}<button type="button" class="ta__clear" onclick={clearCharacter}><X size={14} /></button>{/if}
							{#if charOpen}
								{@const matches = filterItems(game.characters_data || [], charSearch)}
								<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.submit_run_no_matches()}</li>{:else}{#each matches as c}<li><button type="button" class="ta__opt" class:ta__opt--active={character === c.slug} onmousedown={() => selectCharacter(c)}>{c.label}</button></li>{/each}{/if}</ul>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- 4b. Difficulty (typeahead) -->
		{#if game.difficulty_column?.enabled && game.difficulties_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">{game.difficulty_column.label}</p>
				<div class="field">
					<div class="ta">
						<input type="text" class="ta__input" placeholder="Type a {game.difficulty_column.label.toLowerCase()}..." autocomplete="off" bind:value={diffSearch}
							onclick={() => diffOpen = !diffOpen} oninput={() => { if (!diffOpen) diffOpen = true; }}
							onblur={() => handleBlur(() => { diffOpen = false; if (difficulty) { const match = (game.difficulties_data || []).find((d: any) => d.slug === difficulty); diffSearch = match?.label || ''; } else diffSearch = ''; })} />
						{#if difficulty}<button type="button" class="ta__clear" onclick={clearDifficulty}><X size={14} /></button>{/if}
						{#if diffOpen}
							{@const matches = filterItems(game.difficulties_data || [], diffSearch)}
							<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.submit_run_no_matches()}</li>{:else}{#each matches as d}<li><button type="button" class="ta__opt" class:ta__opt--active={difficulty === d.slug} onmousedown={() => selectDifficulty(d)}>{d.label}</button></li>{/each}{/if}</ul>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- 5. Challenges (chip grid) -->
		{#if game.challenges_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">{m.submit_run_section_challenges()}{#if fixedLoadout?.challenge} <span class="fixed-badge">🔒 {m.submit_run_fixed_badge()}</span>{/if}</p>
				<p class="submit-section__sub">{m.submit_run_challenges_sub()}</p>
				<div class="chip-grid">
					{#each game.challenges_data as ch}
						{@const isLocked = fixedLoadout?.challenge === ch.slug}
						<button type="button" class="chip" class:chip--active={selectedChallenges.includes(ch.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleChallenge(ch.slug); }} disabled={isLocked}>{ch.label}{#if isLocked} 🔒{/if}</button>
					{/each}
				</div>
				{#if fixedLoadout?.challenge}
					<span class="field-hint mt-1">{m.submit_run_challenge_required()}</span>
				{/if}
			</div>
		{/if}

		<!-- 6. Glitch Category (typeahead) -->
		{#if game.glitches_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">{m.submit_run_section_glitch()}</p>
				<div class="field">
					<div class="ta">
						<input type="text" class="ta__input" placeholder={m.submit_run_type_glitch()} autocomplete="off" bind:value={glitchSearch}
							onclick={() => glitchOpen = !glitchOpen} oninput={() => { if (!glitchOpen) glitchOpen = true; }}
							onblur={() => handleBlur(() => { glitchOpen = false; if (glitchId) { const match = (game.glitches_data || []).find((g: any) => g.slug === glitchId); glitchSearch = match?.label || ''; } else glitchSearch = ''; })} />
						{#if glitchId}<button type="button" class="ta__clear" onclick={clearGlitch}><X size={14} /></button>{/if}
						{#if glitchOpen}
							{@const matches = filterItems(game.glitches_data || [], glitchSearch)}
							<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.submit_run_no_matches()}</li>{:else}{#each matches as g}<li><button type="button" class="ta__opt" class:ta__opt--active={glitchId === g.slug} onmousedown={() => selectGlitch(g)}>{g.label}</button></li>{/each}{/if}</ul>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- 7. Restrictions (expandable groups) -->
		{#if game.restrictions_data?.length}
			<div class="submit-section">
				<p class="submit-section__title">{m.submit_run_section_restrictions()}{#if fixedLoadout?.restriction} <span class="fixed-badge">🔒 {m.submit_run_fixed_badge()}</span>{/if}</p>
				<p class="submit-section__sub">{m.submit_run_restrictions_sub()}{#if game.restrictions_data.some((r: any) => r.children?.length)} {m.submit_run_restrictions_click_group()}{/if}</p>
				<div class="chip-grid">
					{#each game.restrictions_data as r}
						{@const isLocked = fixedLoadout?.restriction === r.slug}
						{@const hasChildren = (r.children?.length ?? 0) > 0}
						{@const isExpanded = expandedRestrictions.has(r.slug)}
						{@const childActive = hasChildren && r.children?.some((c: any) => selectedRestrictions.includes(c.slug))}
						{#if hasChildren}
							<button type="button" class="chip chip--parent" class:chip--expanded={isExpanded} class:chip--child-active={childActive} onclick={() => toggleRestrictionExpand(r.slug)}>
								{r.label} <span class="chip__arrow">{isExpanded ? '▲' : '▼'}</span>
								{#if childActive}<span class="chip__count">{r.children?.filter((c: any) => selectedRestrictions.includes(c.slug)).length}</span>{/if}
							</button>
							{#if isExpanded}
								<div class="chip-children">
									{#if r.child_select === 'single'}<span class="chip-children__hint">{m.submit_run_pick_one()}</span>{/if}
									{#each r.children as child}
										{@const childLocked = fixedLoadout?.restriction === child.slug}
										<button type="button" class="chip" class:chip--active={selectedRestrictions.includes(child.slug)} class:chip--locked={childLocked} onclick={() => { if (!childLocked) toggleRestriction(child.slug, r); }} disabled={childLocked}>{child.label}{#if childLocked} 🔒{/if}</button>
									{/each}
								</div>
							{/if}
						{:else}
							<button type="button" class="chip" class:chip--active={selectedRestrictions.includes(r.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleRestriction(r.slug); }} disabled={isLocked}>{r.label}{#if isLocked} 🔒{/if}</button>
						{/if}
					{/each}
				</div>
				{#if fixedLoadout?.restriction}
					<span class="field-hint mt-1">{m.submit_run_restriction_required()}</span>
				{/if}
			</div>
		{/if}

		<!-- 8. Run Timing -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_timing()}</p>
			<p class="submit-section__sub">
				{#if showRtaSeparately}
					{m.submit_run_timing_both({ label: gameTimingLabel })}
				{:else}
					{m.submit_run_timing_single()}
				{/if}
			</p>
			<div class="field-row">
				{#if showRtaSeparately}
					<div class="field">
						<label for="time-primary" class="field-label">{m.submit_run_time_label({ label: gameTimingLabel })}</label>
						<input id="time-primary" type="text" bind:value={runTimePrimary} placeholder={m.submit_run_time_placeholder()} />
						<span class="field-hint">{m.submit_run_time_hint({ game_name: game.game_name })}</span>
					</div>
				{:else}
					<div class="field"></div>
				{/if}
				<div class="field">
					<label for="time-rta" class="field-label">{m.submit_run_rta_time()}</label>
					<input id="time-rta" type="text" bind:value={runTimeRta} placeholder={m.submit_run_time_placeholder()} />
					<span class="field-hint">{m.submit_run_rta_hint()}</span>
				</div>
			</div>
		</div>

		<!-- 9. Date Completed -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_date()}</p>
			<p class="submit-section__sub">{m.submit_run_date_sub()}</p>
			<div class="field" style="max-width: 240px;">
				<input id="date" type="date" bind:value={dateCompleted} max={new Date().toISOString().split('T')[0]} />
			</div>
		</div>

		<!-- 10. Video Proof -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_video()} <span class="req">*</span></p>
			<div class="field">
				<label for="video" class="field-label">{m.submit_run_video_url()} <span class="req">*</span></label>
				<input id="video" type="url" bind:value={videoUrl} required placeholder={m.submit_run_video_placeholder()} class:field--error={videoUrl && !videoValid} />
				{#if videoUrl && !videoValid}
					<span class="field-error">{m.submit_run_video_error()}</span>
				{/if}
			</div>
			{#if videoFetching}
				<div class="video-meta"><span class="spinner spinner--small"></span> <span class="muted">{m.submit_run_fetching_video()}</span></div>
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

		<!-- 11. Runner Notes -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_notes()}</p>
			<p class="submit-section__sub">{m.submit_run_notes_sub()}</p>
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

		<!-- Verification + Submit -->
		<div class="submit-footer">
			<div class="submit-footer__verify">
				<div id="turnstile-container-run"></div>
				{#if !turnstileReady}
					<p class="muted" style="font-size: 0.8rem;">{m.loading_verification()}</p>
				{/if}
			</div>
			<div class="submit-footer__action">
				<button type="submit" class="btn btn--lg" class:btn--accent={canSubmit} class:btn--muted={!canSubmit} disabled={!canSubmit}>
					{#if submitting}
						<span class="spinner spinner--small"></span> {m.btn_submitting()}
					{:else}
						{m.btn_submit_run()}
					{/if}
				</button>
			</div>
		</div>
	</form>
{/if}

<style>
	h2 { margin: 0 0 0.25rem; text-align: center; }
	.mb-3 { margin-bottom: 1rem; text-align: center; }
	.mt-1 { margin-top: 0.5rem; }
	.mt-2 { margin-top: 0.75rem; }
	.required-hint { font-size: 0.8rem; }
	.req { color: #ef4444; font-weight: 600; }

	.empty-state, .success-state { text-align: center; padding: 2rem 1rem; margin: 0 auto; }
	.empty-state__icon, .success-state__icon { display: block; font-size: 3rem; margin-bottom: 0.75rem; opacity: 0.5; }
	.empty-state h3, .success-state h3 { margin: 0 0 0.5rem; }
	.empty-state p, .success-state p { margin: 0; max-width: 400px; margin-inline: auto; }
	.success-actions { display: flex; gap: 0.75rem; justify-content: center; margin-top: 1rem; }

	.submit-form { display: flex; flex-direction: column; gap: 1.5rem; padding-bottom: 2rem; }
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
	select:disabled, input:disabled { opacity: 0.5; }
	.field--error { border-color: #ef4444 !important; }
	.field-error { color: #ef4444; font-size: 0.75rem; }

	/* Typeahead */
	.ta { position: relative; }
	.ta__input { width: 100%; padding: 0.5rem 0.75rem; padding-right: 2rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.ta__input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(var(--accent-rgb, 59, 195, 110), 0.15); }
	.ta__input::placeholder { color: var(--border); }
	.ta__clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 2px 5px; border-radius: 3px; }
	.ta__clear:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
	.ta__list { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; max-height: 200px; overflow-y: auto; list-style: none; margin: 4px 0 0; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
	.ta__opt { display: block; width: 100%; text-align: left; padding: 0.4rem 0.6rem; background: none; border: none; color: var(--fg); cursor: pointer; font-size: 0.85rem; border-radius: 4px; font-family: inherit; }
	.ta__opt:hover { background: var(--surface); }
	.ta__opt--active { color: var(--accent); font-weight: 600; }
	.ta__empty { padding: 0.5rem 0.6rem; color: var(--muted); font-size: 0.8rem; }

	/* Runner auto-fill */
	.runner-autofill { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; }
	.runner-autofill__avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.runner-autofill__info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.runner-autofill__link { color: var(--accent); text-decoration: none; font-weight: 600; font-size: 0.9rem; }
	.runner-autofill__link:hover { text-decoration: underline; }
	.runner-autofill__pronouns { font-size: 0.78rem; color: var(--muted); }
	.runner-autofill__location { font-size: 0.78rem; color: var(--muted); display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
	.runner-autofill__flag { display: inline-block; vertical-align: middle; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
	.runner-autofill__ally { display: inline-flex; align-items: center; gap: 0.25rem; opacity: 0.75; }
	.runner-autofill--none { color: var(--text-muted); font-size: 0.85rem; }
	.runner-autofill--none a { color: var(--accent); }

	/* Coming soon stub */
	.coming-soon-stub { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--surface); border: 1px dashed var(--border); border-radius: 6px; color: var(--text-muted); font-size: 0.8rem; }
	.coming-soon-stub__icon { font-size: 1rem; opacity: 0.5; }

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
	.chip--parent { background: var(--surface); border: 1px dashed var(--border); color: var(--fg); }
	.chip--parent:hover { border-color: var(--accent); }
	.chip--expanded { border-style: solid; border-color: var(--accent); color: var(--accent); }
	.chip--child-active { border-color: var(--accent); }
	.chip__arrow { font-size: 0.6rem; margin-left: 0.15rem; }
	.chip__count { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; border-radius: 8px; background: var(--accent); color: #fff; font-size: 0.65rem; font-weight: 700; padding: 0 4px; margin-left: 0.2rem; }
	.chip-children { display: flex; flex-wrap: wrap; gap: 0.4rem; width: 100%; padding: 0.5rem 0.75rem; background: rgba(99, 102, 241, 0.04); border: 1px solid var(--border); border-radius: 8px; align-items: center; }
	.chip-children__hint { font-size: 0.75rem; color: var(--muted); font-style: italic; margin-right: 0.25rem; }
	.chip--locked.chip--active { background: var(--accent); border-color: var(--accent); }

	/* Fixed loadout badge */
	.fixed-badge { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.72rem; font-weight: 600; color: var(--accent); background: rgba(99, 102, 241, 0.08); padding: 0.1rem 0.4rem; border-radius: 4px; vertical-align: middle; }

	.submit-footer { display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: center; padding-top: 0.5rem; }
	.submit-footer__action { display: flex; justify-content: flex-end; }
	.submit-footer__action .btn { min-width: 180px; justify-content: center; }

	.submit-error { padding: 0.6rem 0.75rem; border-radius: 6px; font-size: 0.85rem; background: rgba(231,76,60,0.15); color: #e74c3c; border: 1px solid rgba(231,76,60,0.3); }

	.spinner--small { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; display: inline-block; animation: spin 0.6s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 640px) {
		.field-row { grid-template-columns: 1fr; }
		.submit-footer { grid-template-columns: 1fr; justify-items: center; }
		.submit-footer__action { width: 100%; }
		.submit-footer__action .btn { width: 100%; }
	}
</style>
