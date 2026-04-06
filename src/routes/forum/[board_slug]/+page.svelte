<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate, timeAgo } from '$lib/utils';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { Pin, Lock, MessageCircle, Plus, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import RetroToolbar from '$lib/components/forum/RetroToolbar.svelte';
	import ForumThreadTable from '$lib/components/forum/ForumThreadTable.svelte';
	import ForumThreadRow from '$lib/components/forum/ForumThreadRow.svelte';
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
			<h2>{board.name}</h2>
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
		<ForumThreadTable empty={threads.length === 0} emptyMessage="No threads yet. Be the first to start a discussion!">
			{#each threads as thread}
				<ForumThreadRow
					href={localizeHref(`/forum/${board.slug}/${thread.id}`)}
					title={thread.title}
					pinned={thread.is_pinned}
					locked={thread.is_locked}
					tags={[
						...(thread.is_pinned ? [{ label: 'Pinned' }] : []),
						...(thread.is_locked ? [{ label: 'Locked', variant: 'locked' }] : [])
					]}
					authorName={thread.author_name}
					authorTime={timeAgo(thread.created_at)}
					stat1={thread.reply_count}
					stat2={thread.view_count}
					lastPostName={thread.last_post_by_name}
					lastPostAvatar={thread.last_post_by_avatar}
					lastPostTime={thread.last_post_at ? timeAgo(thread.last_post_at) : ''}
				/>
			{/each}
		</ForumThreadTable>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="forum-pagination">
				{#if currentPage > 1}
					<a class="forum-pagination__btn" href={localizeHref(`/forum/${board.slug}?page=${currentPage - 1}`)}><ChevronLeft size={14} /> Previous</a>
				{/if}
				<span class="forum-pagination__info">Page {currentPage} of {totalPages} · {totalThreads} threads</span>
				{#if currentPage < totalPages}
					<a class="forum-pagination__btn" href={localizeHref(`/forum/${board.slug}?page=${currentPage + 1}`)}>Next <ChevronRight size={14} /></a>
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
	.thread-list-page__header h2 { margin: 0; font-size: 1.25rem; }

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
</style>
