<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Search, Gamepad2, User, FileText } from 'lucide-svelte';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	let { data } = $props();
	let games = $derived(data.games);
	let runners = $derived(data.runners);
	let runs = $derived(data.runs);
	let teams = $derived(data.teams);

	// Read initial query from URL
	let query = $state($page.url.searchParams.get('q') || '');
	let filter = $state<'all' | 'games' | 'runners' | 'runs' | 'teams'>('all');

	// Sync with URL changes (e.g. from header search bar) — only reacts to URL, not query
	let lastUrlQuery = $state($page.url.searchParams.get('q') || '');
	$effect(() => {
		const urlQuery = $page.url.searchParams.get('q') || '';
		if (urlQuery !== lastUrlQuery) {
			lastUrlQuery = urlQuery;
			if (urlQuery) query = urlQuery;
		}
	});

	let results = $derived.by(() => {
		const q = query.toLowerCase().trim();
		if (!q) return [];

		let items: any[] = [];

		if (filter === 'all' || filter === 'games') {
			items.push(...games.filter((g: any) =>
				g.name.toLowerCase().includes(q) ||
				g.id.toLowerCase().includes(q) ||
				g.aliases?.some((a: string) => a.toLowerCase().includes(q)) ||
				g.genres?.some((g2: string) => g2.toLowerCase().includes(q))
			));
		}

		if (filter === 'all' || filter === 'runners') {
			items.push(...runners.filter((r: any) =>
				r.name.toLowerCase().includes(q) ||
				r.id.toLowerCase().includes(q)
			));
		}

		if (filter === 'all' || filter === 'runs') {
			items.push(...runs.filter((r: any) =>
				r.name.toLowerCase().includes(q) ||
				r.gameName.toLowerCase().includes(q) ||
				r.gameId.toLowerCase().includes(q) ||
				r.category.toLowerCase().includes(q)
			));
		}

		if (filter === 'all' || filter === 'teams') {
			items.push(...teams.filter((t: any) =>
				t.name.toLowerCase().includes(q) ||
				t.id.toLowerCase().includes(q) ||
				t.tagline.toLowerCase().includes(q) ||
				t.games?.some((g: string) => g.toLowerCase().includes(q))
			));
		}

		return items;
	});

	let hasQuery = $derived(query.trim().length > 0);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && query.trim()) {
			// Update URL without full reload
			const url = new URL($page.url);
			url.searchParams.set('q', query.trim());
			goto(url.toString(), { replaceState: true, noScroll: true });
		}
	}

	function formatCategory(tier: string, category: string) {
		const tierLabel = tier === 'full_runs' ? m.search_tier_full_run() : tier === 'mini_challenges' ? m.search_tier_mini_challenge() : tier === 'player_made' ? m.search_tier_player_made() : tier;
		return category ? `${tierLabel} › ${category}` : tierLabel;
	}
</script>

<svelte:head><title>{query ? `${m.search_title()}: ${query}` : m.search_title()} | Challenge Run Community</title></svelte:head>

<div class="page-width">
	<div class="search-page">
		<h1>{m.search_title()}</h1>

		<div class="search-bar">
			<input
				type="search"
				bind:value={query}
				placeholder={m.search_placeholder()}
				autofocus
				onkeydown={handleKeydown}
			/>
		</div>

		<ToggleGroup.Root class="search-filters" bind:value={filter} onValueChange={(v: string) => { if (v) filter = v as typeof filter; }}>
			<ToggleGroup.Item value="all">{m.search_filter_all()}</ToggleGroup.Item>
			<ToggleGroup.Item value="games">{m.search_filter_games()}</ToggleGroup.Item>
			<ToggleGroup.Item value="runners">{m.search_filter_runners()}</ToggleGroup.Item>
			<ToggleGroup.Item value="runs">{m.search_filter_runs()}</ToggleGroup.Item>
			<ToggleGroup.Item value="teams">{m.search_filter_teams()}</ToggleGroup.Item>
		</ToggleGroup.Root>

		{#if hasQuery}
			<p class="result-count">{results.length === 1 ? m.search_result_count({ count: results.length }) : m.search_results_count({ count: results.length })}</p>

			{#if results.length === 0}
				<p class="empty">{m.search_no_results({ query })}</p>
			{:else}
				<div class="results">
					{#each results as item}
						<a href={localizeHref(item.url)} class="result-item">
							<span class="result-type">
								{#if item.type === 'game'}🎮{:else if item.type === 'runner'}🏃{:else if item.type === 'team'}🤝{:else}📹{/if}
							</span>
							<div class="result-info">
								{#if item.type === 'run'}
									<span class="result-name">{item.name}</span>
									<span class="result-meta">{item.gameName} — {formatCategory(item.categoryTier, item.category)}</span>
								{:else if item.type === 'team'}
									<span class="result-name">{item.name}</span>
									{#if item.tagline}
										<span class="result-meta">{item.tagline}</span>
									{/if}
								{:else}
									<span class="result-name">{item.name}</span>
									{#if item.type === 'game' && item.genres?.length}
										<span class="result-meta">{item.genres.slice(0, 3).join(', ')}</span>
									{/if}
								{/if}
							</div>
						</a>
					{/each}
				</div>
			{/if}
		{:else}
			<p class="muted" style="text-align: center; padding: 2rem 0;">{m.search_hint()}</p>
		{/if}
	</div>
</div>

<style>
	.search-page { max-width: 640px; margin: 0 auto; }
	.search-bar { margin: 1.5rem 0 1rem; }
	.search-bar input {
		width: 100%; padding: 0.75rem 1rem; border: 2px solid var(--border);
		border-radius: 10px; background: var(--surface); color: var(--fg);
		font-size: 1.1rem; font-family: inherit;
	}
	.search-bar input:focus { outline: none; border-color: var(--accent); }
	:global(.search-filters.ui-toggle-group) { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; border: none; overflow: visible; }
	:global(.search-filters .ui-toggle-group-item) {
		padding: 0.35rem 0.9rem; border: 1px solid var(--border); border-radius: 20px;
		background: none; color: var(--muted); cursor: pointer; font-size: 0.85rem;
	}
	:global(.search-filters .ui-toggle-group-item:hover) { border-color: var(--accent); color: var(--accent); background: none; }
	:global(.search-filters .ui-toggle-group-item[data-state="on"]) { background: var(--accent); color: #fff; border-color: var(--accent); }
	.result-count { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.75rem; }
	.empty { text-align: center; padding: 2rem 0; color: var(--muted); }
	.results { display: flex; flex-direction: column; gap: 0.5rem; }
	.result-item {
		display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
		border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--fg);
		transition: border-color 0.15s;
	}
	.result-item:hover { border-color: var(--accent); }
	.result-type { font-size: 1.25rem; }
	.result-name { font-weight: 600; }
	.result-meta { display: block; font-size: 0.8rem; color: var(--muted); }
</style>
