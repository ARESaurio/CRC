<script lang="ts">
	import AzNav from '$lib/components/AzNav.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { norm, expandRomanNumerals, matchesLetterFilter, getFirstLetter } from '$lib/utils/filters';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	// ─── Filter state ────────────────────────────────────────
	let search = $state('');
	let activeLetter = $state('');
	let selectedPlatforms = $state(new Set<string>());
	let selectedGenres = $state(new Set<string>());
	let selectedChallenges = $state(new Set<string>());
	let showLimit = $state(25);
	let copyText = $state(m.games_copy_link());

	// ─── Restore from URL on first load ──────────────────────
	const initParams = $page.url.searchParams;
	if (initParams.get('q')) search = initParams.get('q')!;
	if (initParams.get('letter')) activeLetter = initParams.get('letter')!;
	if (initParams.get('platforms')) selectedPlatforms = new Set(initParams.get('platforms')!.split(','));
	if (initParams.get('genres')) selectedGenres = new Set(initParams.get('genres')!.split(','));
	if (initParams.get('challenges')) selectedChallenges = new Set(initParams.get('challenges')!.split(','));

	// ─── Derived: filtered games ─────────────────────────────
	const filtered = $derived.by(() => {
		const q = norm(search);
		const qExpanded = expandRomanNumerals(search);

		return data.games.filter((game) => {
			// Letter filter
			const firstLetter = getFirstLetter(game.game_name);
			if (!matchesLetterFilter(firstLetter, activeLetter)) return false;

			// Text search (name + aliases + roman numeral expansion)
			if (q) {
				const name = norm(game.game_name);
				const nameExpanded = expandRomanNumerals(game.game_name);
				const aliases = (game.game_name_aliases ?? []).map((a: string) => norm(a)).join(',');
				if (!name.includes(q) && !nameExpanded.includes(qExpanded) && !aliases.includes(q)) {
					return false;
				}
			}

			// Platform filter (AND — all selected must be present)
			if (selectedPlatforms.size > 0) {
				const gamePlatforms = (game.platforms ?? []).map(norm);
				for (const p of selectedPlatforms) {
					if (!gamePlatforms.includes(p)) return false;
				}
			}

			// Genre filter (AND)
			if (selectedGenres.size > 0) {
				const gameGenres = (game.genres ?? []).map(norm);
				for (const g of selectedGenres) {
					if (!gameGenres.includes(g)) return false;
				}
			}

			// Challenge filter (AND)
			if (selectedChallenges.size > 0) {
				const gameChallenges = (game.challenges_data ?? []).map((c: any) => norm(c.slug));
				for (const c of selectedChallenges) {
					if (!gameChallenges.includes(c)) return false;
				}
			}

			return true;
		});
	});

	// ─── Derived: visible games (with limit) ─────────────────
	let visible = $derived(showLimit === 0 ? filtered : filtered.slice(0, showLimit));

	let hasFilters = $derived(
		search.trim() !== '' ||
		activeLetter !== '' ||
		selectedPlatforms.size > 0 ||
		selectedGenres.size > 0 ||
		selectedChallenges.size > 0
	);

	// ─── Actions ─────────────────────────────────────────────
	function resetAll() {
		search = '';
		activeLetter = '';
		selectedPlatforms = new Set();
		selectedGenres = new Set();
		selectedChallenges = new Set();
	}

	function copyLink() {
		const url = new URL($page.url.href);
		url.search = '';
		if (search.trim()) url.searchParams.set('q', search.trim());
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
</svelte:head>

<div class="page-width">
	<h1>{m.games_heading()}</h1>
	<p class="muted">{m.games_description()}</p>

	<!-- A-Z Navigation -->
	<AzNav bind:activeLetter />

	<!-- Text search -->
	<div class="filter-wrap" style="margin-bottom: 1.25rem;">
		<input
			class="filter"
			type="text"
			placeholder={m.games_search_placeholder()}
			bind:value={search}
			autocomplete="off"
			inputmode="search"
		/>
	</div>

	<!-- Advanced filters -->
	<div class="filters-grid">
		<TagPicker
			label={m.games_filter_platform()}
			placeholder={m.games_filter_platform_placeholder()}
			items={data.platforms}
			bind:selected={selectedPlatforms}
			ariaLabel={m.games_filter_platform()}
		/>
		<TagPicker
			label={m.games_filter_genre()}
			placeholder={m.games_filter_genre_placeholder()}
			items={data.genres}
			bind:selected={selectedGenres}
			ariaLabel={m.games_filter_genre()}
		/>
		<TagPicker
			label={m.games_filter_challenge()}
			placeholder={m.games_filter_challenge_placeholder()}
			items={data.challenges}
			bind:selected={selectedChallenges}
			ariaLabel={m.games_filter_challenge()}
		/>
	</div>

	<!-- Results bar -->
	<div class="results-controls">
		<label class="muted" for="games-limit">{m.games_show()}</label>
		<select id="games-limit" class="select" bind:value={showLimit}>
			<option value={10}>10</option>
			<option value={25}>25</option>
			<option value={50}>50</option>
			<option value={100}>100</option>
			<option value={0}>All</option>
		</select>

		<span class="muted results-count">
			{m.games_showing({ visible: String(visible.length), total: String(data.games.length) })}
		</span>

		{#if hasFilters}
			<button type="button" class="tag-chip" onclick={copyLink}>{copyText}</button>
			<button type="button" class="tag-chip" onclick={resetAll}>{m.games_reset_filters()}</button>
		{/if}
	</div>

	<!-- Games grid -->
	<div class="games-grid">
		{#each visible as game (game.game_id)}
			<a href={localizeHref(`/games/${game.game_id}`)} class="game-card card card-lift">
				{#if game.cover}
					<div
						class="game-card__cover"
						style="background-image: url('{game.cover}'); background-position: {game.cover_position || 'center'};"
					>
						{#if game.is_modded}
							<span class="modded-badge">{m.games_modded_badge()}</span>
						{/if}
					</div>
				{/if}
				<div class="game-card__body">
					<h2 class="game-card__title">{game.game_name}</h2>
					<div class="game-card__meta">
						<span>{m.games_categories({ count: String(game.full_runs?.length ?? 0) })}</span>
						<span>·</span>
						<span>{m.games_runs({ count: String(game.runCount) })}</span>
					</div>
					{#if game.genres?.length}
						<div class="game-card__tags">
							{#each game.genres.slice(0, 3) as genre}
								<span class="tag tag--small">{genre}</span>
							{/each}
						</div>
					{/if}
				</div>
			</a>
		{/each}

		{#if visible.length === 0}
			<p class="muted no-results">{m.games_no_results()}</p>
		{/if}
	</div>
</div>

<style>
	/* Three-column filter layout */
	.filters-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	@media (max-width: 768px) {
		.filters-grid {
			grid-template-columns: 1fr;
		}
	}

	/* Results count in the bar */
	.results-count {
		margin-left: auto;
		font-size: 0.9rem;
	}

	/* No results message */
	.no-results {
		grid-column: 1 / -1;
		text-align: center;
		padding: 3rem 0;
	}

	/* Existing game card styles (carried over) */
	.games-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.25rem;
		margin-top: 1.25rem;
	}
	.game-card {
		text-decoration: none;
		color: var(--fg);
		overflow: hidden;
	}
	.game-card__cover {
		aspect-ratio: 460 / 215;
		background-size: cover;
		position: relative;
	}
	.game-card__body {
		padding: 1rem;
	}
	.game-card__title {
		font-size: 1.1rem;
		margin: 0 0 0.5rem;
	}
	.game-card__meta {
		font-size: 0.85rem;
		opacity: 0.6;
		display: flex;
		gap: 0.4rem;
	}
	.game-card__tags {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}
	.modded-badge {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background: rgba(0,0,0,0.7);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}
</style>
