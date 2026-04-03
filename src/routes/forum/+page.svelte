<script lang="ts">
	import { goto } from '$app/navigation';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';
	import { MessageSquare, Target, HelpCircle, Coffee, Pin, Lock, Search, Eye, MessageCircle, Gamepad2, Globe, Layers, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import type { ForumBoard } from '$lib/types';

	let { data } = $props();
	const boards: ForumBoard[] = $derived(data.boards || []);
	const threads = $derived(data.threads || []);
	const currentPage = $derived(data.page);
	const totalPages = $derived(data.totalPages);
	const totalThreads = $derived(data.totalThreads);
	const totalBoardThreads = $derived(boards.reduce((sum, b) => sum + (b.thread_count || 0), 0));
	const totalBoardPosts = $derived(boards.reduce((sum, b) => sum + (b.post_count || 0), 0));

	let searchInput = $state(data.search || '');
	let activeScope = $state(data.scope || 'global');

	const BOARD_ICONS: Record<string, typeof MessageSquare> = {
		general: MessageSquare,
		strategy: Target,
		questions: HelpCircle,
		'off-topic': Coffee,
	};

	function applyFilters(newPage = 1) {
		const params = new URLSearchParams();
		if (searchInput.trim()) params.set('q', searchInput.trim());
		if (activeScope !== 'global') params.set('scope', activeScope);
		if (newPage > 1) params.set('page', String(newPage));
		goto(localizeHref(`/forum${params.toString() ? '?' + params.toString() : ''}`));
	}

	function setScope(scope: string) {
		activeScope = scope;
		applyFilters(1);
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

	function threadHref(t: any): string {
		if (t.game_id && t.board_slug) {
			return localizeHref(`/games/${t.game_id}/forum/thread/${t.id}`);
		}
		return localizeHref(`/forum/${t.board_slug}/${t.id}`);
	}
</script>

<svelte:head>
	<title>Forum | Challenge Run Community</title>
</svelte:head>

<div class="page-width">
	<div class="forum-index">
		<div class="forum-index__header">
			<h1>Community Forum</h1>
			<p class="muted">Discuss challenge runs, share strategies, and connect with the community.</p>
		</div>

		<!-- Board listing -->
		<div class="board-table">
			<div class="board-table__head">
				<span class="board-table__col board-table__col--board">Board</span>
				<span class="board-table__col board-table__col--stats">Threads</span>
				<span class="board-table__col board-table__col--stats">Posts</span>
				<span class="board-table__col board-table__col--last">Last Post</span>
			</div>

			{#each boards as board}
				{@const IconComponent = BOARD_ICONS[board.slug] || MessageSquare}
				<a class="board-row" href={localizeHref(`/forum/${board.slug}`)}>
					<div class="board-row__info">
						<span class="board-row__icon"><IconComponent size={22} /></span>
						<div class="board-row__text">
							<span class="board-row__name">{board.name}</span>
							{#if board.description}
								<span class="board-row__desc">{board.description}</span>
							{/if}
						</div>
					</div>
					<span class="board-row__stat">{board.thread_count ?? 0}</span>
					<span class="board-row__stat">{board.post_count ?? 0}</span>
					<div class="board-row__last">
						{#if board.last_thread_title}
							<span class="board-row__last-title">{board.last_thread_title}</span>
							<span class="board-row__last-meta">
								{#if board.last_post_by_avatar}
									<img class="board-row__last-avatar" src={board.last_post_by_avatar} alt="" />
								{/if}
								by <strong>{board.last_post_by_name || 'Unknown'}</strong>
								· {timeAgo(board.last_post_at || '')}
							</span>
						{:else}
							<span class="board-row__no-posts">No posts yet</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>

		<div class="forum-stats">
			<span>{totalBoardThreads} thread{totalBoardThreads !== 1 ? 's' : ''}</span>
			<span class="forum-stats__sep">·</span>
			<span>{totalBoardPosts} post{totalBoardPosts !== 1 ? 's' : ''}</span>
			<span class="forum-stats__sep">·</span>
			<span>{boards.length} board{boards.length !== 1 ? 's' : ''}</span>
		</div>

		<!-- Recent Threads -->
		<div class="recent-threads">
			<h2 class="recent-threads__title">Recent Threads</h2>

			<!-- Filter bar -->
			<div class="filter-bar">
				<div class="filter-bar__scopes">
					<button class="scope-btn" class:scope-btn--active={activeScope === 'global'} onclick={() => setScope('global')}>
						<Globe size={14} /> Global
					</button>
					<button class="scope-btn" class:scope-btn--active={activeScope === 'games'} onclick={() => setScope('games')}>
						<Gamepad2 size={14} /> Games
					</button>
					<button class="scope-btn" class:scope-btn--active={activeScope === 'all'} onclick={() => setScope('all')}>
						<Layers size={14} /> All
					</button>
				</div>
				<div class="filter-bar__search">
					<Search size={14} />
					<input
						type="text"
						bind:value={searchInput}
						placeholder="Search threads..."
						onkeydown={(e) => { if (e.key === 'Enter') applyFilters(1); }}
					/>
				</div>
			</div>

			<!-- Thread table -->
			<div class="thread-table">
				<div class="thread-table__head">
					<span class="thread-table__col thread-table__col--topic">Topic</span>
					<span class="thread-table__col thread-table__col--stat">Replies</span>
					<span class="thread-table__col thread-table__col--stat">Views</span>
					<span class="thread-table__col thread-table__col--last">Last Post</span>
				</div>

				{#each threads as thread}
					<a class="thread-row" class:thread-row--pinned={thread.is_pinned} href={threadHref(thread)}>
						<div class="thread-row__info">
							<span class="thread-row__icon">
								{#if thread.is_pinned}<Pin size={16} />
								{:else if thread.is_locked}<Lock size={16} />
								{:else}<MessageCircle size={16} />{/if}
							</span>
							<div class="thread-row__text">
								<span class="thread-row__title">
									{thread.title}
									{#if thread.is_pinned}<span class="thread-row__tag">Pinned</span>{/if}
									{#if thread.is_locked}<span class="thread-row__tag thread-row__tag--locked">Locked</span>{/if}
									{#if thread.game_name}<span class="thread-row__tag thread-row__tag--game">{thread.game_name}</span>{/if}
								</span>
								<span class="thread-row__author">
									by <strong>{thread.author_name}</strong>
									{#if thread.board_name} in {thread.board_name}{/if}
									· {timeAgo(thread.created_at)}
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
						<p class="muted">{searchInput ? 'No threads matching your search.' : 'No threads yet.'}</p>
					</div>
				{/each}
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="forum-pagination">
					{#if currentPage > 1}
						<button class="forum-pagination__btn" onclick={() => applyFilters(currentPage - 1)}>
							<ChevronLeft size={14} /> Previous
						</button>
					{/if}
					<span class="forum-pagination__info">Page {currentPage} of {totalPages} · {totalThreads} threads</span>
					{#if currentPage < totalPages}
						<button class="forum-pagination__btn" onclick={() => applyFilters(currentPage + 1)}>
							Next <ChevronRight size={14} />
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.forum-index { max-width: 960px; margin: 0 auto; }
	.forum-index__header { margin-bottom: 1.25rem; }
	.forum-index__header h1 { margin: 0 0 0.25rem; font-size: 1.35rem; }
	.forum-index__header .muted { margin: 0; font-size: 0.9rem; }

	/* ── Board table ───────────────────────────────────────── */
	.board-table { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
	.board-table__head {
		display: grid; grid-template-columns: 1fr 70px 70px 200px; gap: 0.5rem;
		padding: 0.5rem 0.85rem;
		background: linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
		border-bottom: 1px solid var(--border);
		font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);
	}
	.board-table__col--stats { text-align: center; }

	.board-row {
		display: grid; grid-template-columns: 1fr 70px 70px 200px; gap: 0.5rem; align-items: center;
		padding: 0.75rem 0.85rem; text-decoration: none; color: var(--fg);
		border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s;
	}
	.board-row:last-child { border-bottom: none; }
	.board-row:hover { background: rgba(255,255,255,0.03); }
	.board-row__info { display: flex; align-items: flex-start; gap: 0.65rem; }
	.board-row__icon { flex-shrink: 0; color: var(--accent); padding-top: 0.1rem; }
	.board-row__text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
	.board-row__name { font-weight: 700; font-size: 0.95rem; }
	.board-row__desc { font-size: 0.82rem; color: var(--muted); line-height: 1.3; }
	.board-row__stat { text-align: center; font-size: 0.88rem; font-weight: 600; color: var(--text-muted); }
	.board-row__last { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.board-row__last-title { font-size: 0.82rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.board-row__last-meta { font-size: 0.72rem; color: var(--muted); display: flex; align-items: center; gap: 0.25rem; }
	.board-row__last-avatar { width: 14px; height: 14px; border-radius: 50%; object-fit: cover; }
	.board-row__no-posts { font-size: 0.8rem; color: var(--muted); font-style: italic; }

	.forum-stats { display: flex; align-items: center; gap: 0.4rem; padding: 0.75rem 0; font-size: 0.8rem; color: var(--muted); }
	.forum-stats__sep { opacity: 0.4; }

	/* ── Recent Threads section ────────────────────────────── */
	.recent-threads { margin-top: 1rem; }
	.recent-threads__title { margin: 0 0 0.75rem; font-size: 1.15rem; }

	/* ── Filter bar ────────────────────────────────────────── */
	.filter-bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.filter-bar__scopes { display: flex; gap: 0.25rem; }
	.scope-btn {
		display: inline-flex; align-items: center; gap: 0.3rem;
		padding: 0.35rem 0.65rem; background: transparent; border: 1px solid var(--border);
		border-radius: 6px; font-size: 0.8rem; font-family: inherit; color: var(--muted); cursor: pointer;
	}
	.scope-btn:hover { border-color: var(--fg); color: var(--fg); }
	.scope-btn--active { background: var(--accent); color: white; border-color: var(--accent); }

	.filter-bar__search {
		display: flex; align-items: center; gap: 0.4rem;
		padding: 0.3rem 0.6rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 6px;
		flex: 1; min-width: 160px; max-width: 280px; color: var(--muted);
	}
	.filter-bar__search input {
		border: none; background: none; color: var(--fg);
		font-size: 0.85rem; font-family: inherit; outline: none; width: 100%;
	}
	.filter-bar__search:focus-within { border-color: var(--accent); }

	/* ── Thread table ──────────────────────────────────────── */
	.thread-table { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
	.thread-table__head {
		display: grid; grid-template-columns: 1fr 70px 70px 160px; gap: 0.5rem;
		padding: 0.5rem 0.85rem;
		background: linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
		border-bottom: 1px solid var(--border);
		font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);
	}
	.thread-table__col--stat { text-align: center; }
	.thread-table__empty { padding: 2rem; text-align: center; }

	.thread-row {
		display: grid; grid-template-columns: 1fr 70px 70px 160px; gap: 0.5rem; align-items: center;
		padding: 0.6rem 0.85rem; text-decoration: none; color: var(--fg);
		border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s;
	}
	.thread-row:last-child { border-bottom: none; }
	.thread-row:hover { background: rgba(255,255,255,0.03); }
	.thread-row--pinned { background: rgba(59,195,110,0.03); }
	.thread-row__info { display: flex; align-items: flex-start; gap: 0.5rem; }
	.thread-row__icon { flex-shrink: 0; color: var(--muted); padding-top: 0.15rem; }
	.thread-row--pinned .thread-row__icon { color: var(--accent); }
	.thread-row__text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.thread-row__title { font-weight: 600; font-size: 0.92rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.thread-row__tag {
		font-size: 0.62rem; font-weight: 700; text-transform: uppercase;
		padding: 0.05rem 0.35rem; border-radius: 3px; background: rgba(59,195,110,0.12); color: var(--accent);
	}
	.thread-row__tag--locked { background: rgba(245,158,11,0.12); color: #f59e0b; }
	.thread-row__tag--game { background: rgba(99,102,241,0.12); color: rgba(99,102,241,0.85); }
	.thread-row__author { font-size: 0.75rem; color: var(--muted); }
	.thread-row__stat { text-align: center; font-size: 0.85rem; color: var(--text-muted); }
	.thread-row__last { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.thread-row__last-meta { font-size: 0.78rem; display: flex; align-items: center; gap: 0.25rem; }
	.thread-row__last-avatar { width: 14px; height: 14px; border-radius: 50%; object-fit: cover; }
	.thread-row__last-time { font-size: 0.72rem; color: var(--muted); }

	/* ── Pagination ────────────────────────────────────────── */
	.forum-pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; padding: 0.75rem 0; }
	.forum-pagination__btn {
		display: inline-flex; align-items: center; gap: 0.25rem;
		color: var(--accent); background: none; border: none; font-size: 0.85rem;
		font-family: inherit; font-weight: 500; cursor: pointer; padding: 0;
	}
	.forum-pagination__btn:hover { text-decoration: underline; }
	.forum-pagination__info { font-size: 0.82rem; color: var(--muted); }

	.muted { color: var(--muted); }

	@media (max-width: 700px) {
		.board-table__head, .thread-table__head { display: none; }
		.board-row, .thread-row { grid-template-columns: 1fr; gap: 0.25rem; }
		.board-row__stat, .thread-row__stat { display: none; }
		.board-row__last, .thread-row__last { flex-direction: row; gap: 0.5rem; }
		.filter-bar { flex-direction: column; align-items: stretch; }
		.filter-bar__search { max-width: none; }
	}
</style>
