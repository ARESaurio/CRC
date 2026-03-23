<script lang="ts">
	import { page } from '$app/stores';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { saveScroll, restoreScroll } from '$lib/stores/scroll';
	import { localizeHref, deLocalizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	/** Convert a slug like "playstation-5" to "Playstation 5" */
	function slugToLabel(slug: string): string {
		return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	let { data, children } = $props();
	const game = $derived(data.game);

	const tabs = $derived([
		{ id: 'overview', label: m.game_tab_overview(), href: `/games/${game.game_id}`, enabled: game.tabs.overview },
		{ id: 'runs', label: m.game_tab_runs(), href: `/games/${game.game_id}/runs`, enabled: game.tabs.runs },
		{ id: 'rules', label: m.game_tab_rules(), href: `/games/${game.game_id}/rules`, enabled: game.tabs.rules },
		{ id: 'history', label: m.game_tab_history(), href: `/games/${game.game_id}/history`, enabled: game.tabs.history },
		{ id: 'resources', label: m.game_tab_resources(), href: `/games/${game.game_id}/resources`, enabled: game.tabs.resources },
		{ id: 'forum', label: m.game_tab_forum(), href: `/games/${game.game_id}/forum`, enabled: game.tabs.forum },
		{ id: 'suggest', label: m.game_tab_suggest_update(), href: `/games/${game.game_id}/suggest`, enabled: true, push: true },
		{ id: 'submit', label: m.game_tab_submit_run(), href: `/games/${game.game_id}/submit`, enabled: true },
	].filter(t => t.enabled));

	function isActiveTab(href: string): boolean {
		const path = deLocalizeHref($page.url.pathname);
		if (href === `/games/${game.game_id}`) {
			return path === href || path === href + '/';
		}
		return path.startsWith(href);
	}

	// Save scroll position before navigating away
	beforeNavigate(({ from }) => {
		if (from?.url) saveScroll(from.url.pathname);
	});

	// Restore scroll position after navigating within the same game
	afterNavigate(({ from, to }) => {
		if (!from?.url || !to?.url) return;
		const gamePrefix = `/games/${game.game_id}/`;
		const fromInGame = from.url.pathname.startsWith(gamePrefix) || from.url.pathname === `/games/${game.game_id}`;
		const toInGame = to.url.pathname.startsWith(gamePrefix) || to.url.pathname === `/games/${game.game_id}`;
		if (fromInGame && toInGame) {
			restoreScroll(to.url.pathname);
		}
	});
</script>

<svelte:head>
	<title>{game.game_name} | Challenge Run Community</title>
</svelte:head>

<div class="page-width">
	<p class="muted page-back"><a href={localizeHref('/games')}>{m.game_back_to_games()}</a></p>
</div>

<!-- Game Hero -->
{#if game.cover}
	<div class="page-width">
		<div class="game-shell">
			<section
				class="game-hero"
				style="background-image: url('{game.cover}'); background-position: {game.cover_position || 'center'};"
			>
				{#if game.is_modded}
					<div class="game-hero__modded-badge">
						<span class="modded-badge">🔧 MODDED</span>
					</div>
				{/if}
				<div class="game-hero__overlay">
					<div class="game-hero__content">
						<h1>{game.game_name}</h1>
						{#if game.platforms?.length}
							<div class="game-hero__tags">
								{#each game.platforms as platform}
									<span class="tag tag--platform">{slugToLabel(platform)}</span>
								{/each}
							</div>
						{/if}
					</div>
					{#if game.genres?.length}
						<div class="game-hero__genres">
							{#each game.genres ?? [] as genre}
								<span class="tag tag--genre">{slugToLabel(genre)}</span>
							{/each}
						</div>
					{/if}
				</div>
			</section>
		</div>
	</div>
{:else}
	<div class="page-width">
		<h1>{game.game_name}</h1>
		{#if game.platforms?.length || game.genres?.length}
			<div class="game-genres">
				{#each game.platforms ?? [] as platform}
					<span class="tag tag--platform">{slugToLabel(platform)}</span>
				{/each}
				{#each game.genres ?? [] as genre}
					<span class="tag tag--genre">{slugToLabel(genre)}</span>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<!-- Tab navigation + content (same parent needed for sticky tabs) -->
<div class="page-width">
	<div class="game-shell">
		<nav class="game-tabs" aria-label="Game sections">
			{#each tabs as tab}
				<a
					href={localizeHref(tab.href)}
					class="game-tab"
					class:game-tab--active={isActiveTab(tab.href)}
					class:game-tab--push={tab.push}
					data-sveltekit-noscroll
				>
					{tab.label}
				</a>
			{/each}
		</nav>
		{@render children()}
	</div>
</div>

<style>
	.page-back {
		margin: 1rem 0 0.5rem;
	}
	.page-back a {
		color: var(--text-muted);
		text-decoration: none;
	}
	.page-back a:hover {
		color: var(--fg);
	}
	.game-tabs {
		margin-bottom: 1.5rem;
	}
	.game-genres {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.5rem;
	}
</style>
