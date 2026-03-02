<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();
	let search = $state('');
	let open = $state(false);
	let highlightIndex = $state(-1);

	const filtered = $derived(
		search.trim()
			? data.games.filter((g: any) => g.game_name.toLowerCase().includes(search.toLowerCase())).slice(0, 12)
			: data.games.slice(0, 12)
	);

	function selectGame(gameId: string) {
		open = false;
		goto(`/games/${gameId}/submit`);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open && e.key !== 'Escape') open = true;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightIndex = Math.min(highlightIndex + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightIndex = Math.max(highlightIndex - 1, 0);
		} else if (e.key === 'Enter' && highlightIndex >= 0 && filtered[highlightIndex]) {
			e.preventDefault();
			selectGame(filtered[highlightIndex].game_id);
		} else if (e.key === 'Escape') {
			open = false;
		}
	}

	function onFocus() {
		open = true;
		highlightIndex = -1;
	}

	function onBlur() {
		// Delay to allow click on dropdown item
		setTimeout(() => { open = false; }, 150);
	}

	// Reset highlight when search changes
	$effect(() => {
		search;
		highlightIndex = -1;
	});
</script>

<svelte:head>
	<title>Submit a Run | CRC</title>
</svelte:head>

<div class="page-width">
<div class="submit-picker">
	<h2>Submit a Run</h2>
	<p class="muted">Select a game to begin your submission.</p>

	<div class="picker-card">
		<label for="game-search" class="field-label">Game <span class="req">*</span></label>
		<div class="typeahead">
			<input
				id="game-search"
				type="text"
				bind:value={search}
				placeholder="Type to search games..."
				autocomplete="off"
				onfocus={onFocus}
				onblur={onBlur}
				onkeydown={onKeydown}
			/>
			{#if open && filtered.length > 0}
				<ul class="typeahead__list" role="listbox">
					{#each filtered as g, i}
						<li
							role="option"
							aria-selected={i === highlightIndex}
							class="typeahead__item"
							class:typeahead__item--active={i === highlightIndex}
							onmousedown={() => selectGame(g.game_id)}
						>
							{g.game_name}
						</li>
					{/each}
				</ul>
			{:else if open && search.trim() && filtered.length === 0}
				<ul class="typeahead__list">
					<li class="typeahead__empty">No games found</li>
				</ul>
			{/if}
		</div>
		</div>
		<p class="picker-hint">Or go to a game's page and click "Submit Run" from there.</p>
	</div>
</div>

<style>
	.submit-picker { text-align: center; }
	h2 { margin: 0 0 0.25rem; }
	.muted { color: var(--text-muted); margin: 0 0 1.5rem; }

	.picker-card {
		background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
		padding: 1.5rem; text-align: left;
	}
	.field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.35rem; }
	.req { color: #ef4444; font-weight: 600; }

	.typeahead { position: relative; }
	.typeahead input {
		width: 100%; padding: 0.6rem 0.75rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 6px; color: var(--fg); font-size: 0.95rem; font-family: inherit;
	}
	.typeahead input:focus { outline: none; border-color: var(--accent); }
	.typeahead input:hover:not(:focus) { border-color: color-mix(in srgb, var(--border) 50%, var(--accent)); }

	.typeahead__list {
		position: absolute; top: 100%; left: 0; right: 0; z-index: 20;
		background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
		margin-top: 4px; padding: 0.25rem 0; list-style: none;
		max-height: 260px; overflow-y: auto;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
	}
	.typeahead__item {
		padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.9rem;
		transition: background 0.1s;
	}
	.typeahead__item:hover, .typeahead__item--active {
		background: rgba(var(--accent-rgb, 59, 195, 110), 0.12); color: var(--accent);
	}
	.typeahead__empty { padding: 0.75rem; font-size: 0.85rem; color: var(--text-muted); text-align: center; }

	.picker-hint { margin: 1rem 0 0; font-size: 0.8rem; color: var(--text-muted); text-align: center; }
</style>
