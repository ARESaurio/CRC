<script lang="ts">
	/**
	 * ForumThreadRow — Shared thread/suggestion row for all forum tables.
	 *
	 * Usage:
	 *   <ForumThreadRow href="/forum/general/abc" title="My Thread" authorLine="by User · 3h ago"
	 *     stat1={5} stat2={42} lastPostName="User" lastPostTime="3h ago" />
	 *
	 * Override the icon with a snippet:
	 *   <ForumThreadRow ...>
	 *     {#snippet icon()}<Lightbulb size={16} />{/snippet}
	 *   </ForumThreadRow>
	 */
	import type { Snippet } from 'svelte';
	import { Pin, Lock, MessageCircle } from 'lucide-svelte';

	let {
		href,
		title,
		pinned = false,
		locked = false,
		tags = [],
		authorLine = '',
		stat1 = '',
		stat2 = '',
		lastPostName = '',
		lastPostAvatar = '',
		lastPostTime = '',
		icon
	}: {
		href: string;
		title: string;
		pinned?: boolean;
		locked?: boolean;
		tags?: Array<{ label: string; variant?: string }>;
		authorLine?: string;
		stat1?: string | number;
		stat2?: string | number;
		lastPostName?: string;
		lastPostAvatar?: string;
		lastPostTime?: string;
		icon?: Snippet;
	} = $props();
</script>

<a
	class="forum-thread-row"
	class:forum-thread-row--pinned={pinned}
	{href}
>
	<div class="forum-thread-row__info">
		<span class="forum-thread-row__icon">
			{#if icon}
				{@render icon()}
			{:else if pinned}
				<Pin size={16} />
			{:else if locked}
				<Lock size={16} />
			{:else}
				<MessageCircle size={16} />
			{/if}
		</span>
		<div class="forum-thread-row__text">
			<span class="forum-thread-row__title">
				{title}
				{#each tags as tag}
					<span class="forum-thread-row__tag forum-thread-row__tag--{tag.variant || 'default'}">{tag.label}</span>
				{/each}
			</span>
			{#if authorLine}
				<span class="forum-thread-row__author">{@html authorLine}</span>
			{/if}
		</div>
	</div>

	<span class="forum-thread-row__stat">{stat1}</span>
	<span class="forum-thread-row__stat">{stat2}</span>

	<div class="forum-thread-row__last">
		{#if lastPostName}
			<span class="forum-thread-row__last-meta">
				{#if lastPostAvatar}
					<img class="forum-thread-row__last-avatar" src={lastPostAvatar} alt="" />
				{/if}
				<strong>{lastPostName}</strong>
			</span>
		{/if}
		{#if lastPostTime}
			<span class="forum-thread-row__last-time">{lastPostTime}</span>
		{/if}
	</div>
</a>

<style>
	.forum-thread-row {
		display: grid;
		grid-template-columns: 1fr 70px 70px 160px;
		gap: 0.5rem;
		align-items: center;
		padding: 0.6rem 0.85rem;
		text-decoration: none;
		color: var(--fg);
		border-bottom: 1px solid rgba(255,255,255,0.04);
		transition: background 0.12s;
	}
	.forum-thread-row:last-child { border-bottom: none; }
	.forum-thread-row:hover { background: rgba(255,255,255,0.03); }
	.forum-thread-row--pinned { background: rgba(59,195,110,0.03); }

	.forum-thread-row__info { display: flex; align-items: flex-start; gap: 0.5rem; }
	.forum-thread-row__icon { flex-shrink: 0; color: var(--muted); padding-top: 0.15rem; }
	.forum-thread-row--pinned .forum-thread-row__icon { color: var(--accent); }
	.forum-thread-row__text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.forum-thread-row__title {
		font-weight: 600; font-size: 0.92rem;
		display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
	}
	.forum-thread-row__tag {
		font-size: 0.62rem; font-weight: 700; text-transform: uppercase;
		padding: 0.05rem 0.35rem; border-radius: 3px;
	}
	.forum-thread-row__tag--default { background: rgba(59,195,110,0.12); color: var(--accent); }
	.forum-thread-row__tag--locked { background: rgba(245,158,11,0.12); color: #f59e0b; }
	.forum-thread-row__tag--game { background: rgba(99,102,241,0.12); color: rgba(99,102,241,0.85); }
	.forum-thread-row__tag--cr { background: rgba(99,102,241,0.12); color: rgba(99,102,241,0.85); }
	.forum-thread-row__tag--section { background: var(--bg); border: 1px solid var(--border); color: var(--muted); }

	.forum-thread-row__author { font-size: 0.75rem; color: var(--muted); }
	.forum-thread-row__stat { text-align: center; font-size: 0.85rem; color: var(--text-muted); }

	.forum-thread-row__last { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.forum-thread-row__last-meta { font-size: 0.78rem; display: flex; align-items: center; gap: 0.25rem; }
	.forum-thread-row__last-avatar { width: 14px; height: 14px; border-radius: 50%; object-fit: cover; }
	.forum-thread-row__last-time { font-size: 0.72rem; color: var(--muted); }

	@media (max-width: 700px) {
		.forum-thread-row { grid-template-columns: 1fr; gap: 0.25rem; }
		.forum-thread-row__stat { display: none; }
		.forum-thread-row__last { flex-direction: row; gap: 0.5rem; font-size: 0.75rem; }
	}
</style>
