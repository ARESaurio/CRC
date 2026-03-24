<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';
	import { SECTIONS } from '../../consensus';
	import * as Button from '$components/ui/button/index.js';

	let { data } = $props();
	const game = $derived(data.game);
	const suggestion = $derived(data.suggestion);

	let votes = $state(data.votes);
	let comments = $state(data.comments);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let commentText = $state('');
	let commentSubmitting = $state(false);

	// ── Admin check ──────────────────────────────────────────────────────
	let isAdmin = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('is_admin, is_super_admin').eq('user_id', u.id).maybeSingle()
				.then(({ data: p }) => { isAdmin = !!(p?.is_admin || p?.is_super_admin); });
		} else { isAdmin = false; }
	});

	// ── Approved profile check ───────────────────────────────────────────
	let hasApprovedProfile = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('status').eq('user_id', u.id).maybeSingle()
				.then(({ data: p }) => { hasApprovedProfile = p?.status === 'approved'; });
		} else { hasApprovedProfile = false; }
	});

	// ── Derived ──────────────────────────────────────────────────────────
	const agreeCount = $derived(votes.filter((v: any) => v.vote === 'agree').length);
	const disagreeCount = $derived(votes.filter((v: any) => v.vote === 'disagree').length);
	const myVote = $derived(votes.find((v: any) => v.user_id === $user?.id)?.vote || null);
	const isOwn = $derived($user?.id === suggestion.user_id);

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	// ═════════════════════════════════════════════════════════════════════
	// VOTING
	// ═════════════════════════════════════════════════════════════════════

	async function castVote(voteType: 'agree' | 'disagree') {
		if (!$user) return;
		const existing = votes.find((v: any) => v.user_id === $user?.id);
		if (existing) {
			if (existing.vote === voteType) {
				// Remove vote
				const { error } = await supabase.from('game_suggestion_votes').delete().eq('id', existing.id);
				if (!error) votes = votes.filter((v: any) => v.id !== existing.id);
				return;
			}
			// Change vote
			const { data: row, error } = await supabase.from('game_suggestion_votes').update({ vote: voteType }).eq('id', existing.id).select().single();
			if (!error && row) votes = votes.map((v: any) => v.id === existing.id ? { ...v, vote: voteType } : v);
		} else {
			const { data: row, error } = await supabase.from('game_suggestion_votes').insert({ suggestion_id: suggestion.id, user_id: $user.id, vote: voteType }).select().single();
			if (error) showToast('error', error.message);
			else if (row) votes = [...votes, row];
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// COMMENTS
	// ═════════════════════════════════════════════════════════════════════

	async function postComment() {
		if (!$user || !commentText.trim()) return;
		commentSubmitting = true;
		const { data: row, error } = await supabase.from('game_suggestion_comments').insert({
			suggestion_id: suggestion.id,
			user_id: $user.id,
			body: commentText.trim().slice(0, 2000)
		}).select().single();

		if (error) { showToast('error', error.message); }
		else if (row) {
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id, avatar_url').eq('user_id', $user.id).maybeSingle();
			comments = [...comments, { ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null, avatar_url: profile?.avatar_url || null }];
			commentText = '';
		}
		commentSubmitting = false;
	}

	async function deleteComment(id: string) {
		const { error } = await supabase.from('game_suggestion_comments').delete().eq('id', id);
		if (!error) comments = comments.filter((c: any) => c.id !== id);
	}

	// ═════════════════════════════════════════════════════════════════════
	// ADMIN: Accept / Reject / Close
	// ═════════════════════════════════════════════════════════════════════

	let adminAction = $state<string | null>(null);
	let adminResponse = $state('');
	let adminSubmitting = $state(false);

	async function submitAdminAction() {
		if (!adminAction) return;
		adminSubmitting = true;
		const { error } = await supabase.from('game_suggestions').update({
			status: adminAction,
			admin_response: adminResponse.trim() || null,
			reviewed_by: $user?.id
		}).eq('id', suggestion.id);

		if (error) showToast('error', error.message);
		else {
			showToast('success', `Suggestion ${adminAction}.`);
			suggestion.status = adminAction;
			suggestion.admin_response = adminResponse.trim() || null;
			adminAction = null;
			adminResponse = '';
		}
		adminSubmitting = false;
	}
</script>

<svelte:head><title>{suggestion.title} — Forum | {game.game_name} | CRC</title></svelte:head>

<div class="suggestion-page">
	{#if toast}
		<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- Breadcrumb -->
	<nav class="breadcrumb">
		<a href={localizeHref(`/games/${game.game_id}/forum`)}>← Forum</a>
		<span class="breadcrumb__sep">›</span>
		<span>Game Suggestions</span>
		<span class="breadcrumb__sep">›</span>
		<span class="breadcrumb__current">{suggestion.title}</span>
	</nav>

	<!-- Suggestion card -->
	<div class="suggestion-card">
		<div class="suggestion-card__header">
			<h1>{suggestion.title}</h1>
			<span class="status-badge status-badge--{suggestion.status}">{suggestion.status}</span>
		</div>

		<div class="suggestion-card__meta">
			{#if suggestion.avatar_url}
				<img class="suggestion-card__avatar" src={suggestion.avatar_url} alt="" />
			{/if}
			<span>by <strong>{suggestion.display_name}</strong></span>
			<span class="muted">· {formatDate(suggestion.created_at)}</span>
		</div>

		<div class="suggestion-card__tags">
			{#each suggestion.sections || [] as sec}
				{@const meta = SECTIONS.find(s => s.id === sec)}
				{#if meta}
					<span class="section-tag">{meta.icon} {meta.label}</span>
				{/if}
			{/each}
		</div>

		<div class="suggestion-card__body">
			<p>{suggestion.body}</p>
		</div>

		{#if suggestion.admin_response}
			<div class="admin-response">
				<strong>Staff response:</strong> {suggestion.admin_response}
			</div>
		{/if}

		<!-- Voting -->
		<div class="suggestion-card__voting">
			{#if hasApprovedProfile}
				<button class="vote-btn" class:vote-btn--active={myVote === 'agree'} onclick={() => castVote('agree')}>
					👍 {agreeCount}
				</button>
				<button class="vote-btn" class:vote-btn--active-disagree={myVote === 'disagree'} onclick={() => castVote('disagree')}>
					👎 {disagreeCount}
				</button>
			{:else}
				<span class="vote-count">👍 {agreeCount} · 👎 {disagreeCount}</span>
			{/if}
		</div>

		<!-- Admin actions -->
		{#if isAdmin && suggestion.status === 'open'}
			<div class="admin-actions">
				{#if adminAction}
					<div class="admin-form">
						<textarea class="admin-form__input" bind:value={adminResponse} rows="2" placeholder="Response (optional)"></textarea>
						<div class="admin-form__btns">
							<button class="btn btn--save" onclick={submitAdminAction} disabled={adminSubmitting}>
								{adminSubmitting ? '...' : `Confirm ${adminAction}`}
							</button>
							<button class="btn btn--reset" onclick={() => { adminAction = null; }}>Cancel</button>
						</div>
					</div>
				{:else}
					<button class="btn btn--small btn--approve" onclick={() => { adminAction = 'accepted'; }}>✓ Accept</button>
					<button class="btn btn--small btn--reject" onclick={() => { adminAction = 'rejected'; }}>✕ Reject</button>
					<Button.Root variant="outline" size="sm" onclick={() => { adminAction = 'closed'; }}>Close</Button.Root>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Comments -->
	<div class="comments-section">
		<h3>Comments ({comments.length})</h3>
		{#each comments as c}
			<div class="comment">
				<div class="comment__header">
					<strong>{c.display_name}</strong>
					<span class="muted">{formatDate(c.created_at)}</span>
					{#if c.user_id === $user?.id}
						<button class="comment__delete" onclick={() => deleteComment(c.id)}>&times;</button>
					{/if}
				</div>
				<p class="comment__body">{c.body}</p>
			</div>
		{/each}
		{#if comments.length === 0}
			<p class="muted small">No comments yet.</p>
		{/if}
		{#if hasApprovedProfile}
			<div class="comment-form">
				<textarea class="comment-form__input" bind:value={commentText} rows="2" placeholder="Add a comment..." maxlength="2000"></textarea>
				<Button.Root variant="accent" size="sm" onclick={postComment} disabled={commentSubmitting || !commentText.trim()}>
					{commentSubmitting ? '...' : 'Post'}
				</Button.Root>
			</div>
		{/if}
	</div>
</div>

<style>
	.suggestion-page { max-width: 760px; margin: 0 auto; }

	.disc-toast { padding: 0.6rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.disc-toast--success { background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); color: #28a745; }
	.disc-toast--error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); color: #dc3545; }

	.breadcrumb { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.breadcrumb a { color: var(--accent); text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }
	.breadcrumb__sep { color: var(--muted); }
	.breadcrumb__current { font-weight: 600; }

	/* Suggestion card */
	.suggestion-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
	.suggestion-card__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem; }
	.suggestion-card__header h1 { margin: 0; font-size: 1.2rem; }
	.status-badge { font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 3px; font-weight: 600; text-transform: uppercase; flex-shrink: 0; }
	.status-badge--open { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.status-badge--accepted { background: rgba(40, 167, 69, 0.15); color: #28a745; }
	.status-badge--rejected { background: rgba(220, 53, 69, 0.15); color: #dc3545; }
	.status-badge--closed { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }
	.suggestion-card__meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; margin-bottom: 0.5rem; }
	.suggestion-card__avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
	.suggestion-card__tags { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
	.section-tag { font-size: 0.72rem; padding: 0.12rem 0.4rem; background: var(--surface); border: 1px solid var(--border); border-radius: 3px; }
	.suggestion-card__body { font-size: 0.92rem; line-height: 1.6; margin-bottom: 0.75rem; white-space: pre-wrap; }
	.suggestion-card__body p { margin: 0; }
	.admin-response { padding: 0.6rem 0.8rem; background: rgba(59, 130, 246, 0.06); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 6px; font-size: 0.88rem; margin-bottom: 0.75rem; }

	/* Voting */
	.suggestion-card__voting { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.5rem; }
	.vote-btn { padding: 0.35rem 0.7rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-family: inherit; color: var(--fg); transition: all 0.15s; }
	.vote-btn:hover { background: rgba(255,255,255,0.06); }
	.vote-btn--active { border-color: #28a745; background: rgba(40, 167, 69, 0.1); }
	.vote-btn--active-disagree { border-color: #dc3545; background: rgba(220, 53, 69, 0.1); }
	.vote-count { font-size: 0.88rem; color: var(--muted); }

	/* Admin actions */
	.admin-actions { display: flex; gap: 0.4rem; align-items: flex-start; flex-wrap: wrap; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.btn--approve { background: #28a745; color: white; border-color: #28a745; }
	.btn--reject { background: #dc3545; color: white; border-color: #dc3545; }
	.admin-form { width: 100%; }
	.admin-form__input { width: 100%; padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.85rem; resize: vertical; box-sizing: border-box; margin-bottom: 0.5rem; }
	.admin-form__input:focus { outline: none; border-color: var(--accent); }
	.admin-form__btns { display: flex; gap: 0.4rem; }

	/* Comments */
	.comments-section { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
	.comments-section h3 { margin: 0 0 0.75rem; font-size: 1rem; }
	.comment { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
	.comment:last-of-type { border-bottom: none; }
	.comment__header { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.2rem; font-size: 0.85rem; }
	.comment__delete { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 1rem; padding: 0; margin-left: auto; }
	.comment__delete:hover { color: #dc3545; }
	.comment__body { font-size: 0.88rem; line-height: 1.5; margin: 0; }
	.comment-form { margin-top: 0.75rem; display: flex; gap: 0.5rem; align-items: flex-end; }
	.comment-form__input { flex: 1; padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.85rem; resize: vertical; box-sizing: border-box; }
	.comment-form__input:focus { outline: none; border-color: var(--accent); }

	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }
	.btn--outline { background: transparent; border: 1px solid var(--border); }
</style>
