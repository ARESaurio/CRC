<script lang="ts">
	import AzNav from '$lib/components/AzNav.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { norm, expandRomanNumerals, matchesLetterFilter, getFirstLetter } from '$lib/utils/filters';
	import { page } from '$app/stores';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	const games = data.games ?? [];
	const platforms = data.platforms ?? [];
	const genres = data.genres ?? [];
	const challenges = data.challenges ?? [];

	const DEFAULT_COVER = '/img/site/default-game.jpg';

	// ── Filter State ──
	let searchQuery = $state('');
	let activeLetter = $state('');
	let selectedPlatforms = $state(new Set<string>());
	let selectedGenres = $state(new Set<string>());
	let selectedChallenges = $state(new Set<string>());
	let showLimit = $state(25);
	let copyText = $state(m.games_copy_link());

	// ── Restore from URL on init ──
	const initParams = $page.url.searchParams;
	if (initParams.get('q')) searchQuery = initParams.get('q')!;
	if (initParams.get('letter')) activeLetter = initParams.get('letter')!;
	if (initParams.get('platforms')) selectedPlatforms = new Set(initParams.get('platforms')!.split(','));
	if (initParams.get('genres')) selectedGenres = new Set(initParams.get('genres')!.split(','));
	if (initParams.get('challenges')) selectedChallenges = new Set(initParams.get('challenges')!.split(','));

	// ── Derived: filtered games ──
	const filteredGames = $derived.by(() => {
		const q = norm(searchQuery);

		return games.filter((g: any) => {
			// Text search
			if (q) {
				const nameNorm = norm(g.game_name);
				const nameExpanded = expandRomanNumerals(g.game_name);
				const aliasMatch = (g.game_name_aliases || []).some(
					(a: string) => norm(a).includes(q) || expandRomanNumerals(a).includes(q)
				);
				if (!nameNorm.includes(q) && !nameExpanded.includes(q) && !aliasMatch) return false;
			}

			// A-Z filter
			if (activeLetter) {
				const first = getFirstLetter(g.game_name);
				if (!matchesLetterFilter(first, activeLetter)) return false;
			}

			// Platform filter
			if (selectedPlatforms.size > 0) {
				const gamePlats = (g.platforms || []).map((p: string) => norm(p));
				for (const p of selectedPlatforms) {
					if (!gamePlats.includes(p)) return false;
				}
			}

			// Genre filter
			if (selectedGenres.size > 0) {
				const gameGenres = (g.genres || []).map((ge: string) => norm(ge));
				for (const ge of selectedGenres) {
					if (!gameGenres.includes(ge)) return false;
				}
			}

			// Challenge filter
			if (selectedChallenges.size > 0) {
				const gameChallenges = (g.challenges_data || []).map((c: any) => norm(c.slug));
				for (const c of selectedChallenges) {
					if (!gameChallenges.includes(c)) return false;
				}
			}

			return true;
		});
	});

	// ── Derived: visible games (with limit) ──
	const visibleGames = $derived(
		showLimit === 0 ? filteredGames : filteredGames.slice(0, showLimit)
	);

	// ── Are any filters active? ──
	const hasFilters = $derived(
		searchQuery.trim() !== '' ||
		activeLetter !== '' ||
		selectedPlatforms.size > 0 ||
		selectedGenres.size > 0 ||
		selectedChallenges.size > 0
	);

	// ── Actions ──
	function resetAll() {
		searchQuery = '';
		activeLetter = '';
		selectedPlatforms = new Set();
		selectedGenres = new Set();
		selectedChallenges = new Set();
	}

	function copyLink() {
		const url = new URL($page.url.href);
		url.search = '';
		if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());
		if (activeLetter) url.searchParams.set('letter', activeLetter);
		if (selectedPlatforms.size) url.searchParams.set('platforms', Array.from(selectedPlatforms).join(','));
		if (selectedGenres.size) url.searchParams.set('genres', Array.from(selectedGenres).join(','));
		if (selectedChallenges.size) url.searchParams.set('challenges', Array.from(selectedChallenges).join(','));
		navigator.clipboard.writeText(url.toString());
		copyText = m.games_copied();
		setTimeout(() => { copyText = m.games_copy_link(); }, 1500);
	}
</script>

<svelte:head>
	<title>{m.games_page_title()}</title>
	<meta name="description" content={m.games_description()} />
</svelte:head>

<div class="page-width">
	<h1>{m.games_heading()}</h1>
	<p class="muted mb-1">{m.games_description()}</p>

	<!-- A-Z Navigation -->
	<AzNav bind:activeLetter />

	<!-- All filters in one container -->
	<div class="advanced-filters">
		<!-- Search -->
		<div class="filter-search">
			<input
				type="text"
				class="filter-input"
				placeholder={m.games_search_placeholder()}
				autocomplete="off"
				inputmode="search"
				aria-label={m.games_search_placeholder()}
				bind:value={searchQuery}
			/>
		</div>

		<!-- Tag pickers grid -->
		<div class="filter-groups">
			<TagPicker
				label={m.games_filter_platform()}
				placeholder={m.games_filter_platform_placeholder()}
				items={platforms}
				bind:selected={selectedPlatforms}
				ariaLabel={m.games_filter_platform()}
			/>
			<TagPicker
				label={m.games_filter_genre()}
				placeholder={m.games_filter_genre_placeholder()}
				items={genres}
				bind:selected={selectedGenres}
				ariaLabel={m.games_filter_genre()}
			/>
			<TagPicker
				label={m.games_filter_challenge()}
				placeholder={m.games_filter_challenge_placeholder()}
				items={challenges}
				bind:selected={selectedChallenges}
				ariaLabel={m.games_filter_challenge()}
			/>
		</div>
	</div>

	<!-- Results bar -->
	<div class="results-bar">
		<div class="results-bar__left">
			<label class="muted" for="limit-select">{m.games_show()}</label>
			<select id="limit-select" class="select" bind:value={showLimit}>
				<option value={10}>10</option>
				<option value={25}>25</option>
				<option value={50}>50</option>
				<option value={100}>100</option>
				<option value={0}>All</option>
			</select>
		</div>
		<div class="results-bar__center">
			<p class="muted">{m.games_showing({ visible: String(visibleGames.length), total: String(games.length) })}</p>
		</div>
		<div class="results-bar__right">
			{#if hasFilters}
				<button type="button" class="btn btn--copy-link" onclick={copyLink}>{copyText}</button>
				<button type="button" class="btn btn--reset" onclick={resetAll}>{m.games_reset_filters()}</button>
			{/if}
		</div>
	</div>

	<!-- Games grid -->
	<div class="grid">
		{#each visibleGames as game (game.game_id)}
			{@const coverUrl = game.cover || DEFAULT_COVER}
			<a
				class="game-card card-lift"
				class:game-card--modded={game.is_modded}
				href={localizeHref(`/games/${game.game_id}`)}
			>
				<div class="game-card__bg" style:background-image="url('{coverUrl}')" style:background-position={game.cover_position || 'center'}></div>
				{#if game.is_modded}
					<div class="game-card__modded-badge">
						<span class="modded-badge modded-badge--card">{m.games_modded_badge()}</span>
					</div>
				{/if}
				<div class="game-card__overlay">
					<div class="game-card__info">
						<div class="game-card__title">{game.game_name}</div>
						{#if game.runCount > 0}
							<span class="game-card__count">{game.runCount} run{game.runCount !== 1 ? 's' : ''}</span>
						{/if}
					</div>
				</div>
			</a>
		{/each}

		{#if visibleGames.length === 0}
			<p class="muted" style="grid-column: 1 / -1; text-align: center; padding: 3rem 0;">
				{m.games_no_results()}
			</p>
		{/if}
	</div>
</div>

<style>
	h1 { margin-bottom: 0.25rem; }
	.mb-1 { margin-bottom: 0.75rem; }

	/* ── Unified filter container (matches runs page .advanced-filters) ── */
	.advanced-filters {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 0.75rem;
	}
	.filter-search { margin-bottom: 0.75rem; }
	.filter-input {
		width: 100%; padding: 0.55rem 0.75rem;
		background: var(--bg); border: 1px solid var(--border);
		border-radius: var(--radius-sm, 4px); color: var(--fg);
		font-size: 0.95rem; font-family: inherit; box-sizing: border-box;
		transition: border-color 0.15s;
	}
	.filter-input:focus { outline: none; border-color: var(--accent); }
	.filter-input::placeholder { color: var(--muted); }

	.filter-groups {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.75rem;
	}

	/* ── Results bar ── */
	.results-bar {
		display: flex; align-items: center; justify-content: space-between;
		flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; padding: 0.5rem 0;
	}
	.results-bar__left { display: flex; align-items: center; gap: 0.5rem; }
	.results-bar__center { flex: 1; text-align: center; }
	.results-bar__center p { margin: 0; font-size: 0.9rem; }
	.results-bar__right { display: flex; align-items: center; gap: 0.5rem; }

	.btn {
		display: inline-flex; align-items: center; padding: 0.4rem 0.75rem;
		border: 1px solid var(--border); border-radius: 6px; background: none;
		color: var(--fg); cursor: pointer; font-size: 0.85rem; font-family: inherit;
		transition: border-color 0.15s, color 0.15s;
	}
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn--reset { color: var(--muted); }

	.select {
		padding: 0.35rem 0.5rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 4px; color: var(--fg); font-size: 0.85rem; font-family: inherit;
	}

	/* ── Game card run count ── */
	.game-card__info { padding: 0.9rem; position: relative; z-index: 2; }
	.game-card__count {
		font-size: 0.8rem; color: var(--muted); margin-top: 0.15rem; display: block;
	}
</style>
