<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { sanitizeText } from '$lib/utils/markdown';
	import { onMount } from 'svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Trophy, Users, Gamepad2, Timer } from 'lucide-svelte';

	let { data } = $props();

	// ── News Carousel State ──
	let currentSlide = $state(0);
	const postsToShow = $derived(
		(data.posts.filter((p: any) => p.featured).length > 0
			? data.posts.filter((p: any) => p.featured)
			: data.posts
		).slice(0, 5)
	);
	let autoplayInterval: ReturnType<typeof setInterval> | null = null;
	let carouselHovered = $state(false);

	const EXCERPT_LIMIT = 210;
	const CONTENT_PREVIEW_LIMIT = 600;

	function truncate(text: string | undefined, limit: number): string {
		if (!text) return '';
		if (text.length <= limit) return text;
		return text.slice(0, limit).trimEnd() + '…';
	}

	/** Render a truncated markdown preview — renders to HTML, then caps by stripping for length check */
	function renderPreview(content: string | undefined, limit: number): string {
		if (!content) return '';
		// Take a reasonable chunk of raw markdown, render it, then let CSS handle overflow
		const chunk = content.slice(0, limit * 2);
		return renderMarkdown(chunk);
	}

	function showSlide(index: number) {
		if (index >= postsToShow.length) index = 0;
		if (index < 0) index = postsToShow.length - 1;
		currentSlide = index;
	}

	function startAutoplay() {
		stopAutoplay();
		autoplayInterval = setInterval(() => showSlide(currentSlide + 1), 5000);
	}

	function stopAutoplay() {
		if (autoplayInterval) { clearInterval(autoplayInterval); autoplayInterval = null; }
	}

	onMount(() => {
		if (postsToShow.length > 1) startAutoplay();

		const handleVisibility = () => {
			if (document.hidden) stopAutoplay();
			else if (!carouselHovered && postsToShow.length > 1) startAutoplay();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		return () => { stopAutoplay(); document.removeEventListener('visibilitychange', handleVisibility); };
	});
</script>

<svelte:head>
	<title>{m.home_title()}</title>
	<meta name="description" content={m.home_subtitle()} />
</svelte:head>

<div class="page-width">

	<h1>{m.home_title()}</h1>
	<p class="muted mb-6">{m.home_subtitle()}</p>

	<div class="home-grid">
		<!-- News Carousel -->
		<div class="home-main">
			<div class="home-card home-card--square">
				<h2 class="home-card__title">{m.home_news()}</h2>
				<div class="home-card__content">
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="news-carousel"
						onmouseenter={() => { carouselHovered = true; stopAutoplay(); }}
						onmouseleave={() => { carouselHovered = false; if (postsToShow.length > 1) startAutoplay(); }}
					>
						{#if postsToShow.length > 0}
							{#if postsToShow.length > 1}
								<button class="news-carousel__arrow news-carousel__arrow--prev" aria-label="Previous" onclick={() => { showSlide(currentSlide - 1); stopAutoplay(); startAutoplay(); }}>‹</button>
								<button class="news-carousel__arrow news-carousel__arrow--next" aria-label="Next" onclick={() => { showSlide(currentSlide + 1); stopAutoplay(); startAutoplay(); }}>›</button>
							{/if}

							{#each postsToShow as post, i}
								<a href={localizeHref(`/news/${post.slug}`)} class="news-slide" class:is-active={currentSlide === i}>
									<span class="news-slide__date muted">{formatDate(post.date)}</span>
									<h3 class="news-slide__title">{post.title}</h3>
									{#if post.tags?.length > 0}
										<div class="news-slide__tags">
											{#each post.tags.slice(0, 3) as tag}
												<span class="news-slide__tag">{tag}</span>
											{/each}
										</div>
									{/if}
									{#if post.excerpt}
										<p class="news-slide__excerpt muted">
											{truncate(post.excerpt, EXCERPT_LIMIT)}
										</p>
									{/if}
									{#if post.content}
										<div class="news-slide__content-preview markdown-preview">
											{@html renderPreview(post.content, CONTENT_PREVIEW_LIMIT)}
										</div>
									{/if}
									<span class="news-slide__read-more">{m.home_read_more()}</span>
								</a>
							{/each}

							<div class="news-carousel__footer">
								{#if postsToShow.length > 1}
									<div class="news-carousel__dots">
										{#each postsToShow as _, i}
											<button
												type="button"
												class="news-carousel__dot"
												class:is-active={currentSlide === i}
												aria-label="Go to slide {i + 1}"
												onclick={() => { showSlide(i); startAutoplay(); }}
											></button>
										{/each}
									</div>
								{/if}
								<p class="news-carousel__link">
									<a href={localizeHref('/news')} class="muted">{data.stats.postCount === 1 ? m.home_view_article({ count: data.stats.postCount }) : m.home_view_articles({ count: data.stats.postCount })}</a>
								</p>
							</div>
						{:else}
							<div class="news-slide is-active" style="display:block;">
								<span class="news-slide__date muted">{m.home_coming_soon()}</span>
								<p class="news-slide__excerpt">{m.home_news_empty()}</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Community Board -->
		<div class="home-sidebar">
			<div class="home-card home-card--full-height">
				<h2 class="home-card__title">{m.home_community_board()}</h2>
				<div class="community-board">
					<p class="muted" style="margin-bottom: 1rem; font-size: 0.9rem;">{m.home_board_desc()}</p>
					<div class="board-list">
						<div class="board-item board-item--placeholder">
							<span class="board-item__type muted">{m.home_bounty()}</span>
							<p class="board-item__text">{m.home_bounty_empty()}</p>
						</div>
						<div class="board-item board-item--placeholder">
							<span class="board-item__type muted">{m.home_request()}</span>
							<p class="board-item__text">{m.home_request_empty()}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Links -->
	<div class="resource-cards">
		<a href={localizeHref('/games')} class="resource-card card-lift--sm">
			<div class="resource-card__icon">🎮</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_games()}</h2>
				<p class="resource-card__desc">{m.home_games_desc()}</p>
				<span class="resource-card__count">{data.stats.gameCount === 1 ? m.home_game_count({ count: data.stats.gameCount }) : m.home_games_count({ count: data.stats.gameCount })}</span>
			</div>
		</a>

		<a href={localizeHref('/runners')} class="resource-card card-lift--sm">
			<div class="resource-card__icon">🏆</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_runners()}</h2>
				<p class="resource-card__desc">{m.home_runners_desc()}</p>
				<span class="resource-card__count">{data.stats.runnerCount === 1 ? m.home_runner_count({ count: data.stats.runnerCount }) : m.home_runners_count({ count: data.stats.runnerCount })}</span>
			</div>
		</a>

		<a href={localizeHref('/rules')} class="resource-card card-lift--sm">
			<div class="resource-card__icon">📜</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_rules()}</h2>
				<p class="resource-card__desc">{m.home_rules_desc()}</p>
				<span class="resource-card__count">{m.home_learn_more()}</span>
			</div>
		</a>

		<a href={localizeHref('/glossary')} class="resource-card card-lift--sm">
			<div class="resource-card__icon">📖</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_glossary()}</h2>
				<p class="resource-card__desc">{m.home_glossary_desc()}</p>
				<span class="resource-card__count">{m.home_reference()}</span>
			</div>
		</a>
	</div>

	<!-- Recent Runs -->
	{#if data.recentRuns.length > 0}
		<section class="home-section">
			<h2>{m.home_recent_runs()}</h2>
			<div class="recent-runs-list">
				{#each data.recentRuns.slice(0, 6) as run}
					<div class="recent-run">
						<a href={localizeHref(`/runners/${run.runner_id}`)} class="recent-run__runner">{run.runner}</a>
						<span class="muted">·</span>
						<span class="recent-run__game">{run.game_id}</span>
						<span class="muted">·</span>
						<span class="recent-run__cat">{run.category}</span>
						{#if run.time_primary}
							<span class="recent-run__time">{run.time_primary}</span>
						{/if}
						<span class="recent-run__date muted">{formatDate(run.date_completed)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Featured Teams -->
	<div class="featured-teams">
		<h2 class="featured-teams__title">{m.home_affiliated_teams()}</h2>
		{#if data.stats.teamCount > 0}
			<div class="teams-grid">
				{#each data.teams as team}
					<a href={localizeHref(`/teams/${team.team_id}`)} class="team-card card-lift--sm">
						{#if team.logo}
							<img src={team.logo} alt={team.name} class="team-card__logo">
						{:else}
							<div class="team-card__logo team-card__logo--placeholder">{team.name?.charAt(0) ?? '?'}</div>
						{/if}
						<div class="team-card__name">{team.name}</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="teams-grid">
				<div class="team-card team-card--placeholder" style="border-style: dashed; opacity: 0.7;">
					<div class="team-card__logo">?</div>
					<div class="team-card__name">{m.home_teams_coming_soon()}</div>
				</div>
			</div>
		{/if}
	</div>

</div>

<style>
	h1 { margin: 0 0 0.25rem; }
	.mb-6 { margin-bottom: 1.5rem; }
	.mt-3 { margin-top: 0.75rem; }
	.muted { opacity: 0.6; }

	/* Home Grid */
	.home-grid { display: grid; grid-template-columns: 1fr 320px; gap: 1.5rem; }
	.home-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
	.home-card--square { min-height: 260px; }
	.home-card--full-height { height: 100%; }
	.home-card__title { font-size: 1.1rem; margin: 0 0 0.75rem; }

	/* News Carousel */
	.news-carousel { position: relative; padding: 0 1.25rem; }
	.news-slide { display: none; text-decoration: none; color: inherit; }
	.news-slide.is-active { display: block; }
	a.news-slide { cursor: pointer; border-radius: 8px; padding: 0.5rem; margin: 0 -0.5rem; transition: background 0.15s; }
	a.news-slide:hover { background: rgba(255,255,255,0.03); }
	.news-slide__date { font-size: 0.8rem; }
	.news-slide__title { font-size: 1.15rem; margin: 0.25rem 0 0.35rem; color: var(--fg); }
	a.news-slide:hover .news-slide__title { color: var(--accent); }

	/* Tags in carousel */
	.news-slide__tags { display: flex; gap: 0.3rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
	.news-slide__tag {
		display: inline-block; padding: 0.1rem 0.4rem;
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 4px; font-size: 0.7rem; color: var(--muted);
	}

	.news-slide__excerpt { font-size: 0.9rem; line-height: 1.5; margin: 0 0 0.5rem; color: var(--muted); }

	/* Markdown content preview in carousel */
	.news-slide__content-preview {
		font-size: 0.88rem; line-height: 1.6; margin: 0 0 0.75rem; color: var(--fg); opacity: 0.8;
		max-height: 14em; overflow: hidden; position: relative;
	}
	.news-slide__content-preview::after {
		content: '';
		position: absolute; bottom: 0; left: 0; right: 0;
		height: 2em;
		background: linear-gradient(transparent, var(--surface));
		pointer-events: none;
	}
	/* Markdown elements inside the preview */
	.news-slide__content-preview :global(p) { margin: 0 0 0.5rem; }
	.news-slide__content-preview :global(h2),
	.news-slide__content-preview :global(h3) { font-size: 1rem; margin: 0.5rem 0 0.25rem; }
	.news-slide__content-preview :global(ul),
	.news-slide__content-preview :global(ol) { padding-left: 1.25rem; margin: 0 0 0.5rem; }
	.news-slide__content-preview :global(li) { margin-bottom: 0.15rem; }
	.news-slide__content-preview :global(strong) { font-weight: 600; }
	.news-slide__content-preview :global(a) { color: var(--accent); text-decoration: none; pointer-events: none; }
	.news-slide__content-preview :global(code) {
		background: rgba(255,255,255,0.06); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em;
	}
	.news-slide__content-preview :global(blockquote) {
		border-left: 2px solid var(--accent); margin: 0.25rem 0; padding: 0.25rem 0.75rem;
		color: var(--muted); font-size: 0.9em;
	}
	.news-slide__content-preview :global(img) { display: none; }

	.news-slide__read-more { font-size: 0.85rem; color: var(--accent); font-weight: 500; }

	/* Prev/Next Arrows */
	.news-carousel__arrow {
		position: absolute; top: 50%; transform: translateY(-50%); z-index: 5;
		background: var(--surface); border: 1px solid var(--border); border-radius: 50%;
		width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
		font-size: 1.2rem; color: var(--muted); cursor: pointer; transition: all 0.15s;
		line-height: 1; padding: 0;
	}
	.news-carousel__arrow:hover { border-color: var(--accent); color: var(--accent); background: var(--bg); }
	.news-carousel__arrow--prev { left: -12px; }
	.news-carousel__arrow--next { right: -12px; }

	/* Footer: dots + link */
	.news-carousel__footer { margin-top: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
	.news-carousel__dots { display: flex; gap: 0.5rem; }
	.news-carousel__dot {
		width: 8px; height: 8px; border-radius: 50%;
		background: var(--border); border: none; cursor: pointer; padding: 0;
		transition: background 0.2s;
	}
	.news-carousel__dot.is-active { background: var(--accent); }
	.news-carousel__link { font-size: 0.9rem; margin: 0; }
	.news-carousel__link a { text-decoration: none; }
	.news-carousel__link a:hover { color: var(--accent) !important; }

	/* Community Board */
	.board-item { padding: 0.75rem; border-bottom: 1px solid var(--border); background: var(--surface); border-radius: 6px; margin-bottom: 0.5rem; border: 1px solid var(--border); }
	.board-item:last-child { margin-bottom: 0; }
	.board-item__type { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
	.board-item__text { margin: 0.25rem 0 0; font-size: 0.9rem; line-height: 1.4; }

	/* Resource Cards */
	.resource-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
	.resource-card {
		display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem;
		background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
		text-decoration: none; color: var(--fg); transition: border-color 0.2s, transform 0.2s;
	}
	.resource-card:hover { border-color: var(--accent); transform: translateY(-2px); }
	.resource-card__icon { font-size: 1.75rem; flex-shrink: 0; }
	.resource-card__title { font-size: 1rem; margin: 0; }
	.resource-card__desc { font-size: 0.8rem; margin: 0.15rem 0; opacity: 0.6; }
	.resource-card__count { font-size: 0.75rem; color: var(--accent); font-weight: 600; }

	/* Recent Runs */
	.home-section { margin-top: 2rem; }
	.home-section h2 { margin-bottom: 1rem; font-size: 1.25rem; }
	.recent-runs-list { display: flex; flex-direction: column; gap: 0.35rem; }
	.recent-run {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
		padding: 0.5rem 0.75rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 6px; font-size: 0.9rem;
	}
	.recent-run__runner { color: var(--accent); text-decoration: none; font-weight: 600; }
	.recent-run__runner:hover { text-decoration: underline; }
	.recent-run__time { font-family: monospace; font-size: 0.85rem; color: var(--accent); }
	.recent-run__date { margin-left: auto; font-size: 0.8rem; }

	/* Featured Teams */
	.featured-teams { margin-top: 2rem; }
	.featured-teams__title { font-size: 1.25rem; margin-bottom: 1rem; }
	.teams-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; }
	.team-card {
		display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
		padding: 1rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 10px; text-decoration: none; color: var(--fg);
		transition: border-color 0.2s, transform 0.2s;
	}
	.team-card:hover { border-color: var(--accent); transform: translateY(-2px); }
	.team-card__logo { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
	.team-card__logo--placeholder {
		display: flex; align-items: center; justify-content: center;
		background: var(--border); font-size: 1.5rem; font-weight: 700;
	}
	.team-card__name { font-size: 0.9rem; font-weight: 600; text-align: center; }
	.featured-teams a { color: var(--accent); text-decoration: none; }
	.featured-teams a:hover { text-decoration: underline; }

	@media (max-width: 768px) {
		.home-grid { grid-template-columns: 1fr; }
		.resource-cards { grid-template-columns: repeat(2, 1fr); }
		.recent-run__date { margin-left: 0; }
		.news-carousel__arrow--prev { left: -6px; }
		.news-carousel__arrow--next { right: -6px; }
		.news-carousel__arrow { width: 28px; height: 28px; font-size: 1rem; }
	}
	@media (max-width: 480px) {
		.resource-cards { grid-template-columns: 1fr; }
	}
</style>
