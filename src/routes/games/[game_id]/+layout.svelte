<script lang="ts">
	import { page } from '$app/stores';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { saveScroll, restoreScroll } from '$lib/stores/scroll';

	/** Convert a slug like "playstation-5" to "Playstation 5" */
	function slugToLabel(slug: string): string {
		return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	let { data, children } = $props();
	const game = $derived(data.game);

	const tabs = $derived([
		{ id: 'overview', label: 'Overview', href: `/games/${game.game_id}`, enabled: game.tabs.overview },
		{ id: 'runs', label: 'Runs', href: `/games/${game.game_id}/runs`, enabled: game.tabs.runs },
		{ id: 'rules', label: 'Rules', href: `/games/${game.game_id}/rules`, enabled: game.tabs.rules },
		{ id: 'history', label: 'History', href: `/games/${game.game_id}/history`, enabled: game.tabs.history },
		{ id: 'resources', label: 'Resources', href: `/games/${game.game_id}/resources`, enabled: game.tabs.resources },
		{ id: 'forum', label: 'Forum', href: `/games/${game.game_id}/forum`, enabled: game.tabs.forum },
		{ id: 'suggest', label: 'Suggest an Update', href: `/games/${game.game_id}/suggest`, enabled: true, push: true },
		{ id: 'submit', label: 'Submit Run', href: `/games/${game.game_id}/submit`, enabled: true },
	].filter(t => t.enabled));

	function isActiveTab(href: string): boolean {
		const path = $page.url.pathname;
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
	<p class="muted page-back"><a href="/games">← Games</a></p>
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
						{#if game.genres?.length || game.platforms?.length}
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
				</div>
			</section>
		</div>
	</div>
{:else}
	<div class="page-width">
		<h1>{game.game_name}</h1>
	</div>
{/if}

<!-- Tab navigation + content (same parent needed for sticky tabs) -->
<div class="page-width">
	<div class="game-shell">
		<nav class="game-tabs" aria-label="Game sections">
			{#each tabs as tab}
				<a
					href={tab.href}
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
</style>
