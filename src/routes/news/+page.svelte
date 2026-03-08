<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { renderMarkdown } from '$lib/utils/markdown';
	let { data } = $props();
</script>

<svelte:head><title>News | Challenge Run Community</title></svelte:head>

<div class="page-width">
	<h1>News</h1>
	<p class="muted">Announcements and updates from the Challenge Run Community.</p>

	{#each data.posts as post}
		<article class="card news-post">
			<a href={localizeHref(`/news/${post.slug}`)} class="news-post__link">
				<h2>{post.title}</h2>
			</a>
			<div class="news-post__meta">
				<time class="muted">{formatDate(post.date)}</time>
				{#if post.author}<span class="muted"> · {post.author}</span>{/if}
				{#if post.tags?.length > 0}
					<span class="news-post__tags">
						{#each post.tags as tag}
							<span class="tag">{tag}</span>
						{/each}
					</span>
				{/if}
			</div>
			{#if post.excerpt}
				<p class="news-post__excerpt">{post.excerpt}</p>
			{/if}
			<div class="news-post__body">
				{@html renderMarkdown(post.content)}
			</div>
		</article>
	{/each}

	{#if data.posts.length === 0}
		<p class="muted">No news yet.</p>
	{/if}
</div>

<style>
	.news-post { margin-bottom: 1.5rem; }
	.news-post h2 { margin: 0 0 0.25rem; }
	.news-post__link { text-decoration: none; color: var(--fg); }
	.news-post__link:hover h2 { color: var(--accent); }
	.news-post__meta { font-size: 0.85rem; margin-bottom: 0.5rem; }
	.news-post__excerpt { font-size: 0.9rem; color: var(--muted); margin: 0.25rem 0 0.75rem; font-style: italic; }
	.news-post__tags { margin-left: 0.5rem; }
	.tag {
		display: inline-block; padding: 0.1rem 0.4rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 4px; font-size: 0.75rem;
		color: var(--muted); margin-left: 0.25rem;
	}
	.news-post__body { margin-top: 0.75rem; }
</style>
