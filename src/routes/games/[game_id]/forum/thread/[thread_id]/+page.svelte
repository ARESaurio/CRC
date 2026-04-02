<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import ForumPostCard from '$lib/components/forum/ForumPostCard.svelte';
	import RetroToolbar from '$lib/components/forum/RetroToolbar.svelte';
	import type { ForumPost } from '$lib/types';

	let { data } = $props();
	const game = $derived(data.game);
	const thread = $derived(data.thread);
	const posts: ForumPost[] = $derived(data.posts);
	const currentPage = $derived(data.page);
	const totalPages = $derived(data.totalPages);
	const totalPosts = $derived(data.totalPosts);
	const isAdmin = $derived(data.isAdmin);
	const isMod = $derived(data.isMod);
	const userId = $derived(data.userId);

	let replyBody = $state('');
	let replying = $state(false);
	let replyTextarea = $state<HTMLTextAreaElement | null>(null);
	let editingPostId = $state<string | null>(null);
	let editBody = $state('');
	let editSubmitting = $state(false);
	let editTextarea = $state<HTMLTextAreaElement | null>(null);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	let hasApprovedProfile = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('status').eq('user_id', u.id).maybeSingle()
				.then(({ data: p }) => { hasApprovedProfile = p?.status === 'approved'; });
		} else { hasApprovedProfile = false; }
	});

	// View count
	let viewTracked = $state(false);
	$effect(() => {
		if (viewTracked || !thread?.id) return;
		viewTracked = true;
		fetch(`${PUBLIC_WORKER_URL}/forum/view-thread`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ thread_id: thread.id }),
		}).catch(() => {});
	});

	async function getToken(): Promise<string | null> {
		return (await supabase.auth.getSession()).data.session?.access_token ?? null;
	}

	const threadUrl = $derived(`/games/${game.game_id}/forum/thread/${thread.id}`);

	async function submitReply() {
		if (!$user || !replyBody.trim()) return;
		replying = true;
		try {
			const token = await getToken();
			const res = await fetch(`${PUBLIC_WORKER_URL}/forum/create-post`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ thread_id: thread.id, body: replyBody.trim() }),
			});
			const result = await res.json();
			if (result.ok) {
				replyBody = '';
				const newTotal = totalPosts + 1;
				const lastPage = Math.ceil(newTotal / 15);
				if (lastPage !== currentPage) {
					goto(localizeHref(`${threadUrl}?page=${lastPage}`));
				} else {
					await invalidateAll();
				}
			} else {
				showToast('error', result.error || 'Failed to post reply');
			}
		} catch { showToast('error', 'Network error'); }
		replying = false;
	}

	function startEdit(postId: string) {
		const post = posts.find(p => p.id === postId);
		if (!post) return;
		editingPostId = postId;
		editBody = post.body;
	}

	async function submitEdit() {
		if (!editingPostId || !editBody.trim()) return;
		editSubmitting = true;
		try {
			const token = await getToken();
			const res = await fetch(`${PUBLIC_WORKER_URL}/forum/edit-post`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ post_id: editingPostId, body: editBody.trim() }),
			});
			const result = await res.json();
			if (result.ok) { editingPostId = null; editBody = ''; await invalidateAll(); showToast('success', 'Post updated'); }
			else { showToast('error', result.error || 'Failed to edit'); }
		} catch { showToast('error', 'Network error'); }
		editSubmitting = false;
	}

	async function deletePost(postId: string) {
		if (!confirm('Delete this post? This cannot be undone.')) return;
		try {
			const token = await getToken();
			const res = await fetch(`${PUBLIC_WORKER_URL}/forum/delete-post`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ post_id: postId }),
			});
			const result = await res.json();
			if (result.ok) {
				const isOP = posts.length > 0 && posts[0].id === postId;
				if (isOP) { goto(localizeHref(`/games/${game.game_id}/forum`)); }
				else { await invalidateAll(); showToast('success', 'Post deleted'); }
			} else { showToast('error', result.error || 'Failed to delete'); }
		} catch { showToast('error', 'Network error'); }
	}

	async function modAction(action: string) {
		if (!confirm(`${action === 'delete' ? 'Delete this entire thread' : action + ' this thread'}?`)) return;
		try {
			const token = await getToken();
			const res = await fetch(`${PUBLIC_WORKER_URL}/forum/mod-thread`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ thread_id: thread.id, action }),
			});
			const result = await res.json();
			if (result.ok) {
				if (action === 'delete') { goto(localizeHref(`/games/${game.game_id}/forum`)); }
				else { await invalidateAll(); showToast('success', `Thread ${action}ed`); }
			} else { showToast('error', result.error || 'Action failed'); }
		} catch { showToast('error', 'Network error'); }
	}
</script>

<svelte:head>
	<title>{thread.title} — {game.game_name} Forum | CRC</title>
</svelte:head>

<div class="thread-view">
	{#if toast}
		<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- Breadcrumb -->
	<nav class="forum-breadcrumb">
		<a href={localizeHref(`/games/${game.game_id}/forum`)}>← Back to Forum</a>
	</nav>

	<!-- Thread header -->
	<div class="thread-view__header">
		<h1>
			{#if thread.is_pinned}📌{/if}
			{#if thread.is_locked}🔒{/if}
			{thread.title}
		</h1>

		{#if isAdmin || isMod}
			<div class="thread-view__mod">
				<button class="mod-btn" onclick={() => modAction(thread.is_pinned ? 'unpin' : 'pin')}>{thread.is_pinned ? 'Unpin' : 'Pin'}</button>
				<button class="mod-btn" onclick={() => modAction(thread.is_locked ? 'unlock' : 'lock')}>{thread.is_locked ? 'Unlock' : 'Lock'}</button>
				<button class="mod-btn mod-btn--danger" onclick={() => modAction('delete')}>Delete</button>
			</div>
		{/if}
	</div>

	<!-- Pagination top -->
	{#if totalPages > 1}
		<div class="forum-pagination">
			{#if currentPage > 1}<a class="forum-pagination__btn" href={localizeHref(`${threadUrl}?page=${currentPage - 1}`)}>← Prev</a>{/if}
			<span class="forum-pagination__info">Page {currentPage} of {totalPages}</span>
			{#if currentPage < totalPages}<a class="forum-pagination__btn" href={localizeHref(`${threadUrl}?page=${currentPage + 1}`)}>Next →</a>{/if}
		</div>
	{/if}

	<!-- Posts -->
	<div class="thread-view__posts">
		{#each posts as post, i}
			{#if editingPostId === post.id}
				<div class="edit-form">
					<div class="edit-form__label">Editing post #{(currentPage - 1) * 15 + i + 1}</div>
					<RetroToolbar bind:textarea={editTextarea} />
					<textarea class="edit-form__body" bind:this={editTextarea} bind:value={editBody} rows="6" maxlength="10000"></textarea>
					<div class="edit-form__actions">
						<button class="btn btn--accent" onclick={submitEdit} disabled={editSubmitting || !editBody.trim()}>{editSubmitting ? 'Saving...' : 'Save Edit'}</button>
						<button class="btn btn--reset" onclick={() => { editingPostId = null; }}>Cancel</button>
					</div>
				</div>
			{:else}
				<ForumPostCard
					{post}
					index={(currentPage - 1) * 15 + i}
					isOP={i === 0 && currentPage === 1}
					currentUserId={userId}
					isAdmin={isAdmin || isMod}
					onEdit={startEdit}
					onDelete={deletePost}
				/>
			{/if}
		{/each}
	</div>

	<!-- Pagination bottom -->
	{#if totalPages > 1}
		<div class="forum-pagination">
			{#if currentPage > 1}<a class="forum-pagination__btn" href={localizeHref(`${threadUrl}?page=${currentPage - 1}`)}>← Prev</a>{/if}
			<span class="forum-pagination__info">Page {currentPage} of {totalPages} · {totalPosts} posts</span>
			{#if currentPage < totalPages}<a class="forum-pagination__btn" href={localizeHref(`${threadUrl}?page=${currentPage + 1}`)}>Next →</a>{/if}
		</div>
	{/if}

	<!-- Reply -->
	{#if !thread.is_locked}
		<div class="reply-section">
			<h3 class="reply-section__title">Post a Reply</h3>
			{#if $user && hasApprovedProfile}
				<RetroToolbar bind:textarea={replyTextarea} />
				<textarea class="reply-section__body" bind:this={replyTextarea} bind:value={replyBody} rows="5" placeholder="Write your reply... (Markdown supported)" maxlength="10000"></textarea>
				<div class="reply-section__actions">
					<button class="btn btn--accent" onclick={submitReply} disabled={replying || !replyBody.trim()}>{replying ? 'Posting...' : 'Submit Reply'}</button>
				</div>
			{:else if $user}
				<p class="muted">You need an approved profile to reply.</p>
			{:else}
				<p class="muted">Sign in to reply to this thread.</p>
			{/if}
		</div>
	{:else}
		<div class="locked-notice">🔒 This thread is locked.</div>
	{/if}
</div>

<style>
	.thread-view { max-width: 960px; margin: 0 auto; }

	.forum-breadcrumb { font-size: 0.82rem; margin-bottom: 0.75rem; }
	.forum-breadcrumb a { color: var(--accent); text-decoration: none; }
	.forum-breadcrumb a:hover { text-decoration: underline; }

	.thread-view__header { margin-bottom: 0.75rem; }
	.thread-view__header h1 { margin: 0; font-size: 1.2rem; line-height: 1.3; word-break: break-word; }
	.thread-view__mod { display: flex; gap: 0.35rem; margin-top: 0.5rem; flex-wrap: wrap; }
	.mod-btn {
		padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border);
		border-radius: 4px; color: var(--muted); font-size: 0.75rem; font-family: inherit; cursor: pointer;
	}
	.mod-btn:hover { background: rgba(255,255,255,0.08); color: var(--fg); }
	.mod-btn--danger:hover { color: #ef4444; border-color: rgba(239,68,68,0.3); }

	.thread-view__posts { margin-bottom: 1rem; }

	.edit-form { border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 1rem; background: var(--surface); }
	.edit-form__label { font-size: 0.82rem; font-weight: 600; color: var(--accent); margin-bottom: 0.5rem; }
	.edit-form__body {
		width: 100%; padding: 0.5rem 0.65rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 0 0 var(--radius-sm) var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.88rem; resize: vertical; box-sizing: border-box;
	}
	.edit-form__body:focus { outline: none; border-color: var(--accent); }
	.edit-form__actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }

	.reply-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; margin-top: 1rem; }
	.reply-section__title { margin: 0 0 0.65rem; font-size: 1rem; }
	.reply-section__body {
		width: 100%; padding: 0.5rem 0.65rem; background: var(--bg); border: 1px solid var(--border);
		border-radius: 0 0 var(--radius-sm) var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.88rem; resize: vertical; box-sizing: border-box;
	}
	.reply-section__body:focus { outline: none; border-color: var(--accent); }
	.reply-section__actions { margin-top: 0.65rem; }

	.locked-notice {
		margin-top: 1rem; padding: 0.85rem 1rem; background: rgba(245,158,11,0.06);
		border: 1px solid rgba(245,158,11,0.2); border-radius: var(--radius-md); font-size: 0.9rem; color: #f59e0b; text-align: center;
	}

	.forum-pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; padding: 0.5rem 0; }
	.forum-pagination__btn { color: var(--accent); text-decoration: none; font-size: 0.85rem; }
	.forum-pagination__btn:hover { text-decoration: underline; }
	.forum-pagination__info { font-size: 0.82rem; color: var(--muted); }

	.muted { color: var(--muted); }
</style>
