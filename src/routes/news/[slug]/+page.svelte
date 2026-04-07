<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const post = $derived(data.post);
	const prevPost = $derived(data.prevPost);
	const nextPost = $derived(data.nextPost);
</script>

<svelte:head>
	<title>{post.title} | Challenge Run Community</title>
	{#if post.description}
		<meta name="description" content={post.description} />
	{/if}
</svelte:head>

<div class="page-width">
	<p class="back"><ArrowLeft size={14} /> <a href={localizeHref('/news')}>{m.news_all()}</a></p>

	<!-- Top Navigation -->
	<nav class="post-nav post-nav--top">
		<div class="post-nav__prev">
			{#if prevPost}
				<a href={localizeHref(`/news/${prevPost.slug}`)} class="post-nav__link">
					<span class="post-nav__label">{m.news_prev()}</span>
					<span class="post-nav__title">{prevPost.title}</span>
				</a>
			{/if}
		</div>
		<div class="post-nav__next">
			{#if nextPost}
				<a href={localizeHref(`/news/${nextPost.slug}`)} class="post-nav__link post-nav__link--next">
					<span class="post-nav__label">{m.news_next()} →</span>
					<span class="post-nav__title">{nextPost.title}</span>
				</a>
			{/if}
		</div>
	</nav>

	<article class="post">
		<header class="post__header">
			<h2>{post.title}</h2>
			<div class="post__meta muted">
				<time>{formatDate(post.date)}</time>
				{#if post.author}
					<span>· {post.author}</span>
				{/if}
			</div>
			{#if post.tags && post.tags.length > 0}
				<div class="post__tags">
					{#each post.tags as tag}
						<span class="tag">{tag}</span>
					{/each}
				</div>
			{/if}
		</header>

		<div class="post__body markdown-body">
			{@html renderMarkdown(post.content)}
		</div>
	</article>

	<!-- Post Navigation -->
	<nav class="post-nav">
		<div class="post-nav__prev">
			{#if prevPost}
				<a href={localizeHref(`/news/${prevPost.slug}`)} class="post-nav__link">
					<span class="post-nav__label">{m.news_prev()}</span>
					<span class="post-nav__title">{prevPost.title}</span>
				</a>
			{/if}
		</div>
		<div class="post-nav__center">
			<a href={localizeHref('/news')} class="post-nav__all">{m.news_all()}</a>
		</div>
		<div class="post-nav__next">
			{#if nextPost}
				<a href={localizeHref(`/news/${nextPost.slug}`)} class="post-nav__link post-nav__link--next">
					<span class="post-nav__label">{m.news_next()} →</span>
					<span class="post-nav__title">{nextPost.title}</span>
				</a>
			{/if}
		</div>
	</nav>
</div>

<style>
	.back { margin: 1rem 0 0.5rem; }
	.back a { color: var(--muted); text-decoration: none; }
	.back a:hover { color: var(--fg); }

	.post { max-width: 720px; margin: 0 auto; }
	.post__header { margin-bottom: 2rem; }
	.post__header h2 { margin: 0 0 0.5rem; font-size: 2rem; }
	.post__meta { font-size: 0.9rem; }
	.post__tags { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; }

	.tag {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 4px;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.post__body :global(h2) { margin: 1.5rem 0 0.75rem; font-size: 1.35rem; }
	.post__body :global(h3) { margin: 1.25rem 0 0.5rem; font-size: 1.1rem; }
	.post__body :global(p) { margin: 0 0 1rem; line-height: 1.7; }
	.post__body :global(ul), .post__body :global(ol) { padding-left: 1.5rem; margin: 0 0 1rem; }
	.post__body :global(li) { margin-bottom: 0.35rem; line-height: 1.6; }
	.post__body :global(a) { color: var(--accent); text-decoration: none; }
	.post__body :global(a:hover) { text-decoration: underline; }
	.post__body :global(blockquote) {
		border-left: 3px solid var(--accent);
		margin: 1rem 0;
		padding: 0.5rem 1rem;
		color: var(--muted);
	}
	.post__body :global(code) {
		background: var(--surface);
		padding: 0.15rem 0.35rem;
		border-radius: 3px;
		font-size: 0.9em;
	}
	.post__body :global(img) { max-width: 100%; border-radius: 8px; }

	/* Post Navigation */
	.post-nav {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 1rem;
		align-items: start;
		max-width: 720px;
		margin: 2.5rem auto 0;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}
	.post-nav--top {
		grid-template-columns: 1fr 1fr;
		margin: 0 auto 1.5rem;
		padding: 0 0 1rem;
		border-top: none;
		border-bottom: 1px solid var(--border);
	}
	.post-nav__prev { text-align: left; }
	.post-nav__center { text-align: center; align-self: center; }
	.post-nav__next { text-align: right; }
	.post-nav__link {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-decoration: none;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		transition: background 0.15s;
	}
	.post-nav__link:hover { background: var(--surface); }
	.post-nav__link--next { align-items: flex-end; }
	.post-nav__label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.post-nav__title {
		font-size: 0.9rem;
		color: var(--accent);
		font-weight: 500;
		line-height: 1.4;
	}
	.post-nav__all {
		font-size: 0.85rem;
		color: var(--muted);
		text-decoration: none;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		transition: border-color 0.15s, color 0.15s;
	}
	.post-nav__all:hover { border-color: var(--accent); color: var(--accent); }

	@media (max-width: 600px) {
		.post-nav {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: auto auto;
		}
		.post-nav__center { grid-column: 1 / -1; grid-row: 1; margin-bottom: 0.5rem; }
		.post-nav--top { grid-template-columns: 1fr 1fr; }
	}
</style>
