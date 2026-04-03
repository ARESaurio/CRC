<script lang="ts">
	/**
	 * ForumPostCard — Classic phpBB-style post layout.
	 * Left: avatar, username, role badge, join date, post count.
	 * Right: post body (rendered markdown) + signature.
	 */
	import { renderMarkdown } from '$lib/utils/markdown';
	import { formatDate } from '$lib/utils';
	import { localizeHref } from '$lib/paraglide/runtime';
	import type { ForumPost } from '$lib/types';

	let {
		post,
		index = 0,
		isOP = false,
		currentUserId = null,
		isAdmin = false,
		onEdit = null,
		onDelete = null,
	}: {
		post: ForumPost;
		index?: number;
		isOP?: boolean;
		currentUserId?: string | null;
		isAdmin?: boolean;
		onEdit?: ((postId: string) => void) | null;
		onDelete?: ((postId: string) => void) | null;
	} = $props();

	const ROLE_LABELS: Record<string, string> = {
		super_admin: 'Super Admin',
		admin: 'Admin',
		moderator: 'Moderator',
		verifier: 'Verifier',
		runner: 'Runner',
	};

	const ROLE_CLASSES: Record<string, string> = {
		super_admin: 'role--admin',
		admin: 'role--admin',
		moderator: 'role--mod',
		verifier: 'role--verifier',
		runner: '',
	};

	const canEdit = $derived(currentUserId === post.author_id || isAdmin);
	const canDelete = $derived(currentUserId === post.author_id || isAdmin);
	const renderedBody = $derived(renderMarkdown(post.body));
	const renderedSignature = $derived(post.author_signature ? renderMarkdown(post.author_signature) : null);
</script>

<div class="fpost" class:fpost--op={isOP} id="post-{post.id}">
	<!-- Left: User info panel -->
	<div class="fpost__user">
		<div class="fpost__avatar-wrap">
			{#if post.author_avatar}
				<img class="fpost__avatar" src={post.author_avatar} alt="" />
			{:else}
				<div class="fpost__avatar fpost__avatar--placeholder">
					{(post.author_name || '?')[0].toUpperCase()}
				</div>
			{/if}
		</div>

		<a class="fpost__username" href={post.author_runner_id ? localizeHref(`/runners/${post.author_runner_id}`) : '#'}>
			{post.author_name || 'Unknown'}
		</a>

		{#if post.author_role}
			<span class="fpost__role {ROLE_CLASSES[post.author_role] || ''}">
				{ROLE_LABELS[post.author_role] || 'Runner'}
			</span>
		{/if}

		<div class="fpost__stats">
			<span class="fpost__stat" title="Posts">Posts: <strong>{post.author_post_count ?? 0}</strong></span>
			{#if post.author_joined_at}
				<span class="fpost__stat" title="Joined">Joined: <strong>{formatDate(post.author_joined_at)}</strong></span>
			{/if}
		</div>
	</div>

	<!-- Right: Post content -->
	<div class="fpost__content">
		<div class="fpost__header">
			<span class="fpost__date" title={post.created_at}>
				{#if isOP}📌{/if}
				{formatDate(post.created_at)}
			</span>
			<span class="fpost__num">#{index + 1}</span>
		</div>

		<div class="fpost__body markdown-content">
			{@html renderedBody}
		</div>

		{#if post.edit_count > 0}
			<div class="fpost__edited">
				Edited {post.edit_count} time{post.edit_count > 1 ? 's' : ''}{#if post.edited_at}, last: {formatDate(post.edited_at)}{/if}
			</div>
		{/if}

		{#if renderedSignature}
			<div class="fpost__sig-divider"></div>
			<div class="fpost__sig markdown-content">
				{@html renderedSignature}
			</div>
		{/if}

		{#if canEdit || canDelete}
			<div class="fpost__actions">
				{#if canEdit && onEdit}
					<button class="fpost__action" onclick={() => onEdit?.(post.id)}>Edit</button>
				{/if}
				{#if canDelete && onDelete}
					<button class="fpost__action fpost__action--danger" onclick={() => onDelete?.(post.id)}>Delete</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.fpost {
		display: grid;
		grid-template-columns: 150px 1fr;
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 0;
	}

	/* Collapse borders between posts */
	.fpost + .fpost { border-top: none; }
	.fpost:first-child { border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
	.fpost:last-child { border-radius: 0 0 var(--radius-sm) var(--radius-sm); }
	.fpost:only-child { border-radius: var(--radius-sm); }

	/* ── User panel (left) ─────────────────────────────────── */
	.fpost__user {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 0.85rem 0.6rem;
		border-right: 1px solid var(--border);
		background: rgba(255,255,255,0.015);
		text-align: center;
	}

	.fpost__avatar-wrap { line-height: 0; }

	.fpost__avatar {
		width: 64px;
		height: 64px;
		border-radius: 4px;
		object-fit: cover;
		border: 2px solid var(--border);
	}

	.fpost__avatar--placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--panel);
		color: var(--muted);
		font-size: 1.5rem;
		font-weight: 700;
	}

	.fpost__username {
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--accent);
		text-decoration: none;
		word-break: break-word;
	}
	.fpost__username:hover { text-decoration: underline; }

	.fpost__role {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		background: rgba(255,255,255,0.06);
		color: var(--muted);
	}
	.fpost__role.role--admin { background: rgba(239,68,68,0.12); color: #ef4444; }
	.fpost__role.role--mod { background: rgba(245,158,11,0.12); color: #f59e0b; }
	.fpost__role.role--verifier { background: rgba(59,195,110,0.12); color: var(--accent); }

	.fpost__stats {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin-top: 0.25rem;
	}

	.fpost__stat {
		font-size: 0.7rem;
		color: var(--muted);
	}
	.fpost__stat strong { color: var(--text-muted); }

	/* ── Content panel (right) ─────────────────────────────── */
	.fpost__content {
		display: flex;
		flex-direction: column;
		padding: 0;
	}

	.fpost__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.45rem 0.85rem;
		border-bottom: 1px solid rgba(255,255,255,0.04);
		background: rgba(255,255,255,0.02);
	}

	.fpost__date { font-size: 0.78rem; color: var(--muted); }
	.fpost__num { font-size: 0.75rem; color: var(--muted); font-family: monospace; }

	.fpost__body {
		padding: 0.85rem;
		font-size: 0.9rem;
		line-height: 1.65;
		flex: 1;
	}

	.fpost__edited {
		padding: 0 0.85rem 0.5rem;
		font-size: 0.72rem;
		color: var(--muted);
		font-style: italic;
	}

	/* ── Signature ─────────────────────────────────────────── */
	.fpost__sig-divider {
		margin: 0 0.85rem;
		border-top: 1px dashed var(--border);
	}

	.fpost__sig {
		padding: 0.5rem 0.85rem 0.65rem;
		font-size: 0.78rem;
		color: var(--muted);
		line-height: 1.4;
		max-height: 80px;
		overflow: hidden;
	}

	/* ── Actions ───────────────────────────────────────────── */
	.fpost__actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.4rem 0.85rem 0.6rem;
	}

	.fpost__action {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 0.75rem;
		font-family: inherit;
		cursor: pointer;
		padding: 0.15rem 0.35rem;
		border-radius: 3px;
		transition: all 0.1s;
	}
	.fpost__action:hover { color: var(--fg); background: rgba(255,255,255,0.06); }
	.fpost__action--danger:hover { color: #ef4444; background: rgba(239,68,68,0.08); }

	/* ── Mobile ────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.fpost {
			grid-template-columns: 1fr;
		}

		.fpost__user {
			flex-direction: row;
			flex-wrap: wrap;
			justify-content: flex-start;
			gap: 0.5rem;
			padding: 0.6rem 0.85rem;
			border-right: none;
			border-bottom: 1px solid var(--border);
		}

		.fpost__avatar { width: 36px; height: 36px; }
		.fpost__stats { flex-direction: row; gap: 0.75rem; }
	}
</style>
