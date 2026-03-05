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

	// Section 2: Platforms
	let selectedPlatforms = $state<string[]>([]);
	let platformSearch = $state('');
	let customPlatforms = $state<string[]>([]);
	const PLATFORM_DISPLAY_LIMIT = 30;

	let filteredPlatforms = $derived.by(() => {
		if (platformSearch.trim()) {
			const q = platformSearch.toLowerCase();
			return platforms.filter((p: any) => p.label.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
		}
		return platforms.slice(0, PLATFORM_DISPLAY_LIMIT);
	});

	function togglePlatform(slug: string) {
		if (selectedPlatforms.includes(slug)) {
			selectedPlatforms = selectedPlatforms.filter(s => s !== slug);
		} else {
			selectedPlatforms = [...selectedPlatforms, slug];
		}
	}
	function addCustomPlatform() { if (customPlatforms.length < 2) customPlatforms = [...customPlatforms, '']; }
	function removeCustomPlatform(i: number) { customPlatforms = customPlatforms.filter((_, idx) => idx !== i); }
	function customPlatformDuplicate(value: string): string | null {
		if (!value.trim()) return null;
		const q = value.trim().toLowerCase();
		const match = platforms.find((p: any) =>
			p.label.toLowerCase() === q || p.slug === q ||
			(p.aliases || []).some((a: string) => a.toLowerCase() === q)
		);
		return match ? `"${match.label}" already exists as an option.` : null;
	}

	// Section 3: Genres
	let selectedGenres = $state<string[]>([]);
	let genreSearch = $state('');
	let customGenres = $state<string[]>([]);
	const GENRE_DISPLAY_LIMIT = 30;

	let totalGenreCount = $derived(selectedGenres.length + customGenres.filter(g => g.trim()).length);

	let filteredGenres = $derived.by(() => {
		if (genreSearch.trim()) {
			const q = genreSearch.toLowerCase();
			return genres.filter((g: any) => g.label.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q));
		}
		return genres.slice(0, GENRE_DISPLAY_LIMIT);
	});

	function toggleGenre(slug: string) {
		if (selectedGenres.includes(slug)) {
			selectedGenres = selectedGenres.filter(s => s !== slug);
		} else if (totalGenreCount < 5) {
			selectedGenres = [...selectedGenres, slug];
		}
	}
	function addCustomGenre() {
		if (totalGenreCount < 5 && customGenres.length < 3) customGenres = [...customGenres, ''];
	}
	function removeCustomGenre(i: number) {
		customGenres = customGenres.filter((_, idx) => idx !== i);
	}
	function customGenreDuplicate(value: string): string | null {
		if (!value.trim()) return null;
		const q = value.trim().toLowerCase();
		const match = genres.find((g: any) =>
			g.label.toLowerCase() === q || g.slug === q ||
			(g.aliases || []).some((a: string) => a.toLowerCase() === q)
		);
		return match ? `"${match.label}" already exists as an option.` : null;
	}

	// Section 4: Run Categories
	interface FullRunEntry {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
	}
	let fullRunCategories = $state<FullRunEntry[]>([]);

	interface MiniChild {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
		fixedCharacter: string;
		fixedRestriction: string;
	}
	interface MiniChallengeGroup {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
		children: MiniChild[];
	}
	let miniChallengeGroups = $state<MiniChallengeGroup[]>([]);

	const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	function addFullRun() {
		fullRunCategories = [...fullRunCategories, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '' }];
		editingSection = 'fr'; editingIndex = fullRunCategories.length - 1;
	}
	function removeFullRun(i: number) { fullRunCategories = fullRunCategories.filter((_, idx) => idx !== i); }

	function addMiniGroup() {
		miniChallengeGroups = [...miniChallengeGroups, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '', children: [] }];
		editingSection = 'mc'; editingIndex = miniChallengeGroups.length - 1;
	}
	function removeMiniGroup(i: number) {
		miniChallengeGroups = miniChallengeGroups.filter((_, idx) => idx !== i);
	}
	function addMiniChild(groupIdx: number) {
		miniChallengeGroups = miniChallengeGroups.map((g, i) =>
			i === groupIdx ? { ...g, children: [...g.children, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '', fixedCharacter: '', fixedRestriction: '' }] } : g
		);
	}
	function removeMiniChild(groupIdx: number, childIdx: number) {
		miniChallengeGroups = miniChallengeGroups.map((g, i) =>
			i === groupIdx ? { ...g, children: g.children.filter((_, ci) => ci !== childIdx) } : g
		);
	}

	let hasAtLeastOneCategory = $derived.by(() => {
		const hasFullRun = fullRunCategories.some(c => c.label.trim());
		const hasMini = miniChallengeGroups.some(g => g.label.trim());
		return hasFullRun || hasMini;
	});

	// Section 5: Challenges (alphabetical)
	const STANDARD_CHALLENGES = [
		'Blindfolded', 'Damageless', 'Deathless', 'Flawless',
		'Hitless', 'Minimalist', 'Pacifist', 'Speedrun'
	];
	let selectedChallenges = $state<string[]>([]);
	let challengeExceptions = $state<Record<string, string>>({});
	let customChallengeEnabled = $state(false);
	let customChallengeName = $state('');
	let customChallengeDescription = $state('');

	function toggleChallenge(c: string) {
		if (selectedChallenges.includes(c)) {
			selectedChallenges = selectedChallenges.filter(s => s !== c);
			const { [c]: _, ...rest } = challengeExceptions;
			challengeExceptions = rest;
		} else {
			selectedChallenges = [...selectedChallenges, c];
		}
	}

	let hasAtLeastOneChallenge = $derived(
		selectedChallenges.length > 0 || (customChallengeEnabled && customChallengeName.trim())
	);

	// Section 6: Characters
	let characterEnabled = $state(false);
	let characterLabel = $state('Character');
	let characterOptions = $state<string[]>([]);

	function addCharacter() { characterOptions = [...characterOptions, '']; }
	function removeCharacter(i: number) { characterOptions = characterOptions.filter((_, idx) => idx !== i); }

	// Section 7: Restrictions (parent-child with descriptions and exceptions)
	interface RestrictionChild {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
	}
	interface RestrictionGroup {
		slug: string;
		label: string;
		description: string;
		hasExceptions: boolean;
		exceptions: string;
		children: RestrictionChild[];
	}
	let restrictions = $state<RestrictionGroup[]>([]);
	function addRestriction() {
		restrictions = [...restrictions, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '', children: [] }];
		editingSection = 'rs'; editingIndex = restrictions.length - 1;
	}
	function removeRestriction(i: number) { restrictions = restrictions.filter((_, idx) => idx !== i); }
	function addRestrictionChild(parentIdx: number) {
		restrictions = restrictions.map((r, i) =>
			i === parentIdx ? { ...r, children: [...r.children, { slug: '', label: '', description: '', hasExceptions: false, exceptions: '' }] } : r
		);
	}
	function removeRestrictionChild(parentIdx: number, childIdx: number) {
		restrictions = restrictions.map((r, i) =>
			i === parentIdx ? { ...r, children: r.children.filter((_, ci) => ci !== childIdx) } : r
		);
	}

	// Section 8: Timing
	let timingMethod = $state('RTA');
	const TIMING_OPTIONS = [
		{ value: 'RTA', label: 'RTA (Real Time Attack)' },
		{ value: 'IGT', label: 'IGT (In-Game Time)' },
		{ value: 'LRT', label: 'LRT (Load-Removed Time)' },
	];

	// Section 9: Glitches
	const GLITCH_PRESETS = [
		{ slug: 'unrestricted', label: 'Unrestricted', hint: 'Any and all glitches are allowed' },
		{ slug: 'nmg', label: 'No Major Glitches (NMG)', hint: '' },
		{ slug: 'glitchless', label: 'Glitchless', hint: '' },
	];
	let selectedGlitches = $state<string[]>([]);
	let nmgRules = $state('');
	let customGlitches = $state<{ name: string; description: string }[]>([]);
	let glitchDocLinks = $state('');

	function toggleGlitch(slug: string) {
		if (selectedGlitches.includes(slug)) {
			selectedGlitches = selectedGlitches.filter(s => s !== slug);
			if (slug === 'nmg') nmgRules = '';
		} else {
			selectedGlitches = [...selectedGlitches, slug];
		}
	}
	function addCustomGlitch() { customGlitches = [...customGlitches, { name: '', description: '' }]; }
	function removeCustomGlitch(i: number) { customGlitches = customGlitches.filter((_, idx) => idx !== i); }

	// Section 10: Rules
	let generalRules = $state('');

	// Section 11: Involvement & Notes
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

	// ── Draft Save/Load ──────────────────────────────────────
	let draftStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let draftExists = $state(false);
	let draftLoading = $state(true);
	let draftPromptVisible = $state(false);

	function serializeForm() {
		return {
			gameName, aliases, description,
			selectedPlatforms, customPlatforms, selectedGenres, customGenres,
			fullRunCategories, miniChallengeGroups,
			selectedChallenges, challengeExceptions, customChallengeEnabled, customChallengeName, customChallengeDescription,
			characterEnabled, characterLabel, characterOptions,
			restrictions, timingMethod,
			selectedGlitches, nmgRules, customGlitches, glitchDocLinks,
			generalRules, involvement, additionalNotes,
		};
	}

	function loadFormFromDraft(d: any) {
		if (!d) return;
		gameName = d.gameName ?? '';
		aliases = d.aliases ?? '';
		description = d.description ?? '';
		selectedPlatforms = d.selectedPlatforms ?? [];
		customPlatforms = d.customPlatforms ?? [];
		selectedGenres = d.selectedGenres ?? [];
		customGenres = d.customGenres ?? [];
		fullRunCategories = d.fullRunCategories ?? [];
		miniChallengeGroups = d.miniChallengeGroups ?? [];
		selectedChallenges = d.selectedChallenges ?? [];
		challengeExceptions = d.challengeExceptions ?? {};
		customChallengeEnabled = d.customChallengeEnabled ?? false;
		customChallengeName = d.customChallengeName ?? '';
		customChallengeDescription = d.customChallengeDescription ?? '';
		characterEnabled = d.characterEnabled ?? false;
		characterLabel = d.characterLabel ?? 'Character';
		characterOptions = d.characterOptions ?? [];
		restrictions = d.restrictions ?? [];
		timingMethod = d.timingMethod ?? 'RTA';
		selectedGlitches = d.selectedGlitches ?? [];
		nmgRules = d.nmgRules ?? '';
		customGlitches = d.customGlitches ?? [];
		glitchDocLinks = d.glitchDocLinks ?? '';
		generalRules = d.generalRules ?? '';
		involvement = d.involvement ?? [];
		additionalNotes = d.additionalNotes ?? '';
	}

	async function checkForDraft() {
		if (!$user) { draftLoading = false; return; }
		try {
			const { data: draft, error } = await supabase
				.from('game_submission_drafts')
				.select('draft_data')
				.eq('user_id', $user.id)
				.maybeSingle();
			if (!error && draft?.draft_data) {
				draftExists = true;
				draftPromptVisible = true;
			}
		} catch { /* silent — table may not exist yet */ }
		draftLoading = false;
	}

	async function loadDraft() {
		if (!$user) return;
		try {
			const { data: draft } = await supabase
				.from('game_submission_drafts')
				.select('draft_data')
				.eq('user_id', $user.id)
				.maybeSingle();
			if (draft?.draft_data) {
				loadFormFromDraft(draft.draft_data);
			}
		} catch { /* silent */ }
		draftPromptVisible = false;
	}

	function dismissDraftPrompt() {
		draftPromptVisible = false;
	}

	async function saveDraft() {
		if (!$user) return;
		draftStatus = 'saving';
		try {
			const { error } = await supabase
				.from('game_submission_drafts')
				.upsert({
					user_id: $user.id,
					draft_data: serializeForm(),
					updated_at: new Date().toISOString(),
				}, { onConflict: 'user_id' });
			if (error) throw error;
			draftStatus = 'saved';
			draftExists = true;
			setTimeout(() => { if (draftStatus === 'saved') draftStatus = 'idle'; }, 3000);
		} catch {
			draftStatus = 'error';
			setTimeout(() => { if (draftStatus === 'error') draftStatus = 'idle'; }, 4000);
		}
	}

	async function deleteDraft() {
		if (!$user) return;
		try {
			await supabase
				.from('game_submission_drafts')
				.delete()
				.eq('user_id', $user.id);
			draftExists = false;
		} catch { /* silent */ }
	}

	$effect(() => {
		if ($user) checkForDraft();
	});

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
			{ label: 'Custom challenge', value: customChallengeName },
			{ label: 'Custom challenge description', value: customChallengeDescription },
		];
		for (const f of fields) {
			const result = checkBannedTerms(f.value);
			if (result) return `${f.label}: ${result}`;
		}
		return null;
	});

	let submitting = $state(false);
	let result = $state<{ ok: boolean; message: string } | null>(null);

	let hasEnoughCharacters = $derived(
		!characterEnabled || characterOptions.filter(c => c.trim()).length >= 2
	);

	let canSubmit = $derived(
		gameName.trim() &&
		hasAtLeastOneCategory &&
		hasAtLeastOneChallenge &&
		hasEnoughCharacters &&
		turnstileToken &&
		!submitting &&
		!bannedTermsWarning
	);

	// ── Item card editing (game-editor pattern) ─────────────
	let editingSection = $state<string | null>(null);
	let editingIndex = $state<number | null>(null);

	function toggleEdit(section: string, idx: number) {
		if (editingSection === section && editingIndex === idx) { editingSection = null; editingIndex = null; }
		else { editingSection = section; editingIndex = idx; }
	}
	function isEditing(section: string, idx: number) { return editingSection === section && editingIndex === idx; }

	function isDuplicateSlug(slug: string, list: any[], excludeIndex: number) {
		if (!slug) return false;
		return list.some((item: any, i: number) => i !== excludeIndex && item.slug === slug);
	}

	// ── Collapsible sections ──────────────────────────────────
	// Required sections open, optional closed, except Involvement (open).
	let openSections = $state<Record<string, boolean>>({
		info: true,
		platforms: false,
		genres: false,
		categories: true,
		challenges: true,
		characters: true,
		restrictions: false,
		timing: false,
		glitches: false,
		rules: false,
		involvement: true,
	});

	function toggleSection(key: string) {
		openSections = { ...openSections, [key]: !openSections[key] };
	}

	function scrollToSection(key: string) {
		openSections = { ...openSections, [key]: true };
		requestAnimationFrame(() => {
			const el = document.getElementById(`section-${key}`);
			if (el) {
				// Account for sticky site header (~70px)
				const y = el.getBoundingClientRect().top + window.scrollY - 80;
				window.scrollTo({ top: y, behavior: 'smooth' });
			}
		});
	}

	// ── Submit ────────────────────────────────────────────────
	async function handleSubmit() {
		if (!canSubmit || !$user) return;
		submitting = true;
		result = null;

		const clean = (arr: string[]) => arr.map(s => s.trim()).filter(Boolean);

		const allChallenges = [
			...selectedChallenges.map(c => ({
				slug: slugify(c), label: c,
				exceptions: challengeExceptions[c]?.trim() || null,
			})),
		];
		if (customChallengeEnabled && customChallengeName.trim()) {
			allChallenges.push({
				slug: slugify(customChallengeName),
				label: customChallengeName.trim(),
				exceptions: null,
			});
		}

		const allGlitches = [
			...selectedGlitches.map(slug => {
				const preset = GLITCH_PRESETS.find(g => g.slug === slug);
				return { slug, label: preset?.label ?? slug };
			}),
			...customGlitches.filter(g => g.name.trim()).map(g => ({
				slug: slugify(g.name),
				label: g.name.trim(),
				description: g.description.trim() || null,
			})),
		];

		const fullRunPayload = fullRunCategories
			.filter(c => c.label.trim())
			.map(c => ({
				slug: c.slug || slugify(c.label), label: c.label.trim(),
				description: c.description.trim() || null,
				exceptions: c.hasExceptions && c.exceptions.trim() ? c.exceptions.trim() : null,
			}));

		const miniChallengesPayload = miniChallengeGroups
			.filter(g => g.label.trim())
			.map(g => ({
				slug: g.slug || slugify(g.label), label: g.label.trim(),
				description: g.description.trim() || null,
				exceptions: g.hasExceptions && g.exceptions.trim() ? g.exceptions.trim() : null,
				children: g.children.filter(c => c.label.trim()).map(c => ({
					slug: c.slug || slugify(c.label), label: c.label.trim(),
					description: c.description.trim() || null,
					exceptions: c.hasExceptions && c.exceptions.trim() ? c.exceptions.trim() : null,
					fixed_loadout: (c.fixedCharacter || c.fixedRestriction) ? {
						character: c.fixedCharacter || undefined,
						restriction: c.fixedRestriction || undefined,
					} : undefined,
				})),
			}));

		const restrictionsPayload = restrictions
			.filter(r => r.label.trim())
			.map(r => ({
				slug: r.slug || slugify(r.label), label: r.label.trim(),
				description: r.description.trim() || null,
				exceptions: r.hasExceptions && r.exceptions.trim() ? r.exceptions.trim() : null,
				children: r.children.filter(c => c.label.trim()).map(c => ({
					slug: c.slug || slugify(c.label), label: c.label.trim(),
					description: c.description.trim() || null,
					exceptions: c.hasExceptions && c.exceptions.trim() ? c.exceptions.trim() : null,
				})),
			}));

		const payload = {
			game_name: gameName.trim(),
			aliases: clean(aliases.split(',')),
			description: description.trim() || null,
			platforms: selectedPlatforms,
			custom_platforms: clean(customPlatforms),
			genres: selectedGenres,
			custom_genres: clean(customGenres),
			full_run_categories: fullRunPayload,
			mini_challenges: miniChallengesPayload,
			challenges: allChallenges,
			custom_challenge_description: (customChallengeEnabled && customChallengeDescription.trim()) ? customChallengeDescription.trim() : null,
			character_enabled: characterEnabled,
			character_label: characterLabel.trim() || 'Character',
			characters: clean(characterOptions).map(c => ({ slug: slugify(c), label: c })),
			restrictions: restrictionsPayload,
			timing_method: timingMethod,
			glitches: allGlitches,
			glitch_doc_links: glitchDocLinks.trim() || null,
			nmg_rules: nmgRules.trim() || null,
			general_rules: generalRules.trim() || null,
			involvement,
			additional_notes: additionalNotes.trim() || null,
			turnstile_token: turnstileToken,
		};

		try {
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
				await deleteDraft();
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

			{#if draftPromptVisible}
				<div class="draft-banner">
					<span>📝 You have a saved draft for this form.</span>
					<div class="draft-banner__actions">
						<button class="btn btn--small btn--accent" onclick={loadDraft}>Load Draft</button>
						<button class="btn btn--small" onclick={dismissDraftPrompt}>Start Fresh</button>
					</div>
				</div>
			{/if}

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

					<!-- ═══ Section 1: Game Info (REQUIRED) ═══ -->
					<section id="section-info" class="form-section" class:open={openSections.info}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('info')}>
							<span class="section-toggle__label">🎮 Game Info <span class="req">*</span></span>
							<span class="section-toggle__chevron">{openSections.info ? '▲' : '▼'}</span>
						</button>
						{#if openSections.info}
							<div class="section-body">
								<div class="fg">
									<label class="fl" for="gameName">Game Name <span class="req">*</span></label>
									<input id="gameName" type="text" class="fi" bind:value={gameName} placeholder="e.g. Sekiro: Shadows Die Twice" maxlength="200" />
									<p class="fh"><em>Please use the full game name.</em></p>
								</div>
								<div class="fg">
									<label class="fl" for="aliases">Short Names / Aliases</label>
									<input id="aliases" type="text" class="fi" bind:value={aliases} placeholder="e.g. Sekiro, SSDT, Shadows Die Twice" maxlength="500" />
									<p class="fh"><em>Comma-separated. Include abbreviations, acronyms, or alternate titles people commonly use for this game.</em></p>
								</div>
								<div class="fg">
									<label class="fl" for="description">Description</label>
									<textarea id="description" class="fi" bind:value={description} placeholder="e.g. Sekiro: Shadows Die Twice is a 2019 action-adventure game developed by FromSoftware. It was released in Japan..." rows="3" maxlength="2000"></textarea>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 2: Platforms ═══ -->
					<section class="form-section" class:open={openSections.platforms}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('platforms')}>
							<span class="section-toggle__label">🖥️ Platforms</span>
							<span class="section-toggle__chevron">{openSections.platforms ? '▲' : '▼'}</span>
						</button>
						{#if openSections.platforms}
							<div class="section-body">
								<div class="fg">
									<label class="fl">Platforms</label>
									<p class="fh mb-2">Only the top {PLATFORM_DISPLAY_LIMIT} platforms are shown. If you don't see your platform, try searching for it.</p>
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
									<label class="fl">Other Platforms</label>
									<p class="fh mb-2">Don't see your platform? Add up to 2 here. These will be reviewed by our team.</p>
									{#each customPlatforms as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={customPlatforms[i]} placeholder="e.g. Amiga" maxlength="60" />
											<button type="button" class="list-row__remove" onclick={() => removeCustomPlatform(i)}>✕</button>
										</div>
										{#if customPlatformDuplicate(customPlatforms[i])}
											<p class="fh" style="color: #ef4444;">{customPlatformDuplicate(customPlatforms[i])}</p>
										{/if}
									{/each}
									{#if customPlatforms.length < 2}
										<button type="button" class="btn btn--small mt-2" onclick={addCustomPlatform}>+ Add Platform</button>
									{/if}
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 3: Genres ═══ -->
					<section class="form-section" class:open={openSections.genres}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('genres')}>
							<span class="section-toggle__label">🏷️ Genres</span>
							<span class="section-toggle__chevron">{openSections.genres ? '▲' : '▼'}</span>
						</button>
						{#if openSections.genres}
							<div class="section-body">
								<div class="fg">
									<label class="fl">Genres</label>
									<p class="fh mb-2">Add up to 5 genres total (including custom). Only the top {GENRE_DISPLAY_LIMIT} genres are shown. If you don't see your genre, try searching for it.</p>
									<input type="text" class="fi mb-2" bind:value={genreSearch} placeholder="Search genres..." />
									{#if selectedGenres.length > 0}
										<div class="selected-chips mb-2">
											{#each selectedGenres as slug}
												{@const genre = genres.find((g: any) => g.slug === slug)}
												<button type="button" class="chip chip--selected" onclick={() => toggleGenre(slug)}>{genre?.label || slug} ✕</button>
											{/each}
										</div>
									{/if}
									{#if totalGenreCount >= 5}
										<p class="fh" style="color: var(--accent);">Maximum of 5 genres reached ({selectedGenres.length} selected + {customGenres.filter(g => g.trim()).length} custom).</p>
									{/if}
									<div class="checkbox-grid">
										{#each filteredGenres as g}
											<label class="check-item" class:check-item--disabled={totalGenreCount >= 5 && !selectedGenres.includes(g.slug)}>
												<input
													type="checkbox"
													checked={selectedGenres.includes(g.slug)}
													onchange={() => toggleGenre(g.slug)}
													disabled={totalGenreCount >= 5 && !selectedGenres.includes(g.slug)}
												/>
												<span>{g.label}</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="fg">
									<label class="fl">Other Genres</label>
									<p class="fh mb-2">Don't see a genre that fits? Add up to 3 custom genres (counts toward the 5 max). These will be reviewed by our team.</p>
									{#each customGenres as _, i}
										<div class="list-row">
											<input type="text" class="fi" bind:value={customGenres[i]} placeholder="e.g. Tower Defense" maxlength="60" />
											<button type="button" class="list-row__remove" onclick={() => removeCustomGenre(i)}>✕</button>
										</div>
										{#if customGenreDuplicate(customGenres[i])}
											<p class="fh" style="color: #ef4444;">{customGenreDuplicate(customGenres[i])}</p>
										{/if}
									{/each}
									{#if totalGenreCount < 5 && customGenres.length < 3}
										<button type="button" class="btn btn--small mt-2" onclick={addCustomGenre}>+ Add Genre</button>
									{/if}
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 4: Run Categories (REQUIRED) ═══ -->
					<section id="section-categories" class="form-section" class:open={openSections.categories}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('categories')}>
							<span class="section-toggle__label">📂 Run Categories <span class="req">*</span></span>
							<span class="section-toggle__chevron">{openSections.categories ? '▲' : '▼'}</span>
						</button>
						{#if openSections.categories}
							<div class="section-body">
								<p class="fh mb-2">At least 1 category is required.</p>
								<div class="game-editor">
									<div class="editor-section">
										<h3 class="subsection-title">Full Run Categories</h3>
										<p class="subsection-desc">Full runs typically involve completing the game through to the credits.</p>
										<div class="item-list">
											{#each fullRunCategories as item, i}
												<div class="item-card" class:item-card--open={isEditing('fr', i)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('fr', i)}>
															<span class="item-card__slug">{item.slug || '(new)'}</span>
															<span class="item-card__label">{item.label || 'Untitled'}</span>
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => { fullRunCategories = fullRunCategories.filter((_, idx) => idx !== i); }}>✕</button>
														</div>
													</div>
													{#if isEditing('fr', i)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={item.label} oninput={() => { item.slug = slugify(item.label); }} /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="2" bind:value={item.description}></textarea></div>
															<span class="field-hint">Markdown supported</span>
															<label class="toggle-row"><input type="checkbox" bind:checked={item.hasExceptions} /> Has Exceptions</label>
															{#if item.hasExceptions}
																<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="e.g. This category requires the player to die 3 times. These 3 deaths must be when there are no enemies nearby..."></textarea>
															{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addFullRun}>+ Add Full Run Category</button>

										<h3 class="subsection-title mt-2">Mini-Challenges</h3>
										<p class="subsection-desc">Smaller challenges like individual boss fights, individual levels, or small gauntlets. Groups can have child categories.</p>
										<div class="item-list">
											{#each miniChallengeGroups as group, gi}
												<div class="item-card item-card--group" class:item-card--open={isEditing('mc', gi)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('mc', gi)}>
															<span class="item-card__slug">{group.slug || '(new)'}</span>
															<span class="item-card__label">{group.label || 'Untitled Group'}</span>
															<span class="item-card__count">{group.children?.length || 0} children</span>
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => removeMiniGroup(gi)}>✕</button>
														</div>
													</div>
													{#if isEditing('mc', gi)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Slug</label><input type="text" value={group.slug} disabled class="slug-auto" /></div>
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={miniChallengeGroups[gi].label} oninput={() => { group.slug = slugify(group.label); miniChallengeGroups = [...miniChallengeGroups]; }} /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="2" bind:value={miniChallengeGroups[gi].description}></textarea></div>
															<span class="field-hint">Markdown supported</span>
															<label class="toggle-row"><input type="checkbox" bind:checked={miniChallengeGroups[gi].hasExceptions} /> Has Exceptions</label>
															{#if group.hasExceptions}
																<textarea class="exceptions-textarea" rows="2" bind:value={miniChallengeGroups[gi].exceptions} placeholder="Describe exceptions (Markdown supported)..."></textarea>
															{/if}
															<details class="children-section">
																<summary class="children-title">Children <span class="muted">({group.children.length})</span> <span class="children-chevron">▶</span></summary>
																{#each group.children as child, ci}
																	<details class="child-card">
																		<summary class="child-card__header">
																			<span class="child-card__chevron">▶</span>
																			<span class="child-card__arrow">└</span>
																			<span class="child-card__slug-text">{child.slug || '(new)'}</span>
																			<span class="child-card__label-text">{child.label || 'Untitled'}</span>
																			<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); removeMiniChild(gi, ci); }}>✕</button>
																		</summary>
																		<div class="child-card__body">
																			<div class="child-card__fields">
																				<div class="field-row--compact"><label>Slug</label><input type="text" value={child.slug} disabled class="slug-auto" /></div>
																				<div class="field-row--compact"><label>Label</label><input type="text" bind:value={miniChallengeGroups[gi].children[ci].label} oninput={() => { child.slug = slugify(child.label); miniChallengeGroups = [...miniChallengeGroups]; }} /></div>
																			</div>
																			<div class="child-card__desc">
																				<textarea rows="2" bind:value={miniChallengeGroups[gi].children[ci].description} placeholder="Description (Markdown supported)..."></textarea>
																			</div>
																			<label class="toggle-row toggle-row--child"><input type="checkbox" bind:checked={miniChallengeGroups[gi].children[ci].hasExceptions} /> Has Exceptions</label>
																			{#if child.hasExceptions}
																				<textarea class="exceptions-textarea" rows="2" bind:value={miniChallengeGroups[gi].children[ci].exceptions} placeholder="Exceptions (Markdown supported)..."></textarea>
																			{/if}
																			{#if (characterEnabled && characterOptions.filter(c => c.trim()).length > 0) || restrictions.filter(r => r.label.trim()).length > 0}
																				<label class="toggle-row toggle-row--child"><input type="checkbox" checked={!!(child.fixedCharacter || child.fixedRestriction)} onchange={(e) => { if (!e.currentTarget.checked) { miniChallengeGroups[gi].children[ci].fixedCharacter = ''; miniChallengeGroups[gi].children[ci].fixedRestriction = ''; } miniChallengeGroups = [...miniChallengeGroups]; }} /> Fixed Loadout</label>
																				{#if child.fixedCharacter || child.fixedRestriction || false}
																					<div class="fixed-loadout-fields">
																						{#if characterEnabled && characterOptions.filter(c => c.trim()).length > 0}
																							<div class="field-row--compact"><label>{characterLabel}</label><select bind:value={miniChallengeGroups[gi].children[ci].fixedCharacter}><option value="">— Not fixed —</option>{#each characterOptions.filter(c => c.trim()) as ch}<option value={ch}>{ch}</option>{/each}</select></div>
																						{/if}
																						{#if restrictions.filter(r => r.label.trim()).length > 0}
																							<div class="field-row--compact"><label>Restriction</label><select bind:value={miniChallengeGroups[gi].children[ci].fixedRestriction}><option value="">— Not fixed —</option>{#each restrictions.filter(r => r.label.trim()) as r}<option value={r.label}>{r.label}</option>{/each}</select></div>
																						{/if}
																					</div>
																				{/if}
																			{/if}
																		</div>
																	</details>
																{/each}
																<button class="btn btn--add btn--add-sm" onclick={() => addMiniChild(gi)}>+ Add Child</button>
															</details>
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addMiniGroup}>+ Add Mini-Challenge Group</button>
									</div>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 5: Challenges (REQUIRED) ═══ -->
					<section id="section-challenges" class="form-section" class:open={openSections.challenges}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('challenges')}>
							<span class="section-toggle__label">⚔️ Challenges <span class="req">*</span></span>
							<span class="section-toggle__chevron">{openSections.challenges ? '▲' : '▼'}</span>
						</button>
						{#if openSections.challenges}
							<div class="section-body">
								<div class="game-editor">
									<div class="editor-section">
										<h3 class="subsection-title">Standard Challenges</h3>
										<p class="subsection-desc">Select challenge types that apply. You can add exceptions for each. Descriptions support Markdown.</p>
										<div class="item-list">
											{#each STANDARD_CHALLENGES as c}
												<div class="item-card" class:item-card--open={selectedChallenges.includes(c)}>
													<div class="item-card__header">
														<label class="item-card__toggle" style="cursor:pointer;">
															<input type="checkbox" checked={selectedChallenges.includes(c)} onchange={() => toggleChallenge(c)} style="width:18px;height:18px;accent-color:var(--accent);margin-right:0.5rem;" />
															<span class="item-card__label">{c}</span>
														</label>
													</div>
													{#if selectedChallenges.includes(c)}
														<div class="item-card__body">
															<label class="toggle-row"><input type="checkbox" checked={!!challengeExceptions[c]} onchange={(e) => { if (e.currentTarget.checked) challengeExceptions[c] = challengeExceptions[c] || ''; else { const { [c]: _, ...rest } = challengeExceptions; challengeExceptions = rest; } }} /> Has Exceptions</label>
															{#if challengeExceptions[c] != null}
																<textarea class="exceptions-textarea" rows="2" bind:value={challengeExceptions[c]} placeholder="e.g. Health lost from swimming underwater does not count as damage..."></textarea>
															{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								</div>
								<div class="fg">
									<label class="check-item custom-challenge-toggle">
										<input type="checkbox" bind:checked={customChallengeEnabled} />
										<span>My challenge is not listed here</span>
									</label>
									{#if customChallengeEnabled}
										<div class="custom-challenge-fields">
											<p class="fh mb-2">Suggest a challenge type that would be applicable to a majority of games. Our team will review it.</p>
											<div class="fg">
												<label class="fl" for="customChallengeName">Challenge Name</label>
												<input id="customChallengeName" type="text" class="fi" bind:value={customChallengeName} placeholder="e.g. Deathless" maxlength="100" />
											</div>
											<div class="fg">
												<label class="fl" for="customChallengeDesc">Challenge Description</label>
												<textarea id="customChallengeDesc" class="fi" bind:value={customChallengeDescription} placeholder="e.g. A death is when your character fails in a way that resets progress, typically with a penalty like losing lives, items, or other resources." rows="3" maxlength="2000"></textarea>
												<p class="fh">Markdown is supported.</p>
											</div>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 6: Characters ═══ -->
					<section id="section-characters" class="form-section" class:open={openSections.characters}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('characters')}>
							<span class="section-toggle__label">🧙 Characters / Weapons / Classes</span>
							<span class="section-toggle__chevron">{openSections.characters ? '▲' : '▼'}</span>
						</button>
						{#if openSections.characters}
							<div class="section-body">
								<label class="toggle-row">
									<input type="checkbox" class="toggle-check" bind:checked={characterEnabled} />
									<span class="toggle-slider"></span>
									<span class="toggle-label">This game requires you pick a character, weapon, or class before starting the game.</span>
								</label>
								{#if characterEnabled}
									<p class="fh mt-2" style="margin-left: 3.25rem;">At least 2 options are required when characters are enabled.</p>
									<div class="fg mt-2">
										<label class="fl" for="charLabel">Column Label</label>
										<input id="charLabel" type="text" class="fi" bind:value={characterLabel} placeholder="Character" maxlength="50" />
										<p class="fh">What do you call it? "Character", "Weapon", "Weapon / Aspect", "Class", "Loadout", etc.</p>
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

					<!-- ═══ Section 7: Restrictions ═══ -->
					<section class="form-section" class:open={openSections.restrictions}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('restrictions')}>
							<span class="section-toggle__label">🚫 Game-Specific Restrictions</span>
							<span class="section-toggle__chevron">{openSections.restrictions ? '▲' : '▼'}</span>
						</button>
						{#if openSections.restrictions}
							<div class="section-body">
								<div class="game-editor">
									<div class="editor-section">
										<p class="subsection-desc">Optional restrictions. A restriction can have children (e.g. "No Bone Charm" → "No Quick Focus"). Descriptions support Markdown.</p>
										<div class="item-list">
											{#each restrictions as item, i}
												<div class="item-card" class:item-card--group={(item.children?.length ?? 0) > 0} class:item-card--open={isEditing('rs', i)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('rs', i)}>
															<span class="item-card__slug">{item.slug || '(new)'}</span>
															<span class="item-card__label">{item.label || 'Untitled'}</span>
															{#if item.children?.length}<span class="item-card__count">{item.children.length} children</span>{/if}
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => removeRestriction(i)}>✕</button>
														</div>
													</div>
													{#if isEditing('rs', i)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={restrictions[i].label} oninput={() => { item.slug = slugify(item.label); restrictions = [...restrictions]; }} /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="3" bind:value={restrictions[i].description}></textarea></div>
															<span class="field-hint">Markdown supported</span>
															<label class="toggle-row"><input type="checkbox" bind:checked={restrictions[i].hasExceptions} /> Has Exceptions</label>
															{#if item.hasExceptions}
																<textarea class="exceptions-textarea" rows="2" bind:value={restrictions[i].exceptions} placeholder="Describe exceptions (Markdown supported)..."></textarea>
															{/if}
															<details class="children-section">
																<summary class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron">▶</span></summary>
																{#each item.children || [] as child, ci}
																	<details class="child-card">
																		<summary class="child-card__header">
																			<span class="child-card__chevron">▶</span>
																			<span class="child-card__arrow">└</span>
																			<span class="child-card__slug-text">{child.slug || '(new)'}</span>
																			<span class="child-card__label-text">{child.label || 'Untitled'}</span>
																			<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); removeRestrictionChild(i, ci); }}>✕</button>
																		</summary>
																		<div class="child-card__body">
																			<div class="child-card__fields">
																				<div class="field-row--compact"><label>Slug</label><input type="text" value={child.slug} disabled class="slug-auto" /></div>
																				<div class="field-row--compact"><label>Label</label><input type="text" bind:value={restrictions[i].children[ci].label} oninput={() => { child.slug = slugify(child.label); restrictions = [...restrictions]; }} /></div>
																			</div>
																			<div class="child-card__desc">
																				<textarea rows="2" bind:value={restrictions[i].children[ci].description} placeholder="Description (Markdown supported)..."></textarea>
																			</div>
																			<label class="toggle-row toggle-row--child"><input type="checkbox" bind:checked={restrictions[i].children[ci].hasExceptions} /> Has Exceptions</label>
																			{#if child.hasExceptions}
																				<textarea class="exceptions-textarea" rows="2" bind:value={restrictions[i].children[ci].exceptions} placeholder="Exceptions (Markdown supported)..."></textarea>
																			{/if}
																		</div>
																	</details>
																{/each}
																<button class="btn btn--add btn--add-sm" onclick={() => addRestrictionChild(i)}>+ Add Child Restriction</button>
															</details>
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addRestriction}>+ Add Restriction</button>
									</div>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 8: Timing ═══ -->
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

					<!-- ═══ Section 9: Glitches ═══ -->
					<section class="form-section" class:open={openSections.glitches}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('glitches')}>
							<span class="section-toggle__label">🐛 Glitch Categories</span>
							<span class="section-toggle__chevron">{openSections.glitches ? '▲' : '▼'}</span>
						</button>
						{#if openSections.glitches}
							<div class="section-body">
								<div class="game-editor">
									<div class="editor-section">
										<h3 class="subsection-title">Glitch Presets</h3>
										<p class="subsection-desc">Select glitch policies that apply to this game.</p>
										<div class="item-list">
											{#each GLITCH_PRESETS as g}
												<div class="item-card" class:item-card--open={selectedGlitches.includes(g.slug)}>
													<div class="item-card__header">
														<label class="item-card__toggle" style="cursor:pointer;">
															<input type="checkbox" checked={selectedGlitches.includes(g.slug)} onchange={() => toggleGlitch(g.slug)} style="width:18px;height:18px;accent-color:var(--accent);margin-right:0.5rem;" />
															<span class="item-card__label">{g.label}</span>
															{#if g.hint}<span class="item-card__count">— {g.hint}</span>{/if}
														</label>
													</div>
													{#if selectedGlitches.includes(g.slug) && g.slug === 'nmg'}
														<div class="item-card__body">
															<div class="field-row--compact"><label>NMG Rules</label><textarea rows="3" bind:value={nmgRules} placeholder="Describe what qualifies as a 'major glitch' for this game and what is/isn't allowed under NMG..."></textarea></div>
															<span class="field-hint">Help our team understand what NMG means for this specific game.</span>
														</div>
													{/if}
												</div>
											{/each}
										</div>

										<h3 class="subsection-title mt-2">Game-Specific Glitch Categories</h3>
										<p class="subsection-desc">Custom glitch policies unique to this game. Descriptions support Markdown.</p>
										<div class="item-list">
											{#each customGlitches as item, i}
												<div class="item-card" class:item-card--open={isEditing('gl', i)}>
													<div class="item-card__header">
														<button class="item-card__toggle" onclick={() => toggleEdit('gl', i)}>
															<span class="item-card__slug">{slugify(item.name) || '(new)'}</span>
															<span class="item-card__label">{item.name || 'Untitled'}</span>
														</button>
														<div class="item-card__actions">
															<button class="item-btn item-btn--danger" onclick={() => removeCustomGlitch(i)}>✕</button>
														</div>
													</div>
													{#if isEditing('gl', i)}
														<div class="item-card__body">
															<div class="field-row--compact"><label>Label</label><input type="text" bind:value={customGlitches[i].name} placeholder="e.g. No Wrong Warp" /></div>
															<div class="field-row--compact"><label>Description</label><textarea rows="3" bind:value={customGlitches[i].description} placeholder="Describe what this glitch category allows or restricts..."></textarea></div>
															<span class="field-hint">Markdown supported</span>
														</div>
													{/if}
												</div>
											{/each}
										</div>
										<button class="btn btn--add" onclick={addCustomGlitch}>+ Add Glitch Category</button>

										<div class="fg mt-2">
											<label class="fl" for="glitchDocs">Glitch Documentation Links</label>
											<textarea id="glitchDocs" class="fi" bind:value={glitchDocLinks} placeholder="Links to glitch guides, wikis, or documentation..." rows="2" maxlength="2000"></textarea>
										</div>
									</div>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 10: Rules ═══ -->
					<section class="form-section" class:open={openSections.rules}>
						<button type="button" class="section-toggle" onclick={() => toggleSection('rules')}>
							<span class="section-toggle__label">📜 General Rules</span>
							<span class="section-toggle__chevron">{openSections.rules ? '▲' : '▼'}</span>
						</button>
						{#if openSections.rules}
							<div class="section-body">
								<div class="fg">
									<label class="fl" for="rules">Suggested Rules</label>
									<p class="fh mb-2">These should be rules that apply to any and all challenges.</p>
									<textarea id="rules" class="fi" bind:value={generalRules} placeholder="e.g. For Unseeded runs, show previous death or..." rows="4" maxlength="5000"></textarea>
									<p class="fh">These will be reviewed and refined by our team.</p>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Section 11: Involvement & Notes ═══ -->
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
									<textarea id="notes" class="fi" bind:value={additionalNotes} placeholder="Let us know any thoughts, ideas, suggestions, or frustrations with the game submission form. Please be respectful in this reply if you have criticisms." rows="3" maxlength="2000"></textarea>
								</div>
							</div>
						{/if}
					</section>

					<!-- ═══ Turnstile + Draft + Submit ═══ -->
					<div class="submit-section">
						<div id="turnstile-container-game" class="turnstile-container"></div>
						{#if !turnstileReady}<p class="fh">Loading verification...</p>{/if}

						{#if bannedTermsWarning}
							<div class="alert alert--error">{bannedTermsWarning}</div>
						{/if}

						{#if !hasAtLeastOneCategory && gameName.trim()}
							<button type="button" class="validation-link" onclick={() => scrollToSection('categories')}>
								⚠ Please add at least 1 run category — click to go there
							</button>
						{/if}
						{#if !hasAtLeastOneChallenge && gameName.trim()}
							<button type="button" class="validation-link" onclick={() => scrollToSection('challenges')}>
								⚠ Please select at least 1 challenge type — click to go there
							</button>
						{/if}
						{#if !hasEnoughCharacters && gameName.trim()}
							<button type="button" class="validation-link" onclick={() => scrollToSection('characters')}>
								⚠ Characters enabled — at least 2 options required — click to go there
							</button>
						{/if}

						<div class="submit-buttons">
							<button class="btn btn--lg" onclick={saveDraft} disabled={!gameName.trim()}>
								{#if draftStatus === 'saving'}Saving...{:else if draftStatus === 'saved'}✓ Draft Saved{:else if draftStatus === 'error'}Save Failed{:else}Save Draft{/if}
							</button>
							<button class="btn btn--accent btn--lg submit-btn" onclick={handleSubmit} disabled={!canSubmit}>
								{submitting ? 'Submitting...' : 'Submit Game Request'}
							</button>
						</div>
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

	/* Draft banner */
	.draft-banner {
		display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;
		background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25);
		border-radius: 10px; padding: 0.85rem 1.25rem; margin: 1rem 0; font-size: 0.9rem;
	}
	.draft-banner__actions { display: flex; gap: 0.5rem; }

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
	.check-item input[type="checkbox"] { accent-color: var(--accent); }
	.check-item--disabled { opacity: 0.4; cursor: not-allowed; }

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

	/* Mini-challenge groups — only needed for platforms/genres sections now */
	.mini-group {
		background: rgba(255,255,255,0.015); border: 1px solid var(--border);
		border-radius: 8px; padding: 0.85rem; margin-bottom: 0.75rem;
	}
	.mini-children { padding-left: 1rem; margin-top: 0.5rem; border-left: 2px solid var(--border); }

	/* Custom challenge fields */
	.custom-challenge-toggle { font-weight: 500; padding: 0.5rem 0.5rem; }
	.custom-challenge-fields { padding: 0.75rem 0 0 1.5rem; border-left: 2px solid var(--accent); margin-top: 0.5rem; }

	/* Validation links */
	.validation-link {
		display: block; width: 100%; text-align: center;
		background: none; border: none; cursor: pointer;
		font-size: 0.85rem; color: #ef4444; font-family: inherit;
		padding: 0.35rem 0; text-decoration: underline; text-underline-offset: 2px;
	}
	.validation-link:hover { color: #dc2626; }

	/* Selected chips */
	.selected-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.chip { padding: 0.25rem 0.65rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; border: none; }
	.chip--selected { background: var(--accent); color: white; }

	/* Toggle switch */
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
	.submit-buttons { display: flex; gap: 0.75rem; width: 100%; max-width: 500px; }
	.submit-buttons .btn { flex: 1; justify-content: center; text-align: center; }
	.submit-btn { flex: 1.5 !important; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; }
	.btn:hover { border-color: var(--accent); }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn--accent { background: var(--accent); border-color: var(--accent); color: #fff; }
	.btn--accent:hover { filter: brightness(1.1); }
	.btn--accent:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
	.btn--lg { padding: 0.75rem 2rem; font-size: 1.05rem; min-height: 44px; }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }

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
