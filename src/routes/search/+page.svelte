<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const { games, runners, runs } = data;

	// Read initial query from URL
	let query = $state($page.url.searchParams.get('q') || '');
	let filter = $state<'all' | 'games' | 'runners' | 'runs'>('all');

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
		const tierLabel = tier === 'full_runs' ? 'Full Run' : tier === 'mini_challenges' ? 'Mini-Challenge' : tier === 'player_made' ? 'Player-Made' : tier;
		return category ? `${tierLabel} › ${category}` : tierLabel;
	}
</script>

<svelte:head><title>{query ? `Search: ${query}` : 'Search'} | Challenge Run Community</title></svelte:head>

<div class="page-width">
	<div class="search-page">
		<h1>Search</h1>

		<div class="search-bar">
			<input
				type="search"
				bind:value={query}
				placeholder="Search games, runners, runs..."
				autofocus
				onkeydown={handleKeydown}
			/>
		</div>

		<div class="search-filters">
			<button class="filter" class:filter--active={filter === 'all'} onclick={() => filter = 'all'}>All</button>
			<button class="filter" class:filter--active={filter === 'games'} onclick={() => filter = 'games'}>Games</button>
			<button class="filter" class:filter--active={filter === 'runners'} onclick={() => filter = 'runners'}>Runners</button>
			<button class="filter" class:filter--active={filter === 'runs'} onclick={() => filter = 'runs'}>Runs</button>
		</div>

		{#if hasQuery}
			<p class="result-count">{results.length} result{results.length !== 1 ? 's' : ''}</p>

			{#if results.length === 0}
				<p class="empty">No results found for "{query}"</p>
			{:else}
				<div class="results">
					{#each results as item}
						<a href={item.url} class="result-item">
							<span class="result-type">
								{#if item.type === 'game'}🎮{:else if item.type === 'runner'}🏃{:else}📹{/if}
							</span>
							<div class="result-info">
								{#if item.type === 'run'}
									<span class="result-name">{item.name}</span>
									<span class="result-meta">{item.gameName} — {formatCategory(item.categoryTier, item.category)}</span>
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
			<p class="muted" style="text-align: center; padding: 2rem 0;">Start typing to search across games, runners, and runs.</p>
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
	.search-filters { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
	.filter {
		padding: 0.35rem 0.9rem; border: 1px solid var(--border); border-radius: 20px;
		background: none; color: var(--muted); cursor: pointer; font-size: 0.85rem;
		font-family: inherit;
	}
	.filter:hover { border-color: var(--accent); color: var(--accent); }
	.filter--active { background: var(--accent); color: #fff; border-color: var(--accent); }
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
