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
	import { Lock, CheckCircle, AlertTriangle, Send, Eye, Clock , X, Clipboard, Construction, Users, Hourglass, Camera, ArrowLeft, ChevronUp, ChevronDown, Video} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

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
	let customCategoryText = $state('');

	// ── Community Review Write-in State ──
	const isReview = $derived(game.status === 'Community Review');
	let customChallenges = $state<string[]>([]);
	let customChallengeInput = $state('');
	let customRestrictions = $state<string[]>([]);
	let customRestrictionInput = $state('');

	const WRITE_IN_LIMITS = { categories: 10, restrictions: 10, character: 10, challenges: 5, glitch: 5, difficulties: 5 } as const;

	// ── Combobox State ──
	let platformSearch = $state('');
	let platformFilterText = $state('');
	let charSearch = $state('');
	let charFilterText = $state('');
	let glitchSearch = $state('');
	let glitchFilterText = $state('');
	let diffSearch = $state('');
	let diffFilterText = $state('');

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
	function flattenWithChildren(items: any[]): { slug: string; label: string; fixed_loadout?: any }[] {
		const cats: { slug: string; label: string; fixed_loadout?: any }[] = [];
		for (const item of items) {
			if (item.children?.length) {
				for (const child of item.children) cats.push({ slug: child.slug, label: `${item.label} › ${child.label}`, fixed_loadout: child.fixed_loadout });
			} else {
				cats.push({ slug: item.slug, label: item.label, fixed_loadout: item.fixed_loadout });
			}
		}
		return cats;
	}

	const tierOptions = $derived(() => {
		const tiers: { value: string; label: string; categories: { slug: string; label: string; fixed_loadout?: any }[] }[] = [];
		if (game.full_runs?.length) tiers.push({ value: 'full_runs', label: 'Full Runs', categories: flattenWithChildren(game.full_runs) });
		if (game.mini_challenges?.length) tiers.push({ value: 'mini_challenges', label: 'Mini-Challenges', categories: flattenWithChildren(game.mini_challenges) });
		if (game.player_made?.length) tiers.push({ value: 'player_made', label: 'Player-Made', categories: flattenWithChildren(game.player_made) });
		// Inject "Other" for games in Community Review or with no categories yet
		if (game.status === 'Community Review' || tiers.length === 0) {
			tiers.push({ value: 'other', label: 'Other (Write-in)', categories: [{ slug: 'other', label: 'Other' }] });
		}
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
	const customCategoryWarning = $derived(checkBannedTerms(customCategoryText));
	const isOtherCategory = $derived(categoryTier === 'other');
	const canSubmit = $derived(
		!!$session &&
		!game.frozen_at &&
		!!categoryTier &&
		(isOtherCategory ? !!customCategoryText.trim() : !!categorySlug) &&
		!!videoUrl &&
		videoValid &&
		!!turnstileToken &&
		!notesWarning &&
		!customCategoryWarning &&
		!submitting &&
		(!platformRequired || !!platform)
	);

	// ── Typeahead Helpers ──
	function norm(s: string) { return s.trim().toLowerCase(); }
	function filterItems(items: { id?: string; slug?: string; label: string }[], search: string) {
		const q = norm(search);
		if (!q) return items.slice(0, 20);
		return items.filter(i => norm(i.label).includes(q) || norm(i.id || i.slug || '').includes(q)).slice(0, 20);
	}

	function clearPlatform() { platform = ''; platformSearch = ''; }
	function clearCharacter() { character = ''; charSearch = ''; }
	function clearGlitch() { glitchId = ''; glitchSearch = ''; }
	function clearDifficulty() { difficulty = ''; diffSearch = ''; }

	// ── Community Review: write-in helpers ───────────────────────────────────
	function writeInSlug(text: string): string {
		return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
	}
	function charCloseReview() {
		charFilterText = '';
		if (!character && isReview && charSearch.trim()) { character = writeInSlug(charSearch); }
	}
	function diffCloseReview() {
		diffFilterText = '';
		if (!difficulty && isReview && diffSearch.trim()) { difficulty = writeInSlug(diffSearch); }
	}
	function glitchCloseReview() {
		glitchFilterText = '';
		if (!glitchId && isReview && glitchSearch.trim()) { glitchId = writeInSlug(glitchSearch); }
	}
	function addCustomChallenge() {
		const text = customChallengeInput.trim();
		if (!text || customChallenges.length >= WRITE_IN_LIMITS.challenges) return;
		if (!customChallenges.includes(text) && !selectedChallenges.includes(writeInSlug(text))) {
			customChallenges = [...customChallenges, text];
		}
		customChallengeInput = '';
	}
	function removeCustomChallenge(i: number) { customChallenges = customChallenges.filter((_, idx) => idx !== i); }
	function addCustomRestriction() {
		const text = customRestrictionInput.trim();
		if (!text || customRestrictions.length >= WRITE_IN_LIMITS.restrictions) return;
		if (!customRestrictions.includes(text) && !selectedRestrictions.includes(writeInSlug(text))) {
			customRestrictions = [...customRestrictions, text];
		}
		customRestrictionInput = '';
	}
	function removeCustomRestriction(i: number) { customRestrictions = customRestrictions.filter((_, idx) => idx !== i); }

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

	let expandedChallenges = $state<Set<string>>(new Set());
	function toggleChallengeExpand(slug: string) {
		const next = new Set(expandedChallenges);
		if (next.has(slug)) next.delete(slug); else next.add(slug);
		expandedChallenges = next;
	}

	// Flatten items with children for typeahead search
	function flattenForSearch(items: any[]): { slug: string; label: string }[] {
		const flat: { slug: string; label: string }[] = [];
		for (const item of items) {
			if (item.children?.length) {
				for (const child of item.children) flat.push({ slug: child.slug, label: `${item.label} › ${child.label}` });
			} else {
				flat.push({ slug: item.slug, label: item.label });
			}
		}
		return flat;
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

			// Merge custom write-in challenges/restrictions with selected ones
			const allChallenges = [
				...selectedChallenges,
				...customChallenges.map(c => writeInSlug(c)),
			];
			const allRestrictions = [
				...selectedRestrictions,
				...customRestrictions.map(r => writeInSlug(r)),
			];

			// Build write-in metadata for verifier notes
			const writeIns: string[] = [];
			if (isOtherCategory && customCategoryText.trim()) writeIns.push(`Category: ${customCategoryText.trim()}`);
			if (isReview && charSearch.trim() && !(game.characters_data || []).some((c: any) => c.slug === character)) writeIns.push(`Character: ${charSearch.trim()}`);
			if (isReview && diffSearch.trim() && !(game.difficulties_data || []).some((d: any) => d.slug === difficulty)) writeIns.push(`Difficulty: ${diffSearch.trim()}`);
			if (isReview && glitchSearch.trim() && !(game.glitches_data || []).some((g: any) => g.slug === glitchId)) writeIns.push(`Glitch: ${glitchSearch.trim()}`);
			if (customChallenges.length) writeIns.push(`Challenges: ${customChallenges.join(', ')}`);
			if (customRestrictions.length) writeIns.push(`Restrictions: ${customRestrictions.join(', ')}`);

			const payload: Record<string, any> = {
				turnstile_token: turnstileToken,
				schema_version: 7,
				game_id: game.game_id,
				category_tier: isOtherCategory ? 'full_runs' : categoryTier,
				category_slug: isOtherCategory ? 'other' : categorySlug,
				custom_category_text: isOtherCategory ? customCategoryText.trim() : undefined,
				standard_challenges: allChallenges.length > 0 ? allChallenges : [],
				character: character || undefined,
				difficulty: difficulty || undefined,
				glitch_id: glitchId || undefined,
				restrictions: allRestrictions.length > 0 ? allRestrictions : [],
				platform: platform || undefined,
				video_url: videoUrl,
				runner_notes: submitterNotes.trim() || undefined,
				write_in_fields: writeIns.length > 0 ? writeIns : undefined,
			};

			if (dateCompleted) payload.date_completed = dateCompleted;
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
			categoryTier = ''; categorySlug = ''; customCategoryText = ''; selectedChallenges = []; character = '';
			customChallenges = []; customRestrictions = []; customChallengeInput = ''; customRestrictionInput = '';
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
			<span class="empty-state__icon"><Lock size={24} /></span>
			<h3>{m.sign_in_required()}</h3>
			<p class="muted">{m.sign_in_required_submit()}</p>
			<a href={localizeHref(`/sign-in?redirect=/games/${game.game_id}/submit`)} class="btn btn--accent mt-2">{m.btn_sign_in()}</a>
		</div>
	</div>
{:else if successMsg}
	<div class="card">
		<div class="success-state">
			<span class="success-state__icon"><CheckCircle size={24} /></span>
			<h3>{m.submitted_success()}</h3>
			<p class="muted">{successMsg}</p>
			<div class="success-actions">
				<Button.Root variant="accent" onclick={() => successMsg = ''}>{m.btn_submit_another()}</Button.Root>
				<a href={localizeHref(`/games/${game.game_id}/runs`)} class="btn">{m.btn_view_runs()}</a>
				<a href={localizeHref('/profile/submissions')} class="btn"><Clipboard size={14} /> {m.user_menu_submissions()}</a>
			</div>
		</div>
	</div>
{:else}
	{#if game.frozen_at}
		<div class="card">
			<div class="empty-state">
				<span class="empty-state__icon"><Lock size={32} /></span>
				<h3>Submissions Paused</h3>
				<p class="muted">This game is currently frozen and not accepting new run submissions. Please check back later.</p>
				<a href={localizeHref(`/games/${game.game_id}`)} class="btn mt-2"><ArrowLeft size={14} /> Back to Game</a>
			</div>
		</div>
	{:else}
	<form class="submit-form" onsubmit={handleSubmit}>

		<!-- 1. Category Selection -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_category()} <span class="req">*</span></p>
			<p class="submit-section__sub">{m.submit_run_category_sub()}</p>
			{#if game.status === 'Community Review'}
				<div class="review-notice">
					<span class="review-notice__icon"><Construction size={24} /></span>
					<p>This game is in <strong>Community Review</strong> — categories are still being finalized. You can select an existing category or use <strong>Other (Write-in)</strong> to describe your run.</p>
				</div>
			{/if}
			<div class="field-row">
				<div class="field">
					<label class="field-label">{m.submit_run_tier()} <span class="req">*</span></label>
					<Select.Root bind:value={categoryTier} onValueChange={(v: string) => { if (v === 'other') { categorySlug = 'other'; } else { categorySlug = ''; } }}>
						<Select.Trigger>{tierOptions().find(t => t.value === categoryTier)?.label || m.submit_run_select_tier()}</Select.Trigger>
						<Select.Content>
							{#each tierOptions() as tier}
								<Select.Item value={tier.value} label={tier.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				{#if isOtherCategory}
					<div class="field">
						<label class="field-label">Describe your category <span class="req">*</span></label>
						<input type="text" class="fi" bind:value={customCategoryText} placeholder="e.g. Any% Hitless, All Bosses No Damage…" maxlength="200" />
						{#if customCategoryWarning}<p class="field-warn">{customCategoryWarning}</p>{/if}
					</div>
				{:else}
					<div class="field">
						<label class="field-label">{m.submit_run_section_category()} <span class="req">*</span></label>
						<Select.Root bind:value={categorySlug} disabled={!categoryTier}>
							<Select.Trigger>{categoryOptions.find((c: any) => c.slug === categorySlug)?.label || m.submit_run_select_category()}</Select.Trigger>
							<Select.Content>
								{#each categoryOptions as cat}
									<Select.Item value={cat.slug} label={cat.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
			</div>
		</div>

		<!-- 2. Platform (typeahead, filtered to game) -->
		<div class="submit-section">
			<p class="submit-section__title">{m.submit_run_section_platform()}{#if platformRequired} <span class="req">*</span>{/if}</p>
			<p class="submit-section__sub">{#if platformRequired}{m.submit_run_platform_required()}{:else}{m.submit_run_platform_optional()}{/if}</p>
			<div class="field" style="max-width: 300px;">
				<div class="combobox-wrap">
					<Combobox.Root class="combobox-single" bind:inputValue={platformSearch} onInputValueChange={(v: string) => { platformFilterText = v; }} onValueChange={(v: string) => { platform = v; }} onOpenChange={(o: boolean) => { if (!o) platformFilterText = ''; }}>
						<Combobox.Input placeholder={m.submit_run_type_platform()} />
						<Combobox.Content>
							{#each filterItems(gamePlatforms, platformFilterText) as p}
								<Combobox.Item value={p.id ?? ''} label={p.label}>{p.label}</Combobox.Item>
							{/each}
							{#if filterItems(gamePlatforms, platformFilterText).length === 0}
								<div class="combobox-empty">{m.submit_run_no_matches()}</div>
							{/if}
						</Combobox.Content>
					</Combobox.Root>
					{#if platform}<button type="button" class="combobox-clear" onclick={clearPlatform}><X size={14} /></button>{/if}
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
						<span class="coming-soon-stub__icon"><Users size={24} /></span>
						<span class="coming-soon-stub__text">{m.submit_run_multi_runner_soon()}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- 4. Character (typeahead or write-in) -->
		{#if (game.character_column?.enabled && game.characters_data?.length) || isReview}
			<div class="submit-section">
				<p class="submit-section__title">{game.character_column?.label || 'Character'}{#if fixedLoadout?.character} <span class="fixed-badge"><Lock size={14} /> {m.submit_run_fixed_badge()}</span>{/if}{#if isReview && !(game.characters_data?.length)} <span class="write-in-hint">Write-in</span>{/if}</p>
				<div class="field">
					{#if fixedLoadout?.character}
						<input type="text" class="fi" value={charSearch} disabled />
						<span class="field-hint">{m.submit_run_locked_hint({ label: (game.character_column?.label || 'character').toLowerCase() })}</span>
					{:else if isReview && !(game.characters_data?.length)}
						<input type="text" class="fi" bind:value={charSearch} placeholder="e.g. Knight, Warrior…" maxlength="100"
							onblur={() => { if (charSearch.trim()) character = writeInSlug(charSearch); else { character = ''; } }} />
					{:else}
						<div class="combobox-wrap">
							<Combobox.Root class="combobox-single" bind:inputValue={charSearch} onInputValueChange={(v: string) => { charFilterText = v; }} onValueChange={(v: string) => { character = v; }} onOpenChange={(o: boolean) => { if (!o) charCloseReview(); }}>
								<Combobox.Input placeholder="Type a {(game.character_column?.label || 'character').toLowerCase()}..." />
								<Combobox.Content>
									{#each filterItems(flattenForSearch(game.characters_data || []), charFilterText) as c}
										<Combobox.Item value={c.slug ?? ''} label={c.label}>{c.label}</Combobox.Item>
									{/each}
									{#if filterItems(flattenForSearch(game.characters_data || []), charFilterText).length === 0}
										<div class="combobox-empty">{isReview ? 'No match — your text will be used as a write-in' : m.submit_run_no_matches()}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
							{#if character}<button type="button" class="combobox-clear" onclick={clearCharacter}><X size={14} /></button>{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- 4b. Difficulty (typeahead or write-in) -->
		{#if (game.difficulty_column?.enabled && game.difficulties_data?.length) || isReview}
			<div class="submit-section">
				<p class="submit-section__title">{game.difficulty_column?.label || 'Difficulty'}{#if isReview && !(game.difficulties_data?.length)} <span class="write-in-hint">Write-in</span>{/if}</p>
				<div class="field">
					{#if isReview && !(game.difficulties_data?.length)}
						<input type="text" class="fi" bind:value={diffSearch} placeholder="e.g. Hard, Nightmare…" maxlength="100"
							onblur={() => { if (diffSearch.trim()) difficulty = writeInSlug(diffSearch); else { difficulty = ''; } }} />
					{:else}
						<div class="combobox-wrap">
							<Combobox.Root class="combobox-single" bind:inputValue={diffSearch} onInputValueChange={(v: string) => { diffFilterText = v; }} onValueChange={(v: string) => { difficulty = v; }} onOpenChange={(o: boolean) => { if (!o) diffCloseReview(); }}>
								<Combobox.Input placeholder="Type a {(game.difficulty_column?.label || 'difficulty').toLowerCase()}..." />
								<Combobox.Content>
									{#each filterItems(flattenForSearch(game.difficulties_data || []), diffFilterText) as d}
										<Combobox.Item value={d.slug ?? ''} label={d.label}>{d.label}</Combobox.Item>
									{/each}
									{#if filterItems(flattenForSearch(game.difficulties_data || []), diffFilterText).length === 0}
										<div class="combobox-empty">{isReview ? 'No match — your text will be used as a write-in' : m.submit_run_no_matches()}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
							{#if difficulty}<button type="button" class="combobox-clear" onclick={clearDifficulty}><X size={14} /></button>{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- 5. Challenges (chip grid + write-in tags) -->
		{#if game.challenges_data?.length || isReview}
			<div class="submit-section">
				<p class="submit-section__title">{m.submit_run_section_challenges()}{#if fixedLoadout?.challenge} <span class="fixed-badge"><Lock size={14} /> {m.submit_run_fixed_badge()}</span>{/if}</p>
				<p class="submit-section__sub">{m.submit_run_challenges_sub()}</p>
				{#if game.challenges_data?.length}
					<div class="chip-grid">
						{#each game.challenges_data as ch}
							{@const isLocked = fixedLoadout?.challenge === ch.slug}
							{@const hasChildren = (ch.children?.length ?? 0) > 0}
							{@const isExpanded = expandedChallenges.has(ch.slug)}
							{@const childActive = hasChildren && ch.children?.some((c: any) => selectedChallenges.includes(c.slug))}
							{#if hasChildren}
								<button type="button" class="chip chip--parent" class:chip--expanded={isExpanded} class:chip--child-active={childActive} onclick={() => toggleChallengeExpand(ch.slug)}>
									{ch.label} <span class="chip__arrow">{isExpanded ? 'chevron-up' : 'chevron-down'}</span>
									{#if childActive}<span class="chip__count">{ch.children?.filter((c: any) => selectedChallenges.includes(c.slug)).length}</span>{/if}
								</button>
								{#if isExpanded}
									<div class="chip-children">
										{#if ch.child_select === 'single'}<span class="chip-children__hint">Pick one</span>{/if}
										{#each ch.children as child}
											{@const childLocked = fixedLoadout?.challenge === child.slug}
											<button type="button" class="chip" class:chip--active={selectedChallenges.includes(child.slug)} class:chip--locked={childLocked} onclick={() => { if (!childLocked) toggleChallenge(child.slug); }} disabled={childLocked}>{child.label}{#if childLocked} <Lock size={14} />{/if}</button>
										{/each}
									</div>
								{/if}
							{:else}
								<button type="button" class="chip" class:chip--active={selectedChallenges.includes(ch.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleChallenge(ch.slug); }} disabled={isLocked}>{ch.label}{#if isLocked} <Lock size={14} />{/if}</button>
							{/if}
						{/each}
					</div>
				{/if}
				{#if fixedLoadout?.challenge}
					<span class="field-hint mt-1">{m.submit_run_challenge_required()}</span>
				{/if}
				{#if isReview}
					<div class="write-in-tags">
						<label class="write-in-tags__label">Custom challenges <span class="muted">({customChallenges.length}/{WRITE_IN_LIMITS.challenges})</span></label>
						{#if customChallenges.length > 0}
							<div class="tag-list">
								{#each customChallenges as tag, i}
									<span class="tag">{tag} <button type="button" class="tag__remove" onclick={() => removeCustomChallenge(i)}><X size={12} /></button></span>
								{/each}
							</div>
						{/if}
						{#if customChallenges.length < WRITE_IN_LIMITS.challenges}
							<div class="write-in-input">
								<input type="text" class="fi" bind:value={customChallengeInput} placeholder="Type a challenge name and press Enter…" maxlength="100"
									onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomChallenge(); } }} />
								<button type="button" class="btn btn--small btn--add" onclick={addCustomChallenge} disabled={!customChallengeInput.trim()}>+ Add</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- 6. Glitch Category (typeahead or write-in) -->
		{#if game.glitches_data?.length || isReview}
			<div class="submit-section">
				<p class="submit-section__title">{m.submit_run_section_glitch()}{#if isReview && !(game.glitches_data?.length)} <span class="write-in-hint">Write-in</span>{/if}</p>
				<div class="field">
					{#if isReview && !(game.glitches_data?.length)}
						<input type="text" class="fi" bind:value={glitchSearch} placeholder="e.g. Any%, NMG, Glitchless…" maxlength="100"
							onblur={() => { if (glitchSearch.trim()) glitchId = writeInSlug(glitchSearch); else { glitchId = ''; } }} />
					{:else}
						<div class="combobox-wrap">
							<Combobox.Root class="combobox-single" bind:inputValue={glitchSearch} onInputValueChange={(v: string) => { glitchFilterText = v; }} onValueChange={(v: string) => { glitchId = v; }} onOpenChange={(o: boolean) => { if (!o) glitchCloseReview(); }}>
								<Combobox.Input placeholder={m.submit_run_type_glitch()} />
								<Combobox.Content>
									{#each filterItems(flattenForSearch(game.glitches_data || []), glitchFilterText) as g}
										<Combobox.Item value={g.slug ?? ''} label={g.label}>{g.label}</Combobox.Item>
									{/each}
									{#if filterItems(flattenForSearch(game.glitches_data || []), glitchFilterText).length === 0}
										<div class="combobox-empty">{isReview ? 'No match — your text will be used as a write-in' : m.submit_run_no_matches()}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
							{#if glitchId}<button type="button" class="combobox-clear" onclick={clearGlitch}><X size={14} /></button>{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- 7. Restrictions (expandable groups + write-in tags) -->
		{#if game.restrictions_data?.length || isReview}
			<div class="submit-section">
				<p class="submit-section__title">{m.submit_run_section_restrictions()}{#if fixedLoadout?.restriction} <span class="fixed-badge"><Lock size={14} /> {m.submit_run_fixed_badge()}</span>{/if}</p>
				<p class="submit-section__sub">{m.submit_run_restrictions_sub()}{#if game.restrictions_data?.some((r: any) => r.children?.length)} {m.submit_run_restrictions_click_group()}{/if}</p>
				{#if game.restrictions_data?.length}
					<div class="chip-grid">
						{#each game.restrictions_data as r}
							{@const isLocked = fixedLoadout?.restriction === r.slug}
							{@const hasChildren = (r.children?.length ?? 0) > 0}
							{@const isExpanded = expandedRestrictions.has(r.slug)}
							{@const childActive = hasChildren && r.children?.some((c: any) => selectedRestrictions.includes(c.slug))}
							{#if hasChildren}
								<button type="button" class="chip chip--parent" class:chip--expanded={isExpanded} class:chip--child-active={childActive} onclick={() => toggleRestrictionExpand(r.slug)}>
									{r.label} <span class="chip__arrow">{isExpanded ? 'chevron-up' : 'chevron-down'}</span>
									{#if childActive}<span class="chip__count">{r.children?.filter((c: any) => selectedRestrictions.includes(c.slug)).length}</span>{/if}
								</button>
								{#if isExpanded}
									<div class="chip-children">
										{#if r.child_select === 'single'}<span class="chip-children__hint">{m.submit_run_pick_one()}</span>{/if}
										{#each r.children as child}
											{@const childLocked = fixedLoadout?.restriction === child.slug}
											<button type="button" class="chip" class:chip--active={selectedRestrictions.includes(child.slug)} class:chip--locked={childLocked} onclick={() => { if (!childLocked) toggleRestriction(child.slug, r); }} disabled={childLocked}>{child.label}{#if childLocked} <Lock size={14} />{/if}</button>
										{/each}
									</div>
								{/if}
							{:else}
								<button type="button" class="chip" class:chip--active={selectedRestrictions.includes(r.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleRestriction(r.slug); }} disabled={isLocked}>{r.label}{#if isLocked} <Lock size={14} />{/if}</button>
							{/if}
						{/each}
					</div>
				{/if}
				{#if fixedLoadout?.restriction}
					<span class="field-hint mt-1">{m.submit_run_restriction_required()}</span>
				{/if}
				{#if isReview}
					<div class="write-in-tags">
						<label class="write-in-tags__label">Custom restrictions <span class="muted">({customRestrictions.length}/{WRITE_IN_LIMITS.restrictions})</span></label>
						{#if customRestrictions.length > 0}
							<div class="tag-list">
								{#each customRestrictions as tag, i}
									<span class="tag">{tag} <button type="button" class="tag__remove" onclick={() => removeCustomRestriction(i)}><X size={12} /></button></span>
								{/each}
							</div>
						{/if}
						{#if customRestrictions.length < WRITE_IN_LIMITS.restrictions}
							<div class="write-in-input">
								<input type="text" class="fi" bind:value={customRestrictionInput} placeholder="Type a restriction and press Enter…" maxlength="100"
									onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRestriction(); } }} />
								<button type="button" class="btn btn--small btn--add" onclick={addCustomRestriction} disabled={!customRestrictionInput.trim()}>+ Add</button>
							</div>
						{/if}
					</div>
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
					<span class="video-meta__icon"><Video size={14} /></span>
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
	.review-notice { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.65rem 0.85rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; margin-bottom: 0.85rem; font-size: 0.82rem; color: var(--fg); }
	.review-notice__icon { font-size: 1.1rem; flex-shrink: 0; }
	.review-notice p { margin: 0; line-height: 1.45; }
	.field-warn { color: #ef4444; font-size: 0.78rem; margin-top: 0.25rem; }

	/* Write-in styles */
	.write-in-hint { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.1rem 0.4rem; border-radius: 4px; background: rgba(245, 158, 11, 0.12); color: #f59e0b; vertical-align: middle; margin-left: 0.35rem; }
	.write-in-tags { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border); }
	.write-in-tags__label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.4rem; }
	.write-in-input { display: flex; gap: 0.5rem; align-items: center; }
	.write-in-input .fi { flex: 1; }
	.tag-list { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
	.tag { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.5rem; font-size: 0.8rem; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.25); color: var(--fg); border-radius: 5px; }
	.tag__remove { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 0.7rem; padding: 0; font-family: inherit; line-height: 1; }
	.tag__remove:hover { color: #ef4444; }

	.field { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem; }
	.field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
	.field-hint { font-size: 0.75rem; color: var(--text-muted); }
	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	.field-row-between { display: flex; justify-content: space-between; align-items: center; }

	input, textarea {
		width: 100%; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; resize: vertical;
	}
	input:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(var(--accent-rgb, 59, 195, 110), 0.15); }
	input:hover:not(:disabled):not(:focus), textarea:hover:not(:disabled):not(:focus) { border-color: color-mix(in srgb, var(--border) 50%, var(--accent)); }
	input::placeholder, textarea::placeholder { color: var(--border); }
	input:disabled { opacity: 0.5; }
	.field--error { border-color: #ef4444 !important; }
	.field-error { color: #ef4444; font-size: 0.75rem; }

	/* Typeahead */
	/* Combobox */
	.combobox-wrap { position: relative; }
	.combobox-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 2px 5px; border-radius: 3px; z-index: 1; }
	.combobox-clear:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
	.combobox-empty { padding: 0.5rem 0.6rem; color: var(--muted); font-size: 0.8rem; }

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
	.runner-autofill--none :global(a) { color: var(--accent); }

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
