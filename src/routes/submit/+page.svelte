<script lang="ts">
	import { goto } from '$app/navigation';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

	let { data } = $props();
	let search = $state('');
	let selectedGame = $state<{ game_id: string; game_name: string } | null>(null);

	const filtered = $derived(
		search.trim()
			? data.games.filter((g: any) => g.game_name.toLowerCase().includes(search.toLowerCase())).slice(0, 12)
			: data.games.slice(0, 12)
	);

	function handleSelect(gameId: string) {
		const game = data.games.find((g: any) => g.game_id === gameId);
		if (game) {
			selectedGame = game;
			search = game.game_name;
		}
	}

	// Clear selection if user edits the search after selecting
	$effect(() => {
		search;
		if (selectedGame && search !== selectedGame.game_name) {
			selectedGame = null;
		}
	});
</script>

<svelte:head>
	<title>{m.submit_page_title()}</title>
</svelte:head>

<div class="page-width">
	<div class="submit-hub">
		<h1>{m.submit_heading_hub()}</h1>
		<p class="muted">{m.submit_hub_desc()}</p>

		<div class="submit-columns">
			<!-- Left: Submit a Run -->
			<div class="submit-card">
				<div class="submit-card__icon">🏃</div>
				<h2>{m.submit_heading()}</h2>
				<p class="submit-card__desc">{m.submit_description()}</p>

				<label for="game-search" class="field-label">{m.submit_game_label()} <span class="req">*</span></label>
				<Combobox.Root class="game-combobox" bind:inputValue={search} onValueChange={(v: string) => handleSelect(v)}>
					<Combobox.Input placeholder={m.submit_search_placeholder()} />
					<Combobox.Content>
						{#each filtered as g}
							<Combobox.Item value={g.game_id} forceMount>{g.game_name}</Combobox.Item>
						{/each}
						{#if filtered.length === 0 && search.trim()}
							<div class="combobox-empty">{m.submit_no_games()}</div>
						{/if}
					</Combobox.Content>
				</Combobox.Root>
				{#if selectedGame}
					<a href={localizeHref(`/games/${selectedGame.game_id}/submit`)} class="selected-game-link">
						🏃 {m.submit_go_to_game({ name: selectedGame.game_name })}
					</a>
				{/if}
				<p class="picker-hint">{m.submit_hint()}</p>
			</div>

			<!-- Right: Request a New Game -->
			<div class="submit-card submit-card--request">
				<div class="submit-card__icon">🎮</div>
				<h2>{m.submit_request_heading()}</h2>
				<p class="submit-card__desc">{m.submit_request_desc()}</p>
				<a href={localizeHref('/submit-game')} class="submit-card__btn">{m.submit_request_btn()}</a>
			</div>
		</div>
	</div>
</div>

<style>
	.submit-hub { max-width: 900px; margin: 0 auto; }
	h1 { margin: 0 0 0.25rem; }
	.muted { color: var(--text-muted); margin: 0 0 2rem; }

	.submit-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		align-items: start;
	}

	.submit-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.submit-card__icon {
		font-size: 2rem;
		margin-bottom: 0.75rem;
	}

	.submit-card h2 {
		margin: 0 0 0.5rem;
		font-size: 1.15rem;
	}

	.submit-card__desc {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0 0 1.25rem;
		line-height: 1.5;
	}

	.field-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		display: block;
		margin-bottom: 0.35rem;
	}
	.req { color: #ef4444; font-weight: 600; }

	.combobox-empty { padding: 0.75rem; font-size: 0.85rem; color: var(--text-muted); text-align: center; }

	.picker-hint { margin: 1rem 0 0; font-size: 0.8rem; color: var(--text-muted); }

	.selected-game-link {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.75rem;
		padding: 0.65rem 1rem;
		background: rgba(var(--accent-rgb, 59, 195, 110), 0.08);
		border: 1px solid rgba(var(--accent-rgb, 59, 195, 110), 0.25);
		border-radius: 8px;
		color: var(--accent);
		font-weight: 600;
		font-size: 0.95rem;
		text-decoration: none;
		transition: background 0.15s, border-color 0.15s;
	}
	.selected-game-link:hover {
		background: rgba(var(--accent-rgb, 59, 195, 110), 0.15);
		border-color: var(--accent);
	}

	/* Right card */
	.submit-card--request {
		display: flex;
		flex-direction: column;
	}

	.submit-card__btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.6rem 1.25rem;
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 0.95rem;
		font-weight: 600;
		text-decoration: none;
		transition: opacity 0.15s;
		margin-top: auto;
	}
	.submit-card__btn:hover { opacity: 0.9; color: #fff; }

	@media (max-width: 640px) {
		.submit-columns {
			grid-template-columns: 1fr;
		}
	}
</style>
