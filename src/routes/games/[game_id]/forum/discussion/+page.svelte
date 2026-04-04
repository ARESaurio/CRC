<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { timeAgo } from '$lib/utils';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { MessageSquare, Search, ChevronLeft } from 'lucide-svelte';
	import ForumThreadTable from '$lib/components/forum/ForumThreadTable.svelte';
	import ForumThreadRow from '$lib/components/forum/ForumThreadRow.svelte';
	import RetroToolbar from '$lib/components/forum/RetroToolbar.svelte';
	import * as Button from '$lib/components/ui/button/index.js';

	let { data } = $props();
	const game = $derived(data.game);
	let threads = $state(data.threads);
	$effect(() => { threads = data.threads; });

	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	// ── Search ───────────────────────────────────────────────────────────
	let searchInput = $state('');
	const filtered = $derived(
		searchInput.trim()
			? threads.filter((t: any) => t.title.toLowerCase().includes(searchInput.trim().toLowerCase()))
			: threads
	);

	// ── Form ─────────────────────────────────────────────────────────────
	let showForm = $state(false);
	let discTitle = $state('');
	let discBody = $state('');
	let submitting = $state(false);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	async function submitThread() {
		if (!$user || !discTitle.trim() || !discBody.trim() || !data.gameBoardId) return;
		submitting = true;
		try {
			const session = (await supabase.auth.getSession()).data.session;
			const res = await fetch(`${PUBLIC_WORKER_URL}/forum/create-thread`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
				body: JSON.stringify({ board_id: data.gameBoardId, title: discTitle.trim(), body: discBody.trim(), game_id: game.game_id }),
			});
			const result = await res.json();
			if (result.ok) {
				discTitle = ''; discBody = ''; showForm = false;
				showToast('success', 'Thread posted!');
				window.location.reload();
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
	<title>Discussion — {game.game_name} Forum | CRC</title>
</svelte:head>

<div class="forum-page">
	<nav class="forum-breadcrumb">
		<a href={localizeHref(`/games/${game.game_id}/forum`)}><ChevronLeft size={14} /> {game.game_name} Forum</a>
	</nav>

	<div class="forum-page__header">
		<h1><MessageSquare size={22} /> Discussion</h1>
		<p class="muted">General community discussion about {game.game_name}.</p>
	</div>

	<div class="filter-bar">
		<div class="filter-bar__search">
			<Search size={14} />
			<input type="text" bind:value={searchInput} placeholder="Search threads..." />
		</div>
		<div class="filter-bar__actions">
			{#if data.hasApprovedProfile && data.gameBoardId}
				<Button.Root variant="accent" size="sm" onclick={() => { showForm = !showForm; }}>
					{showForm ? 'Cancel' : '+ Thread'}
				</Button.Root>
			{:else if !$user}
				<span class="muted small">Sign in to post</span>
			{:else if !data.hasApprovedProfile}
				<span class="muted small">Approved profile required</span>
			{/if}
		</div>
	</div>

	{#if showForm && data.gameBoardId}
		<div class="new-thread-form">
			<input class="new-thread-form__title" type="text" bind:value={discTitle} placeholder="Thread title" maxlength="200" />
			<RetroToolbar bind:textarea={textareaEl} />
			<textarea
				class="new-thread-form__body new-thread-form__body--with-toolbar"
				bind:this={textareaEl}
				bind:value={discBody}
				rows="6"
				placeholder="Write your post... (Markdown supported)"
				maxlength="10000"
			></textarea>
			<div class="new-thread-form__actions">
				<button class="btn btn--accent" onclick={submitThread} disabled={submitting || !discTitle.trim() || !discBody.trim()}>
					{submitting ? 'Posting...' : 'Post Thread'}
				</button>
				<button class="btn btn--reset" onclick={() => { showForm = false; }}>Cancel</button>
			</div>
		</div>
	{/if}

	<ForumThreadTable empty={filtered.length === 0} emptyMessage={searchInput ? 'No threads matching your search.' : 'No discussion threads yet. Start a conversation!'}>
		{#each filtered as t}
			<ForumThreadRow
				href={localizeHref(`/games/${game.game_id}/forum/thread/${t.id}`)}
				title={t.title}
				pinned={t.is_pinned}
				locked={t.is_locked}
				tags={[
					...(t.is_pinned ? [{ label: 'Pinned' }] : []),
					...(t.is_locked ? [{ label: 'Locked', variant: 'locked' }] : [])
				]}
				authorLine="by <strong>{t.author_name}</strong> · {timeAgo(t.created_at)}"
				stat1={t.reply_count}
				stat2={t.view_count}
				lastPostName={t.last_post_by_name}
				lastPostAvatar={t.last_post_by_avatar}
				lastPostTime={t.last_post_at ? timeAgo(t.last_post_at) : timeAgo(t.created_at)}
			/>
		{/each}
	</ForumThreadTable>
</div>

{#if toast}
	<div class="toast toast--{toast.type}">{toast.text}</div>
{/if}

<style>
	.forum-page { max-width: 960px; margin: 0 auto; }
	.forum-breadcrumb { display: flex; align-items: center; gap: 0.25rem; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.75rem; }
	.forum-breadcrumb a { color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 0.15rem; }
	.forum-breadcrumb a:hover { text-decoration: underline; }
	.forum-page__header { margin-bottom: 1rem; }
	.forum-page__header h1 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.25rem; font-size: 1.35rem; }
	.forum-page__header .muted { margin: 0; font-size: 0.9rem; }

	.filter-bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.filter-bar__search { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; flex: 1; min-width: 160px; max-width: 280px; color: var(--muted); }
	.filter-bar__search input { border: none; background: none; color: var(--fg); font-size: 0.85rem; font-family: inherit; outline: none; width: 100%; }
	.filter-bar__search:focus-within { border-color: var(--accent); }
	.filter-bar__actions { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }

	.new-thread-form { margin-bottom: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; }
	.new-thread-form__title { width: 100%; padding: 0.5rem 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem; box-sizing: border-box; }
	.new-thread-form__title:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__body { width: 100%; padding: 0.5rem 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.88rem; resize: vertical; box-sizing: border-box; }
	.new-thread-form__body--with-toolbar { border-radius: 0 0 var(--radius-sm) var(--radius-sm); }
	.new-thread-form__body:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

	.btn { display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; font-family: inherit; }
	.btn:hover { border-color: var(--accent); }
	.btn--accent { background: var(--accent); color: white; border-color: var(--accent); }
	.btn--reset { background: none; border-color: var(--border); color: var(--muted); }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }

	.toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.88rem; font-weight: 500; z-index: 999; animation: toast-in 0.2s; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
	@keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

	@media (max-width: 700px) { .filter-bar { flex-direction: column; align-items: stretch; } .filter-bar__search { max-width: none; } .filter-bar__actions { margin-left: 0; } }
</style>
