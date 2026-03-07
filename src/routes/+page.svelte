<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { onMount } from 'svelte';

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

	const EXCERPT_LIMIT = 120;
	const CONTENT_PREVIEW_LIMIT = 300;

	function truncate(text: string | undefined, limit: number): string {
		if (!text) return '';
		if (text.length <= limit) return text;
		return text.slice(0, limit).trimEnd() + '…';
	}

	/** Strip markdown/HTML for a plain-text content preview */
	function stripToPlain(text: string): string {
		return text
			.replace(/#{1,6}\s+/g, '')
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
			.replace(/```[\s\S]*?```/g, '')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/>\s?/gm, '')
			.replace(/[-*+]\s/g, '')
			.replace(/\n{2,}/g, ' ')
			.replace(/\n/g, ' ')
			.trim();
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
	<title>Challenge Run Community</title>
	<meta name="description" content="A space built around creative challenge runs, clear rules, and respect for all challenge styles." />
</svelte:head>

<div class="page-width">

	<h1>Challenge Run Community</h1>
	<p class="muted mb-6">A space built around creative challenge runs, clear rules, and respect for all challenge styles.</p>

	<div class="home-grid">
		<!-- News Carousel -->
		<div class="home-main">
			<div class="home-card home-card--square">
				<h2 class="home-card__title">📰 News</h2>
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
								<a href="/news/{post.slug}" class="news-slide" class:is-active={currentSlide === i}>
									<span class="news-slide__date muted">{formatDate(post.date)}</span>
									<h3 class="news-slide__title">{post.title}</h3>
									{#if post.excerpt}
										<p class="news-slide__excerpt muted">
											{truncate(post.excerpt, EXCERPT_LIMIT)}
										</p>
									{/if}
									{#if post.content}
										<p class="news-slide__content-preview">
											{truncate(stripToPlain(post.content), CONTENT_PREVIEW_LIMIT)}
										</p>
									{/if}
									<span class="news-slide__read-more">Read more →</span>
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
									<a href="/news" class="muted">View all {data.stats.postCount} article{data.stats.postCount === 1 ? '' : 's'} →</a>
								</p>
							</div>
						{:else}
							<div class="news-slide is-active" style="display:block;">
								<span class="news-slide__date muted">Coming Soon</span>
								<p class="news-slide__excerpt">News and updates will appear here.</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Community Board -->
		<div class="home-sidebar">
			<div class="home-card home-card--full-height">
				<h2 class="home-card__title">📋 Community Board</h2>
				<div class="community-board">
					<p class="muted" style="margin-bottom: 1rem; font-size: 0.9rem;">Bounties, requests, and community highlights</p>
					<div class="board-list">
						<div class="board-item board-item--placeholder">
							<span class="board-item__type muted">Bounty</span>
							<p class="board-item__text">No active bounties yet. Check back soon!</p>
						</div>
						<div class="board-item board-item--placeholder">
							<span class="board-item__type muted">Request</span>
							<p class="board-item__text">Want to post a bounty or request? Contact us!</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Links -->
	<div class="resource-cards">
		<a href="/games" class="resource-card card-lift--sm">
			<div class="resource-card__icon">🎮</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">Games</h2>
				<p class="resource-card__desc">Browse all tracked games</p>
				<span class="resource-card__count">{data.stats.gameCount} {data.stats.gameCount === 1 ? 'game' : 'games'}</span>
			</div>
		</a>

		<a href="/runners" class="resource-card card-lift--sm">
			<div class="resource-card__icon">🏆</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">Runners</h2>
				<p class="resource-card__desc">View runner profiles and runs</p>
				<span class="resource-card__count">{data.stats.runnerCount} {data.stats.runnerCount === 1 ? 'runner' : 'runners'}</span>
			</div>
		</a>

		<a href="/rules" class="resource-card card-lift--sm">
			<div class="resource-card__icon">📜</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">Rules</h2>
				<p class="resource-card__desc">Site-wide guidelines and policies</p>
				<span class="resource-card__count">Learn more</span>
			</div>
		</a>

		<a href="/glossary" class="resource-card card-lift--sm">
			<div class="resource-card__icon">📖</div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">Glossary</h2>
				<p class="resource-card__desc">Challenge run terminology</p>
				<span class="resource-card__count">Reference</span>
			</div>
		</a>
	</div>

	<!-- Recent Runs -->
	{#if data.recentRuns.length > 0}
		<section class="home-section">
			<h2>🏃 Recent Runs</h2>
			<div class="recent-runs-list">
				{#each data.recentRuns.slice(0, 6) as run}
					<div class="recent-run">
						<a href="/runners/{run.runner_id}" class="recent-run__runner">{run.runner}</a>
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
		<h2 class="featured-teams__title">🤝 Affiliated Teams</h2>
		{#if data.stats.teamCount > 0}
			<div class="teams-grid">
				{#each data.teams as team}
					<a href="/teams/{team.team_id}" class="team-card card-lift--sm">
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
					<div class="team-card__name">Teams coming soon</div>
				</div>
			</div>
		{/if}
		<p class="muted mt-3" style="font-size: 0.9rem;">
			Interested in partnering? <a href="/support">Contact us!</a>
		</p>
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
	.news-slide__title { font-size: 1.15rem; margin: 0.25rem 0 0.5rem; color: var(--fg); }
	a.news-slide:hover .news-slide__title { color: var(--accent); }
	.news-slide__excerpt { font-size: 0.9rem; line-height: 1.5; margin: 0 0 0.5rem; color: var(--muted); }
	.news-slide__content-preview { font-size: 0.88rem; line-height: 1.6; margin: 0 0 0.75rem; color: var(--fg); opacity: 0.8; }
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
