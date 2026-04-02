<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';
	import type { ForumBoard } from '$lib/types';

	let { data } = $props();
	const boards: ForumBoard[] = $derived(data.boards || []);
	const totalThreads = $derived(boards.reduce((sum, b) => sum + (b.thread_count || 0), 0));
	const totalPosts = $derived(boards.reduce((sum, b) => sum + (b.post_count || 0), 0));

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
	<title>Forum | Challenge Run Community</title>
</svelte:head>

<div class="page-width">
	<div class="forum-index">
		<div class="forum-index__header">
			<h1>Community Forum</h1>
			<p class="muted">Discuss challenge runs, share strategies, and connect with the community.</p>
		</div>

		<!-- Board listing table -->
		<div class="board-table">
			<div class="board-table__head">
				<span class="board-table__col board-table__col--board">Board</span>
				<span class="board-table__col board-table__col--stats">Threads</span>
				<span class="board-table__col board-table__col--stats">Posts</span>
				<span class="board-table__col board-table__col--last">Last Post</span>
			</div>

			{#each boards as board}
				<a class="board-row" href={localizeHref(`/forum/${board.slug}`)}>
					<div class="board-row__info">
						<span class="board-row__icon">
							{#if board.slug === 'general'}💬
							{:else if board.slug === 'strategy'}🎯
							{:else if board.slug === 'questions'}❓
							{:else if board.slug === 'off-topic'}☕
							{:else}📋{/if}
						</span>
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
			{:else}
				<div class="board-table__empty">
					<p class="muted">No boards available.</p>
				</div>
			{/each}
		</div>

		<!-- Forum stats -->
		<div class="forum-stats">
			<span>{totalThreads} thread{totalThreads !== 1 ? 's' : ''}</span>
			<span class="forum-stats__sep">·</span>
			<span>{totalPosts} post{totalPosts !== 1 ? 's' : ''}</span>
			<span class="forum-stats__sep">·</span>
			<span>{boards.length} board{boards.length !== 1 ? 's' : ''}</span>
		</div>
	</div>
</div>

<style>
	.forum-index { max-width: 960px; margin: 0 auto; }

	.forum-index__header { margin-bottom: 1.25rem; }
	.forum-index__header h1 { margin: 0 0 0.25rem; font-size: 1.35rem; }
	.forum-index__header .muted { margin: 0; font-size: 0.9rem; }

	/* ── Board table ───────────────────────────────────────── */
	.board-table {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.board-table__head {
		display: grid;
		grid-template-columns: 1fr 70px 70px 200px;
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

	.board-table__col--stats { text-align: center; }
	.board-table__empty { padding: 2rem; text-align: center; }

	/* ── Board row ─────────────────────────────────────────── */
	.board-row {
		display: grid;
		grid-template-columns: 1fr 70px 70px 200px;
		gap: 0.5rem;
		align-items: center;
		padding: 0.75rem 0.85rem;
		text-decoration: none;
		color: var(--fg);
		border-bottom: 1px solid rgba(255,255,255,0.04);
		transition: background 0.12s;
	}
	.board-row:last-child { border-bottom: none; }
	.board-row:hover { background: rgba(255,255,255,0.03); }

	.board-row__info {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
	}

	.board-row__icon { font-size: 1.35rem; flex-shrink: 0; line-height: 1.2; }

	.board-row__text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.board-row__name { font-weight: 700; font-size: 0.95rem; }
	.board-row__desc { font-size: 0.82rem; color: var(--muted); line-height: 1.3; }

	.board-row__stat {
		text-align: center;
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.board-row__last {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.board-row__last-title {
		font-size: 0.82rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.board-row__last-meta {
		font-size: 0.72rem;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.board-row__last-avatar {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		object-fit: cover;
	}

	.board-row__no-posts { font-size: 0.8rem; color: var(--muted); font-style: italic; }

	/* ── Footer stats ──────────────────────────────────────── */
	.forum-stats {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.75rem 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.forum-stats__sep { opacity: 0.4; }

	/* ── Mobile ────────────────────────────────────────────── */
	@media (max-width: 700px) {
		.board-table__head { display: none; }

		.board-row {
			grid-template-columns: 1fr;
			gap: 0.35rem;
		}

		.board-row__stat { display: none; }

		.board-row__last { flex-direction: row; gap: 0.5rem; }
	}

	.muted { color: var(--muted); }
</style>
