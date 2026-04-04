<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { onMount } from 'svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Trophy, Users, Gamepad2, Timer, ScrollText, BookOpen, Play, ExternalLink, MessageSquare, Pin, MessageCircle, ArrowRight } from 'lucide-svelte';

	let { data } = $props();

	// ── Forum Threads ──
	const forumThreads = $derived(data.forumThreads || []);

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		if (days < 30) return `${days}d ago`;
		return formatDate(dateStr);
	}

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
		<!-- ═══ Recently Verified Runs Carousel (main area) ═══ -->
		<div class="home-main">
			<div class="home-card">
				<h2 class="home-card__title">{m.home_recent_runs()}</h2>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="carousel"
					onmouseenter={() => { runHovered = true; stopRunAutoplay(); }}
					onmouseleave={() => { runHovered = false; if (runsToShow.length > 1) startRunAutoplay(); }}
				>
					{#if runsToShow.length > 0}
						<div class="carousel__body">
							{#if runsToShow.length > 1}
								<button class="carousel__arrow" aria-label="Previous run" onclick={() => { showRun(currentRun - 1); stopRunAutoplay(); startRunAutoplay(); }}>‹</button>
							{/if}

							<div class="carousel__content">
								{#each runsToShow as run, i}
									{@const thumb = getVideoThumbnail(run.video_url)}
									<div class="carousel__slide" class:is-active={currentRun === i}>
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
							</div>

							{#if runsToShow.length > 1}
								<button class="carousel__arrow" aria-label="Next run" onclick={() => { showRun(currentRun + 1); stopRunAutoplay(); startRunAutoplay(); }}>›</button>
							{/if}
						</div>

						<!-- Dots + counter (below content) -->
						<div class="carousel__footer">
							{#if runsToShow.length > 1}
								<div class="carousel__dots">
									{#each runsToShow as _, i}
										<button
											type="button"
											class="carousel__dot"
											class:is-active={currentRun === i}
											aria-label="Go to run {i + 1}"
											onclick={() => { showRun(i); stopRunAutoplay(); startRunAutoplay(); }}
										></button>
									{/each}
								</div>
							{/if}
							<span class="carousel__counter muted">{currentRun + 1} / {runsToShow.length}</span>
						</div>
					{:else}
						<div class="carousel__empty">
							<p class="muted">No verified runs yet.</p>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- ═══ News Sidebar ═══ -->
		<div class="home-sidebar">
			<div class="home-card home-card--news">
				<h2 class="home-card__title">{m.home_news()}</h2>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="carousel carousel--news"
					onmouseenter={() => { newsHovered = true; stopNewsAutoplay(); }}
					onmouseleave={() => { newsHovered = false; if (postsToShow.length > 1) startNewsAutoplay(); }}
				>
					{#if postsToShow.length > 0}
						<div class="carousel__body carousel__body--news">
							{#if postsToShow.length > 1}
								<button class="carousel__arrow" aria-label="Previous article" onclick={() => { showSlide(currentSlide - 1); stopNewsAutoplay(); startNewsAutoplay(); }}>‹</button>
							{/if}

							<div class="carousel__content carousel__content--news">
								{#each postsToShow as post, i}
									<div class="carousel__slide" class:is-active={currentSlide === i}>
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
									</div>
								{/each}
							</div>

							{#if postsToShow.length > 1}
								<button class="carousel__arrow" aria-label="Next article" onclick={() => { showSlide(currentSlide + 1); stopNewsAutoplay(); startNewsAutoplay(); }}>›</button>
							{/if}
						</div>

						<!-- Dots + counter (below content) -->
						<div class="carousel__footer">
							{#if postsToShow.length > 1}
								<div class="carousel__dots">
									{#each postsToShow as _, i}
										<button
											type="button"
											class="carousel__dot"
											class:is-active={currentSlide === i}
											aria-label="Go to article {i + 1}"
											onclick={() => { showSlide(i); stopNewsAutoplay(); startNewsAutoplay(); }}
										></button>
									{/each}
								</div>
							{/if}
							<span class="carousel__counter muted">{currentSlide + 1} / {postsToShow.length}</span>
						</div>
					{:else}
						<div class="carousel__empty">
							<span class="news-article__date muted">{m.home_coming_soon()}</span>
							<p class="news-article__excerpt">{m.home_news_empty()}</p>
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

	<!-- Forum Preview -->
	{#if forumThreads.length > 0}
		<div class="home-forum">
			<div class="home-forum__header">
				<h2 class="home-forum__title"><MessageSquare size={20} /> Forum Activity</h2>
				<a class="home-forum__link" href={localizeHref('/forum')}>View Forum <ArrowRight size={14} /></a>
			</div>
			<div class="home-forum__list">
				{#each forumThreads as thread}
					<a
						class="home-forum__row"
						href={thread.game_id
							? localizeHref(`/games/${thread.game_id}/forum/thread/${thread.id}`)
							: localizeHref(`/forum/${thread.board_slug}/${thread.id}`)}
					>
						<span class="home-forum__icon">
							{#if thread.is_pinned}<Pin size={14} />
							{:else}<MessageCircle size={14} />{/if}
						</span>
						<div class="home-forum__text">
							<span class="home-forum__thread-title">{thread.title}</span>
							<span class="home-forum__meta">
								{thread.author_name}
								{#if thread.board_name} · {thread.board_name}{/if}
								· {thread.reply_count} repl{thread.reply_count !== 1 ? 'ies' : 'y'}
							</span>
						</div>
						<span class="home-forum__time">{timeAgo(thread.last_post_at)}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}

</div>

<style>
	h1 { margin: 0 0 0.25rem; }
	.mb-6 { margin-bottom: 1.5rem; }
	.muted { opacity: 0.6; }

	/* Home Grid */
	.home-grid { display: grid; grid-template-columns: 1fr 380px; gap: 1.5rem; }
	.home-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; height: 100%; box-sizing: border-box; }
	.home-card__title { font-size: 1.1rem; margin: 0 0 0.75rem; }
	.home-sidebar { position: relative; min-width: 0; }

	/* ══════════════════════════════════════════
	   Shared Carousel Styles (runs + news)
	   ══════════════════════════════════════════ */
	.carousel__slide { display: none; }
	.carousel__slide.is-active { display: block; }
	.carousel__empty { padding: 2rem; text-align: center; }

	/* Body: arrows flanking content in a row */
	.carousel__body {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.carousel__content { flex: 1; min-width: 0; }

	/* Arrows: static flex items beside the content */
	.carousel__arrow {
		flex-shrink: 0;
		background: var(--surface); border: 1px solid var(--border); border-radius: 50%;
		width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
		font-size: 1.3rem; color: var(--muted); cursor: pointer; transition: all 0.15s;
		line-height: 1; padding: 0;
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		align-self: center;
	}
	.carousel__arrow:hover { border-color: var(--accent); color: var(--accent); background: var(--bg); }

	/* News body: arrows align to top of the scrollable area */
	.carousel__body--news { align-items: flex-start; padding-top: 0.25rem; }

	/* News content area: scrollable, fills available space */
	.carousel__content--news {
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}
	.carousel__content--news::-webkit-scrollbar { width: 4px; }
	.carousel__content--news::-webkit-scrollbar-track { background: transparent; }
	.carousel__content--news::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

	/* Footer: dots + counter */
	.carousel__footer {
		margin-top: 0.75rem;
		display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
		flex-shrink: 0;
	}
	.carousel__dots { display: flex; gap: 0.4rem; }
	.carousel__dot {
		width: 8px; height: 8px; border-radius: 50%;
		background: var(--border); border: none; cursor: pointer; padding: 0;
		transition: background 0.2s;
	}
	.carousel__dot.is-active { background: var(--accent); }
	.carousel__counter { font-size: 0.8rem; }

	/* ══════════════════════════════════════════
	   Run Slide (main area — single large run)
	   ══════════════════════════════════════════ */
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

	/* ══════════════════════════════════════════
	   News Sidebar — fills full height
	   ══════════════════════════════════════════ */
	.home-card--news {
		position: absolute;
		top: 0; left: 0; right: 0; bottom: 0;
		display: flex; flex-direction: column; overflow: hidden;
	}

	/* News carousel fills available space between title and footer */
	.carousel--news {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.news-article {
		display: block; text-decoration: none; color: inherit;
		padding: 0.5rem; margin: 0 -0.5rem; border-radius: 8px;
		transition: background 0.15s;
	}
	a.news-article:hover { background: rgba(255,255,255,0.03); }
	.news-article__date { font-size: 0.8rem; }
	.news-article__title { font-size: 1.05rem; margin: 0.25rem 0 0.35rem; color: var(--fg); overflow-wrap: break-word; }
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
		overflow-wrap: break-word; word-break: break-word;
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
		word-break: break-all;
	}
	.news-article__body :global(blockquote) {
		border-left: 2px solid var(--accent); margin: 0.25rem 0; padding: 0.25rem 0.75rem;
		color: var(--muted); font-size: 0.9em;
	}
	.news-article__body :global(img) { display: none; }

	.news-article__read-more { font-size: 0.85rem; color: var(--accent); font-weight: 500; }

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

	@media (max-width: 900px) {
		.home-grid { grid-template-columns: 1fr; }
		.home-sidebar { position: static; }
		.home-card--news { position: static; height: 400px; }
		.resource-cards { grid-template-columns: repeat(2, 1fr); }
		.carousel__arrow { width: 30px; height: 30px; font-size: 1.1rem; }
	}
	@media (max-width: 480px) {
		.resource-cards { grid-template-columns: 1fr; }
	}

	/* ── Forum Preview ─────────────────────────────────────── */
	.home-forum { margin-top: 1.5rem; }
	.home-forum__header {
		display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;
	}
	.home-forum__title {
		font-size: 1.1rem; margin: 0; display: flex; align-items: center; gap: 0.4rem;
	}
	.home-forum__link {
		display: inline-flex; align-items: center; gap: 0.25rem;
		color: var(--accent); text-decoration: none; font-size: 0.85rem; font-weight: 500;
	}
	.home-forum__link:hover { text-decoration: underline; }
	.home-forum__list {
		border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;
	}
	.home-forum__row {
		display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.85rem;
		text-decoration: none; color: var(--fg);
		border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s;
	}
	.home-forum__row:last-child { border-bottom: none; }
	.home-forum__row:hover { background: rgba(255,255,255,0.03); }
	.home-forum__icon { flex-shrink: 0; color: var(--muted); }
	.home-forum__text {
		flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem;
	}
	.home-forum__thread-title {
		font-weight: 600; font-size: 0.88rem;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.home-forum__meta { font-size: 0.72rem; color: var(--muted); }
	.home-forum__time { font-size: 0.72rem; color: var(--muted); flex-shrink: 0; white-space: nowrap; }
</style>
