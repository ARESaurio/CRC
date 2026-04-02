<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import RetroToolbar from '$lib/components/forum/RetroToolbar.svelte';
	import type { ForumThread } from '$lib/types';

	let { data } = $props();
	const board = $derived(data.board);
	const threads: ForumThread[] = $derived(data.threads);
	const currentPage = $derived(data.page);
	const totalPages = $derived(data.totalPages);
	const totalThreads = $derived(data.totalThreads);

	// ── New thread form ───────────────────────────────────────────────
	let showNewThread = $state(false);
	let newTitle = $state('');
	let newBody = $state('');
	let submitting = $state(false);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	// ── Profile check ─────────────────────────────────────────────────
	let hasApprovedProfile = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('status').eq('user_id', u.id).maybeSingle()
				.then(({ data: p }) => { hasApprovedProfile = p?.status === 'approved'; });
		} else { hasApprovedProfile = false; }
	});

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	async function createThread() {
		if (!$user || !newTitle.trim() || !newBody.trim()) return;
		submitting = true;

		try {
			const session = (await supabase.auth.getSession()).data.session;
			const res = await fetch(`${PUBLIC_WORKER_URL}/forum/create-thread`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${session?.access_token}`,
				},
				body: JSON.stringify({
					board_id: board.id,
					title: newTitle.trim(),
					body: newBody.trim(),
				}),
			});
			const result = await res.json();
			if (result.ok && result.thread_id) {
				goto(localizeHref(`/forum/${board.slug}/${result.thread_id}`));
			} else {
				showToast('error', result.error || 'Failed to create thread');
			}
		} catch {
			showToast('error', 'Network error');
		}
		submitting = false;
	}

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
</script>

<svelte:head>
	<title>{board.name} — Forum | CRC</title>
</svelte:head>

<div class="page-width">
	<div class="thread-list-page">
		{#if toast}
			<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
		{/if}

		<!-- Breadcrumb -->
		<nav class="forum-breadcrumb">
			<a href={localizeHref('/forum')}>Forum</a>
			<span class="forum-breadcrumb__sep">›</span>
			<span>{board.name}</span>
		</nav>

		<!-- Header -->
		<div class="thread-list-page__header">
			<h1>{board.name}</h1>
			{#if $user && hasApprovedProfile}
				<button class="btn btn--accent" onclick={() => { showNewThread = !showNewThread; }}>
					{showNewThread ? 'Cancel' : '+ New Thread'}
				</button>
			{:else if $user && !hasApprovedProfile}
				<span class="muted" style="font-size: 0.85rem;">Approved profile required to post</span>
			{:else}
				<span class="muted" style="font-size: 0.85rem;">Sign in to post</span>
			{/if}
		</div>

		{#if board.description}
			<p class="muted" style="margin: -0.5rem 0 1rem; font-size: 0.88rem;">{board.description}</p>
		{/if}

		<!-- New thread form -->
		{#if showNewThread}
			<div class="new-thread-form">
				<input
					class="new-thread-form__title"
					type="text"
					bind:value={newTitle}
					placeholder="Thread title"
					maxlength="200"
				/>
				<RetroToolbar bind:textarea={textareaEl} />
				<textarea
					class="new-thread-form__body"
					bind:this={textareaEl}
					bind:value={newBody}
					rows="6"
					placeholder="Write your post... (Markdown supported)"
					maxlength="10000"
				></textarea>
				<div class="new-thread-form__actions">
					<button
						class="btn btn--accent"
						onclick={createThread}
						disabled={submitting || !newTitle.trim() || !newBody.trim()}
					>
						{submitting ? 'Posting...' : 'Post Thread'}
					</button>
				</div>
			</div>
		{/if}

		<!-- Thread table -->
		<div class="thread-table">
			<div class="thread-table__head">
				<span class="thread-table__col thread-table__col--topic">Topic</span>
				<span class="thread-table__col thread-table__col--stat">Replies</span>
				<span class="thread-table__col thread-table__col--stat">Views</span>
				<span class="thread-table__col thread-table__col--last">Last Post</span>
			</div>

			{#each threads as thread}
				<a class="thread-row" class:thread-row--pinned={thread.is_pinned} class:thread-row--locked={thread.is_locked} href={localizeHref(`/forum/${board.slug}/${thread.id}`)}>
					<div class="thread-row__info">
						<span class="thread-row__icon">
							{#if thread.is_pinned}📌
							{:else if thread.is_locked}🔒
							{:else}💬{/if}
						</span>
						<div class="thread-row__text">
							<span class="thread-row__title">
								{thread.title}
								{#if thread.is_pinned}<span class="thread-row__tag">Pinned</span>{/if}
								{#if thread.is_locked}<span class="thread-row__tag thread-row__tag--locked">Locked</span>{/if}
							</span>
							<span class="thread-row__author">
								by <strong>{thread.author_name}</strong> · {timeAgo(thread.created_at)}
							</span>
						</div>
					</div>

					<span class="thread-row__stat">{thread.reply_count}</span>
					<span class="thread-row__stat">{thread.view_count}</span>

					<div class="thread-row__last">
						{#if thread.last_post_by_name}
							<span class="thread-row__last-meta">
								{#if thread.last_post_by_avatar}
									<img class="thread-row__last-avatar" src={thread.last_post_by_avatar} alt="" />
								{/if}
								<strong>{thread.last_post_by_name}</strong>
							</span>
							<span class="thread-row__last-time">{timeAgo(thread.last_post_at)}</span>
						{/if}
					</div>
				</a>
			{:else}
				<div class="thread-table__empty">
					<p class="muted">No threads yet. Be the first to start a discussion!</p>
				</div>
			{/each}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="forum-pagination">
				{#if currentPage > 1}
					<a class="forum-pagination__btn" href={localizeHref(`/forum/${board.slug}?page=${currentPage - 1}`)}>← Previous</a>
				{/if}
				<span class="forum-pagination__info">Page {currentPage} of {totalPages} · {totalThreads} threads</span>
				{#if currentPage < totalPages}
					<a class="forum-pagination__btn" href={localizeHref(`/forum/${board.slug}?page=${currentPage + 1}`)}>Next →</a>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.thread-list-page { max-width: 960px; margin: 0 auto; }

	/* ── Breadcrumb ────────────────────────────────────────── */
	.forum-breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
		color: var(--muted);
		margin-bottom: 0.75rem;
	}
	.forum-breadcrumb a { color: var(--accent); text-decoration: none; }
	.forum-breadcrumb a:hover { text-decoration: underline; }
	.forum-breadcrumb__sep { opacity: 0.5; }

	/* ── Header ────────────────────────────────────────────── */
	.thread-list-page__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.thread-list-page__header h1 { margin: 0; font-size: 1.25rem; }

	/* ── New thread form ───────────────────────────────────── */
	.new-thread-form {
		margin-bottom: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 1rem;
	}
	.new-thread-form__title {
		width: 100%;
		padding: 0.5rem 0.65rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--fg);
		font-family: inherit;
		font-size: 0.95rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		box-sizing: border-box;
	}
	.new-thread-form__title:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__body {
		width: 100%;
		padding: 0.5rem 0.65rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 0 0 var(--radius-sm) var(--radius-sm);
		color: var(--fg);
		font-family: inherit;
		font-size: 0.88rem;
		resize: vertical;
		box-sizing: border-box;
	}
	.new-thread-form__body:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__actions { margin-top: 0.75rem; }

	/* ── Thread table ──────────────────────────────────────── */
	.thread-table {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.thread-table__head {
		display: grid;
		grid-template-columns: 1fr 70px 70px 160px;
		gap: 0.5rem;
		padding: 0.5rem 0.85rem;
		background: linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
		border-bottom: 1px solid var(--border);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.thread-table__col--stat { text-align: center; }
	.thread-table__empty { padding: 2rem; text-align: center; }

	/* ── Thread row ────────────────────────────────────────── */
	.thread-row {
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
	.thread-row:last-child { border-bottom: none; }
	.thread-row:hover { background: rgba(255,255,255,0.03); }
	.thread-row--pinned { background: rgba(59,195,110,0.03); }

	.thread-row__info { display: flex; align-items: flex-start; gap: 0.5rem; }
	.thread-row__icon { font-size: 1rem; flex-shrink: 0; padding-top: 0.1rem; }
	.thread-row__text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.thread-row__title {
		font-weight: 600;
		font-size: 0.92rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.thread-row__tag {
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0.05rem 0.35rem;
		border-radius: 3px;
		background: rgba(59,195,110,0.12);
		color: var(--accent);
	}
	.thread-row__tag--locked { background: rgba(245,158,11,0.12); color: #f59e0b; }
	.thread-row__author { font-size: 0.75rem; color: var(--muted); }
	.thread-row__stat { text-align: center; font-size: 0.85rem; color: var(--text-muted); }

	.thread-row__last { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.thread-row__last-meta {
		font-size: 0.78rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.thread-row__last-avatar { width: 14px; height: 14px; border-radius: 50%; object-fit: cover; }
	.thread-row__last-time { font-size: 0.72rem; color: var(--muted); }

	/* ── Pagination ────────────────────────────────────────── */
	.forum-pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 0;
	}
	.forum-pagination__btn {
		color: var(--accent);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 500;
	}
	.forum-pagination__btn:hover { text-decoration: underline; }
	.forum-pagination__info { font-size: 0.82rem; color: var(--muted); }

	.muted { color: var(--muted); }

	@media (max-width: 700px) {
		.thread-table__head { display: none; }
		.thread-row {
			grid-template-columns: 1fr;
			gap: 0.25rem;
		}
		.thread-row__stat { display: none; }
		.thread-row__last { flex-direction: row; gap: 0.5rem; font-size: 0.75rem; }
	}
</style>
