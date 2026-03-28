<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { onMount } from 'svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Trophy, Users, Gamepad2, Timer, ScrollText, BookOpen, Play, ExternalLink } from 'lucide-svelte';

	let { data } = $props();

	// ── Runs Carousel State ──
	let currentRun = $state(0);
	const runsToShow = $derived(data.recentRuns.slice(0, 10));
	let runAutoplayInterval: ReturnType<typeof setInterval> | null = null;
	let runHovered = $state(false);

	function showRun(index: number) {
		if (runsToShow.length === 0) return;
		if (index >= runsToShow.length) index = 0;
		if (index < 0) index = runsToShow.length - 1;
		currentRun = index;
	}

	function startRunAutoplay() {
		stopRunAutoplay();
		runAutoplayInterval = setInterval(() => showRun(currentRun + 1), 6000);
	}

	function stopRunAutoplay() {
		if (runAutoplayInterval) { clearInterval(runAutoplayInterval); runAutoplayInterval = null; }
	}

	// ── News Carousel State ──
	let currentSlide = $state(0);
	const postsToShow = $derived(
		(data.posts.filter((p: any) => p.featured).length > 0
			? data.posts.filter((p: any) => p.featured)
			: data.posts
		).slice(0, 5)
	);
	let newsAutoplayInterval: ReturnType<typeof setInterval> | null = null;
	let newsHovered = $state(false);

	const EXCERPT_LIMIT = 180;
	const CONTENT_PREVIEW_LIMIT = 600;

	function truncate(text: string | undefined, limit: number): string {
		if (!text) return '';
		if (text.length <= limit) return text;
		return text.slice(0, limit).trimEnd() + '…';
	}

	function renderPreview(content: string | undefined, limit: number): string {
		if (!content) return '';
		const chunk = content.slice(0, limit * 2);
		return renderMarkdown(chunk);
	}

	function showSlide(index: number) {
		if (index >= postsToShow.length) index = 0;
		if (index < 0) index = postsToShow.length - 1;
		currentSlide = index;
	}

	function startNewsAutoplay() {
		stopNewsAutoplay();
		newsAutoplayInterval = setInterval(() => showSlide(currentSlide + 1), 5000);
	}

	function stopNewsAutoplay() {
		if (newsAutoplayInterval) { clearInterval(newsAutoplayInterval); newsAutoplayInterval = null; }
	}

	/** Extract a YouTube thumbnail URL */
	function getVideoThumbnail(url: string | undefined): string | null {
		if (!url) return null;
		try {
			const u = new URL(url);
			const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
			if (host === 'youtu.be') {
				const id = u.pathname.slice(1);
				if (id) return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
			}
			if (host === 'youtube.com') {
				const id = u.searchParams.get('v');
				if (id) return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
			}
		} catch { /* invalid URL */ }
		return null;
	}

	onMount(() => {
		if (runsToShow.length > 1) startRunAutoplay();
		if (postsToShow.length > 1) startNewsAutoplay();

		const handleVisibility = () => {
			if (document.hidden) {
				stopRunAutoplay();
				stopNewsAutoplay();
			} else {
				if (!runHovered && runsToShow.length > 1) startRunAutoplay();
				if (!newsHovered && postsToShow.length > 1) startNewsAutoplay();
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		return () => {
			stopRunAutoplay();
			stopNewsAutoplay();
			document.removeEventListener('visibilitychange', handleVisibility);
		};
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
		<!-- Recently Verified Runs Carousel (main area) -->
		<div class="home-main">
			<div class="home-card">
				<h2 class="home-card__title">{m.home_recent_runs()}</h2>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="run-carousel"
					onmouseenter={() => { runHovered = true; stopRunAutoplay(); }}
					onmouseleave={() => { runHovered = false; if (runsToShow.length > 1) startRunAutoplay(); }}
				>
					{#if runsToShow.length > 0}
						{#if runsToShow.length > 1}
							<button class="run-carousel__arrow run-carousel__arrow--prev" aria-label="Previous run" onclick={() => { showRun(currentRun - 1); stopRunAutoplay(); startRunAutoplay(); }}>‹</button>
							<button class="run-carousel__arrow run-carousel__arrow--next" aria-label="Next run" onclick={() => { showRun(currentRun + 1); stopRunAutoplay(); startRunAutoplay(); }}>›</button>
						{/if}

						{#each runsToShow as run, i}
							{@const thumb = getVideoThumbnail(run.video_url)}
							<div class="run-slide" class:is-active={currentRun === i}>
								<a href={run.video_url || localizeHref(`/games/${run.game_id}`)} target={run.video_url ? '_blank' : undefined} rel={run.video_url ? 'noopener' : undefined} class="run-slide__link">
									<div class="run-slide__thumb">
										{#if thumb}
											<img src={thumb} alt="{run.runner} - {run.category}" />
										{:else}
											<div class="run-slide__thumb-placeholder"><Play size={48} /></div>
										{/if}
									</div>
								</a>
								<div class="run-slide__info">
									<a href={localizeHref(`/runners/${run.runner_id}`)} class="run-slide__runner">{run.runner}</a>
									<span class="run-slide__detail">
										<span class="run-slide__game">{run.game_id}</span>
										<span class="muted">·</span>
										<span>{run.category}</span>
									</span>
									{#if run.time_primary}
										<span class="run-slide__time">{run.time_primary}</span>
									{/if}
									<span class="run-slide__date muted">{formatDate(run.date_completed)}</span>
								</div>
							</div>
						{/each}

						<div class="run-carousel__footer">
							{#if runsToShow.length > 1}
								<div class="run-carousel__dots">
									{#each runsToShow as _, i}
										<button
											type="button"
											class="run-carousel__dot"
											class:is-active={currentRun === i}
											aria-label="Go to run {i + 1}"
											onclick={() => { showRun(i); stopRunAutoplay(); startRunAutoplay(); }}
										></button>
									{/each}
								</div>
							{/if}
							<span class="run-carousel__counter muted">{currentRun + 1} / {runsToShow.length}</span>
						</div>
					{:else}
						<div class="run-slide__empty">
							<p class="muted">No verified runs yet.</p>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- News Sidebar -->
		<div class="home-sidebar">
			<div class="home-card home-card--news">
				<div class="news-header">
					<h2 class="home-card__title">{m.home_news()}</h2>
					{#if postsToShow.length > 1}
						<div class="news-header__nav">
							<button class="news-nav-btn" aria-label="Previous" onclick={() => { showSlide(currentSlide - 1); stopNewsAutoplay(); startNewsAutoplay(); }}>‹</button>
							<span class="news-nav-counter muted">{currentSlide + 1}/{postsToShow.length}</span>
							<button class="news-nav-btn" aria-label="Next" onclick={() => { showSlide(currentSlide + 1); stopNewsAutoplay(); startNewsAutoplay(); }}>›</button>
						</div>
					{/if}
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="news-scroll"
					onmouseenter={() => { newsHovered = true; stopNewsAutoplay(); }}
					onmouseleave={() => { newsHovered = false; if (postsToShow.length > 1) startNewsAutoplay(); }}
				>
					{#if postsToShow.length > 0}
						{#each postsToShow as post, i}
							{#if currentSlide === i}
								<a href={localizeHref(`/news/${post.slug}`)} class="news-article">
									<span class="news-article__date muted">{formatDate(post.date)}</span>
									<h3 class="news-article__title">{post.title}</h3>
									{#if post.tags?.length > 0}
										<div class="news-article__tags">
											{#each post.tags.slice(0, 3) as tag}
												<span class="news-article__tag">{tag}</span>
											{/each}
										</div>
									{/if}
									{#if post.excerpt}
										<p class="news-article__excerpt muted">{truncate(post.excerpt, EXCERPT_LIMIT)}</p>
									{/if}
									{#if post.content}
										<div class="news-article__body markdown-preview">
											{@html renderPreview(post.content, CONTENT_PREVIEW_LIMIT)}
										</div>
									{/if}
									<span class="news-article__read-more">{m.home_read_more()}</span>
								</a>
							{/if}
						{/each}
					{:else}
						<div class="news-article">
							<span class="news-article__date muted">{m.home_coming_soon()}</span>
							<p class="news-article__excerpt">{m.home_news_empty()}</p>
						</div>
					{/if}
				</div>
				{#if postsToShow.length > 0}
					<div class="news-footer">
						<a href={localizeHref('/news')} class="muted">{data.stats.postCount === 1 ? m.home_view_article({ count: data.stats.postCount }) : m.home_view_articles({ count: data.stats.postCount })}</a>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Quick Links -->
	<div class="resource-cards">
		<a href={localizeHref('/games')} class="resource-card card-lift--sm">
			<div class="resource-card__icon"><Gamepad2 size={28} /></div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_games()}</h2>
				<p class="resource-card__desc">{m.home_games_desc()}</p>
				<span class="resource-card__count">{data.stats.gameCount === 1 ? m.home_game_count({ count: data.stats.gameCount }) : m.home_games_count({ count: data.stats.gameCount })}</span>
			</div>
		</a>

		<a href={localizeHref('/runners')} class="resource-card card-lift--sm">
			<div class="resource-card__icon"><Trophy size={28} /></div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_runners()}</h2>
				<p class="resource-card__desc">{m.home_runners_desc()}</p>
				<span class="resource-card__count">{data.stats.runnerCount === 1 ? m.home_runner_count({ count: data.stats.runnerCount }) : m.home_runners_count({ count: data.stats.runnerCount })}</span>
			</div>
		</a>

		<a href={localizeHref('/rules')} class="resource-card card-lift--sm">
			<div class="resource-card__icon"><ScrollText size={28} /></div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_rules()}</h2>
				<p class="resource-card__desc">{m.home_rules_desc()}</p>
				<span class="resource-card__count">{m.home_learn_more()}</span>
			</div>
		</a>

		<a href={localizeHref('/glossary')} class="resource-card card-lift--sm">
			<div class="resource-card__icon"><BookOpen size={28} /></div>
			<div class="resource-card__content">
				<h2 class="resource-card__title">{m.home_glossary()}</h2>
				<p class="resource-card__desc">{m.home_glossary_desc()}</p>
				<span class="resource-card__count">{m.home_reference()}</span>
			</div>
		</a>
	</div>

</div>

<style>
	h1 { margin: 0 0 0.25rem; }
	.mb-6 { margin-bottom: 1.5rem; }
	.muted { opacity: 0.6; }

	/* Home Grid */
	.home-grid { display: grid; grid-template-columns: 1fr 320px; gap: 1.5rem; }
	.home-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; height: 100%; box-sizing: border-box; }
	.home-card__title { font-size: 1.1rem; margin: 0; }
	.home-sidebar { min-height: 0; overflow: hidden; }

	/* ══════════════════════════════════════════
	   Run Carousel (main area — single large run)
	   ══════════════════════════════════════════ */
	.run-carousel { position: relative; }
	.run-slide { display: none; }
	.run-slide.is-active { display: block; }

	.run-slide__link {
		display: block; text-decoration: none; border-radius: 10px; overflow: hidden;
	}
	.run-slide__thumb {
		width: 100%; aspect-ratio: 16 / 9;
		background: var(--bg); overflow: hidden;
	}
	.run-slide__thumb img {
		width: 100%; height: 100%; object-fit: cover; display: block;
		transition: transform 0.3s;
	}
	.run-slide__link:hover .run-slide__thumb img { transform: scale(1.03); }
	.run-slide__thumb-placeholder {
		width: 100%; height: 100%;
		display: flex; align-items: center; justify-content: center;
		color: var(--muted);
	}

	.run-slide__info {
		display: flex; flex-wrap: wrap; align-items: baseline;
		gap: 0.35rem 0.75rem;
		padding: 0.75rem 0.25rem 0;
	}
	.run-slide__runner {
		font-weight: 700; font-size: 1rem; color: var(--accent);
		text-decoration: none;
	}
	.run-slide__runner:hover { text-decoration: underline; }
	.run-slide__detail { font-size: 0.9rem; }
	.run-slide__game { font-weight: 500; }
	.run-slide__time {
		font-family: monospace; font-size: 0.95rem; color: var(--accent); font-weight: 600;
	}
	.run-slide__date { font-size: 0.8rem; }
	.run-slide__empty { padding: 2rem; text-align: center; }

	/* Arrows */
	.run-carousel__arrow {
		position: absolute; top: calc(50% - 30px); transform: translateY(-50%); z-index: 5;
		background: var(--surface); border: 1px solid var(--border); border-radius: 50%;
		width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
		font-size: 1.3rem; color: var(--muted); cursor: pointer; transition: all 0.15s;
		line-height: 1; padding: 0;
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
	}
	.run-carousel__arrow:hover { border-color: var(--accent); color: var(--accent); background: var(--bg); }
	.run-carousel__arrow--prev { left: 0.5rem; }
	.run-carousel__arrow--next { right: 0.5rem; }

	.run-carousel__footer {
		margin-top: 0.75rem;
		display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
	}
	.run-carousel__dots { display: flex; gap: 0.4rem; }
	.run-carousel__dot {
		width: 8px; height: 8px; border-radius: 50%;
		background: var(--border); border: none; cursor: pointer; padding: 0;
		transition: background 0.2s;
	}
	.run-carousel__dot.is-active { background: var(--accent); }
	.run-carousel__counter { font-size: 0.8rem; }

	/* ══════════════════════════════════════════
	   News Sidebar — fills full height, scrollable
	   ══════════════════════════════════════════ */
	.home-card--news {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		flex: 1;
		min-height: 0;
	}
	.news-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
		flex-shrink: 0;
	}
	.news-header__nav {
		display: flex; align-items: center; gap: 0.35rem;
	}
	.news-nav-btn {
		display: flex; align-items: center; justify-content: center;
		width: 24px; height: 24px; border-radius: 50%;
		background: var(--bg); border: 1px solid var(--border);
		color: var(--muted); cursor: pointer; font-size: 0.9rem;
		line-height: 1; padding: 0; transition: all 0.15s;
	}
	.news-nav-btn:hover { border-color: var(--accent); color: var(--accent); }
	.news-nav-counter { font-size: 0.75rem; min-width: 2rem; text-align: center; }

	.news-scroll {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}
	.news-scroll::-webkit-scrollbar { width: 4px; }
	.news-scroll::-webkit-scrollbar-track { background: transparent; }
	.news-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

	.news-article {
		display: block; text-decoration: none; color: inherit;
		padding: 0.5rem; margin: 0 -0.5rem; border-radius: 8px;
		transition: background 0.15s;
	}
	a.news-article:hover { background: rgba(255,255,255,0.03); }
	.news-article__date { font-size: 0.8rem; }
	.news-article__title { font-size: 1.05rem; margin: 0.25rem 0 0.35rem; color: var(--fg); }
	a.news-article:hover .news-article__title { color: var(--accent); }

	.news-article__tags { display: flex; gap: 0.3rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
	.news-article__tag {
		display: inline-block; padding: 0.1rem 0.4rem;
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 4px; font-size: 0.7rem; color: var(--muted);
	}

	.news-article__excerpt { font-size: 0.85rem; line-height: 1.5; margin: 0 0 0.5rem; color: var(--muted); }

	.news-article__body {
		font-size: 0.85rem; line-height: 1.5; margin: 0 0 0.75rem; color: var(--fg); opacity: 0.8;
	}
	.news-article__body :global(p) { margin: 0 0 0.5rem; }
	.news-article__body :global(h2),
	.news-article__body :global(h3) { font-size: 1rem; margin: 0.5rem 0 0.25rem; }
	.news-article__body :global(ul),
	.news-article__body :global(ol) { padding-left: 1.25rem; margin: 0 0 0.5rem; }
	.news-article__body :global(li) { margin-bottom: 0.15rem; }
	.news-article__body :global(strong) { font-weight: 600; }
	.news-article__body :global(a) { color: var(--accent); text-decoration: none; pointer-events: none; }
	.news-article__body :global(code) {
		background: rgba(255,255,255,0.06); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em;
	}
	.news-article__body :global(blockquote) {
		border-left: 2px solid var(--accent); margin: 0.25rem 0; padding: 0.25rem 0.75rem;
		color: var(--muted); font-size: 0.9em;
	}
	.news-article__body :global(img) { display: none; }

	.news-article__read-more { font-size: 0.85rem; color: var(--accent); font-weight: 500; }

	.news-footer {
		flex-shrink: 0;
		padding-top: 0.75rem;
		margin-top: 0.5rem;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
	}
	.news-footer a { text-decoration: none; }
	.news-footer a:hover { color: var(--accent) !important; }

	/* ── Resource Cards ── */
	.resource-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
	.resource-card {
		display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem;
		background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
		text-decoration: none; color: var(--fg); transition: border-color 0.2s, transform 0.2s;
	}
	.resource-card:hover { border-color: var(--accent); transform: translateY(-2px); }
	.resource-card__icon { flex-shrink: 0; color: var(--muted); }
	.resource-card__title { font-size: 1rem; margin: 0; }
	.resource-card__desc { font-size: 0.8rem; margin: 0.15rem 0; opacity: 0.6; }
	.resource-card__count { font-size: 0.75rem; color: var(--accent); font-weight: 600; }

	@media (max-width: 768px) {
		.home-grid { grid-template-columns: 1fr; }
		.resource-cards { grid-template-columns: repeat(2, 1fr); }
		.run-carousel__arrow { width: 30px; height: 30px; font-size: 1.1rem; }
		.run-carousel__arrow--prev { left: 0.25rem; }
		.run-carousel__arrow--next { right: 0.25rem; }
	}
	@media (max-width: 480px) {
		.resource-cards { grid-template-columns: 1fr; }
	}
</style>
