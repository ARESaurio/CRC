<script lang="ts">
	import { Lock, MessageSquare, CheckCircle, XCircle, ThumbsUp, ThumbsDown, Plus, Send, X } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';

	let { data } = $props();
	const game = $derived(data.game);

	let members = $state(data.members);
	let proposals = $state(data.proposals);
	let userVotes = $state(data.userVotes);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// ── Admin check ──────────────────────────────────────────────────────
	let isAdmin = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('is_admin, is_super_admin').eq('user_id', u.id).maybeSingle()
				.then(({ data: p }) => { isAdmin = !!(p?.is_admin || p?.is_super_admin); });
		} else {
			isAdmin = false;
		}
	});

	// ── Derived state ────────────────────────────────────────────────────
	const isMember = $derived(!!$user && members.some((m: any) => m.user_id === $user?.id));
	const isEditor = $derived(!!$user && members.some((m: any) => m.user_id === $user?.id && m.role === 'editor'));
	const editor = $derived(members.find((m: any) => m.role === 'editor'));

	// ── Filters ──────────────────────────────────────────────────────────
	let statusFilter = $state<'open' | 'accepted' | 'rejected' | 'all'>('open');
	const filteredProposals = $derived.by(() => {
		if (statusFilter === 'all') return proposals;
		return proposals.filter((p: any) => p.status === statusFilter);
	});

	// ── Proposal form ────────────────────────────────────────────────────
	let showProposalForm = $state(false);
	let proposalTitle = $state('');
	let proposalBody = $state('');
	let proposalSubmitting = $state(false);

	// ── Expanded proposal (for comments) ─────────────────────────────────
	let expandedId = $state<string | null>(null);
	let comments = $state<any[]>([]);
	let commentsLoading = $state(false);
	let commentText = $state('');
	let commentSubmitting = $state(false);

	// ── Resolution modal ─────────────────────────────────────────────────
	let resolveModalOpen = $state(false);
	let resolveProposal = $state<any>(null);
	let resolveAction = $state<'accepted' | 'rejected'>('accepted');
	let resolveNote = $state('');
	let resolveSubmitting = $state(false);

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3000);
	}

	// ═══════════════════════════════════════════════════════════════════════
	// JOIN / LEAVE
	// ═══════════════════════════════════════════════════════════════════════

	let joining = $state(false);

	async function joinCommittee() {
		if (!$user) return;
		joining = true;

		// If no editor exists, first member becomes editor
		const role = members.length === 0 ? 'editor' : 'member';

		const { data: row, error } = await supabase
			.from('rules_committee_members')
			.insert({ game_id: game.game_id, user_id: $user.id, role })
			.select()
			.single();

		if (error) {
			showToast('error', error.message.includes('duplicate') ? 'You are already a member.' : error.message);
		} else if (row) {
			// Fetch profile info for display
			const { data: profile } = await supabase
				.from('profiles')
				.select('display_name, runner_id, avatar_url')
				.eq('user_id', $user.id)
				.maybeSingle();

			members = [...members, {
				...row,
				display_name: profile?.display_name || 'You',
				runner_id: profile?.runner_id || null,
				avatar_url: profile?.avatar_url || null
			}];
			showToast('success', role === 'editor' ? 'Joined as editor!' : 'Joined the committee!');
		}
		joining = false;
	}

	async function leaveCommittee() {
		if (!$user) return;
		if (isEditor && !confirm('You are the editor. Leaving will remove you as editor — an admin will need to assign a new one. Continue?')) return;

		const { error } = await supabase
			.from('rules_committee_members')
			.delete()
			.eq('game_id', game.game_id)
			.eq('user_id', $user.id);

		if (error) {
			showToast('error', error.message);
		} else {
			members = members.filter((m: any) => m.user_id !== $user?.id);
			showToast('success', 'Left the committee.');
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// PROPOSALS
	// ═══════════════════════════════════════════════════════════════════════

	async function submitProposal() {
		if (!$user || !proposalTitle.trim() || !proposalBody.trim()) return;
		proposalSubmitting = true;

		const { data: row, error } = await supabase
			.from('rule_proposals')
			.insert({
				game_id: game.game_id,
				user_id: $user.id,
				title: proposalTitle.trim().slice(0, 200),
				body: proposalBody.trim().slice(0, 2000)
			})
			.select()
			.single();

		if (error) {
			showToast('error', error.message);
		} else if (row) {
			// Fetch display name
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id').eq('user_id', $user.id).maybeSingle();
			proposals = [{ ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null }, ...proposals];
			proposalTitle = '';
			proposalBody = '';
			showProposalForm = false;
			showToast('success', 'Proposal submitted!');
		}
		proposalSubmitting = false;
	}

	async function withdrawProposal(id: string) {
		if (!confirm('Withdraw this proposal?')) return;
		const { error } = await supabase
			.from('rule_proposals')
			.update({ status: 'withdrawn', updated_at: new Date().toISOString() })
			.eq('id', id);
		if (!error) {
			proposals = proposals.map((p: any) => p.id === id ? { ...p, status: 'withdrawn' } : p);
			showToast('success', 'Proposal withdrawn.');
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// VOTING
	// ═══════════════════════════════════════════════════════════════════════

	async function vote(proposalId: string, voteType: 'agree' | 'disagree' | 'neutral') {
		if (!$user) return;
		const existing = userVotes[proposalId];

		if (existing === voteType) {
			// Remove vote
			await supabase.from('rule_proposal_votes').delete().eq('proposal_id', proposalId).eq('user_id', $user.id);
			const updated = { ...userVotes };
			delete updated[proposalId];
			userVotes = updated;
			updateVoteCount(proposalId, voteType, -1);
		} else {
			if (existing) {
				// Change vote
				await supabase.from('rule_proposal_votes').update({ vote: voteType }).eq('proposal_id', proposalId).eq('user_id', $user.id);
				updateVoteCount(proposalId, existing, -1);
			} else {
				// New vote
				await supabase.from('rule_proposal_votes').insert({ proposal_id: proposalId, user_id: $user.id, vote: voteType });
			}
			userVotes = { ...userVotes, [proposalId]: voteType };
			updateVoteCount(proposalId, voteType, 1);
		}
	}

	function updateVoteCount(proposalId: string, voteType: string, delta: number) {
		const key = `votes_${voteType}` as 'votes_agree' | 'votes_disagree' | 'votes_neutral';
		proposals = proposals.map((p: any) =>
			p.id === proposalId ? { ...p, [key]: Math.max(0, (p[key] || 0) + delta) } : p
		);
	}

	// ═══════════════════════════════════════════════════════════════════════
	// COMMENTS
	// ═══════════════════════════════════════════════════════════════════════

	async function toggleComments(proposalId: string) {
		if (expandedId === proposalId) { expandedId = null; return; }
		expandedId = proposalId;
		commentsLoading = true;
		commentText = '';

		const { data: rows } = await supabase
			.from('rule_proposal_comments')
			.select('*')
			.eq('proposal_id', proposalId)
			.order('created_at');

		// Fetch commenter profiles
		const uids = [...new Set((rows || []).map((c: any) => c.user_id))];
		let profileMap: Record<string, any> = {};
		if (uids.length > 0) {
			const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, runner_id').in('user_id', uids);
			for (const p of profiles || []) profileMap[p.user_id] = p;
		}

		comments = (rows || []).map((c: any) => ({
			...c,
			display_name: profileMap[c.user_id]?.display_name || 'Unknown',
			runner_id: profileMap[c.user_id]?.runner_id || null
		}));
		commentsLoading = false;
	}

	async function submitComment() {
		if (!$user || !commentText.trim() || !expandedId) return;
		commentSubmitting = true;

		const { data: row, error } = await supabase
			.from('rule_proposal_comments')
			.insert({
				proposal_id: expandedId,
				user_id: $user.id,
				body: commentText.trim().slice(0, 1000)
			})
			.select()
			.single();

		if (error) {
			showToast('error', error.message);
		} else if (row) {
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id').eq('user_id', $user.id).maybeSingle();
			comments = [...comments, { ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null }];
			commentText = '';
			// Increment comment count
			proposals = proposals.map((p: any) => p.id === expandedId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p);
		}
		commentSubmitting = false;
	}

	async function deleteComment(commentId: string) {
		if (!confirm('Delete this comment?')) return;
		const { error } = await supabase.from('rule_proposal_comments').delete().eq('id', commentId);
		if (!error) {
			comments = comments.filter((c: any) => c.id !== commentId);
			proposals = proposals.map((p: any) => p.id === expandedId ? { ...p, comment_count: Math.max(0, (p.comment_count || 1) - 1) } : p);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// RESOLUTION (editor/admin)
	// ═══════════════════════════════════════════════════════════════════════

	function openResolveModal(proposal: any, action: 'accepted' | 'rejected') {
		resolveProposal = proposal;
		resolveAction = action;
		resolveNote = '';
		resolveModalOpen = true;
	}

	async function confirmResolve() {
		if (!resolveProposal) return;
		resolveSubmitting = true;

		const { error } = await supabase
			.from('rule_proposals')
			.update({
				status: resolveAction,
				resolution_note: resolveNote.trim() || null,
				resolved_by: $user?.id,
				resolved_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', resolveProposal.id);

		if (error) {
			showToast('error', error.message);
		} else {
			proposals = proposals.map((p: any) =>
				p.id === resolveProposal.id ? { ...p, status: resolveAction, resolution_note: resolveNote.trim() || null } : p
			);
			showToast('success', `Proposal ${resolveAction}.`);
			resolveModalOpen = false;
		}
		resolveSubmitting = false;
	}

	// ── Helpers ──────────────────────────────────────────────────────────
	function voteTotal(p: any) { return (p.votes_agree || 0) + (p.votes_disagree || 0) + (p.votes_neutral || 0); }
	function votePercent(p: any, type: string) {
		const total = voteTotal(p);
		if (!total) return 0;
		return Math.round(((p[`votes_${type}`] || 0) / total) * 100);
	}
</script>

<svelte:head><title>Rules Discussion — {game.game_name}</title></svelte:head>

{#if toast}
	<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
{/if}

<!-- Committee Header -->
<div class="card card--compact">
	<div class="committee-header">
		<div class="committee-header__info">
			<h2>Rules Committee</h2>
			<p class="muted">{members.length} member{members.length !== 1 ? 's' : ''}{editor ? ` · Editor: ${editor.display_name}` : ''}</p>
		</div>
		<div class="committee-header__actions">
			{#if $user && !isMember}
				<button class="btn btn--accent btn--small" onclick={joinCommittee} disabled={joining}>{joining ? 'Joining...' : '✋ Join Committee'}</button>
			{:else if $user && isMember}
				<span class="committee-badge">{isEditor ? '✏️ Editor' : '👤 Member'}</span>
				<button class="btn btn--small btn--outline" onclick={leaveCommittee}>Leave</button>
			{:else}
				<span class="muted"><a href={localizeHref('/sign-in')}>Sign in</a> to join</span>
			{/if}
		</div>
	</div>

	<!-- Member avatars -->
	{#if members.length > 0}
		<div class="member-row">
			{#each members as m}
				<a href={m.runner_id ? localizeHref(`/runners/${m.runner_id}`) : '#'} class="member-chip" title="{m.display_name}{m.role === 'editor' ? ' (Editor)' : ''}">
					{#if m.avatar_url}
						<img class="member-chip__avatar" src={m.avatar_url} alt="" />
					{:else}
						<span class="member-chip__initial">{(m.display_name || '?')[0]}</span>
					{/if}
					<span class="member-chip__name">{m.display_name}</span>
					{#if m.role === 'editor'}<span class="member-chip__badge">✏️</span>{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

<!-- Proposals -->
<div class="card card--compact mt-section">
	<div class="proposals-header">
		<h2>Proposals</h2>
		{#if isMember}
			<button class="btn btn--accent btn--small" onclick={() => showProposalForm = !showProposalForm}>
				{showProposalForm ? '✕ Cancel' : '+ New Proposal'}
			</button>
		{/if}
	</div>

	<!-- New proposal form -->
	{#if showProposalForm && isMember}
		<div class="proposal-form">
			<input class="proposal-form__title" bind:value={proposalTitle} placeholder="Proposal title (e.g. 'Clarify hitless definition for shields')" maxlength="200" />
			<textarea class="proposal-form__body" bind:value={proposalBody} rows="4" placeholder="What rule should change, and why? Be specific." maxlength="2000"></textarea>
			<div class="proposal-form__actions">
				<button class="btn btn--accent btn--small" onclick={submitProposal} disabled={proposalSubmitting || !proposalTitle.trim() || !proposalBody.trim()}>
					{proposalSubmitting ? 'Submitting...' : 'Submit Proposal'}
				</button>
				<span class="muted" style="font-size: 0.78rem;">{proposalBody.length}/2000</span>
			</div>
		</div>
	{/if}

	<!-- Filter tabs -->
	<div class="proposal-filters">
		<button class="filter-tab" class:active={statusFilter === 'open'} onclick={() => statusFilter = 'open'}>Open ({proposals.filter((p) => p.status === 'open').length})</button>
		<button class="filter-tab" class:active={statusFilter === 'accepted'} onclick={() => statusFilter = 'accepted'}>Accepted ({proposals.filter((p) => p.status === 'accepted').length})</button>
		<button class="filter-tab" class:active={statusFilter === 'rejected'} onclick={() => statusFilter = 'rejected'}>Rejected ({proposals.filter((p) => p.status === 'rejected').length})</button>
		<button class="filter-tab" class:active={statusFilter === 'all'} onclick={() => statusFilter = 'all'}>All ({proposals.length})</button>
	</div>

	<!-- Proposal list -->
	{#if filteredProposals.length === 0}
		<div class="empty-state">
			{#if statusFilter === 'open'}
				No open proposals. {isMember ? 'Be the first to propose a rule change!' : 'Join the committee to propose changes.'}
			{:else}
				No {statusFilter} proposals.
			{/if}
		</div>
	{:else}
		<div class="proposal-list">
			{#each filteredProposals as p}
				<div class="proposal-card proposal-card--{p.status}">
					<div class="proposal-card__header">
						<span class="proposal-card__status proposal-card__status--{p.status}">{p.status}</span>
						<h3 class="proposal-card__title">{p.title}</h3>
					</div>
					<p class="proposal-card__body">{p.body}</p>
					<div class="proposal-card__meta muted">
						{p.display_name} · {formatDate(p.created_at)}
						{#if p.resolution_note}
							<span class="proposal-card__resolution">— {p.resolution_note}</span>
						{/if}
					</div>

					<!-- Vote bar -->
					{#if voteTotal(p) > 0}
						<div class="vote-bar">
							{#if p.votes_agree}<div class="vote-bar__segment vote-bar__segment--agree" style="width:{votePercent(p, 'agree')}%"></div>{/if}
							{#if p.votes_neutral}<div class="vote-bar__segment vote-bar__segment--neutral" style="width:{votePercent(p, 'neutral')}%"></div>{/if}
							{#if p.votes_disagree}<div class="vote-bar__segment vote-bar__segment--disagree" style="width:{votePercent(p, 'disagree')}%"></div>{/if}
						</div>
						<div class="vote-counts muted">
							👍 {p.votes_agree || 0} · 🤷 {p.votes_neutral || 0} · 👎 {p.votes_disagree || 0}
						</div>
					{/if}

					<!-- Actions -->
					<div class="proposal-card__actions">
						{#if p.status === 'open' && isMember}
							<button class="vote-btn" class:vote-btn--active={userVotes[p.id] === 'agree'} onclick={() => vote(p.id, 'agree')}><ThumbsUp size={14} /></button>
							<button class="vote-btn" class:vote-btn--active={userVotes[p.id] === 'neutral'} onclick={() => vote(p.id, 'neutral')}>🤷</button>
							<button class="vote-btn" class:vote-btn--active={userVotes[p.id] === 'disagree'} onclick={() => vote(p.id, 'disagree')}><ThumbsDown size={14} /></button>
						{/if}
						<button class="btn btn--small btn--outline" onclick={() => toggleComments(p.id)}>
							💬 {p.comment_count || 0}
						</button>
						{#if p.status === 'open' && p.user_id === $user?.id}
							<button class="btn btn--small btn--outline" onclick={() => withdrawProposal(p.id)}>Withdraw</button>
						{/if}
						{#if p.status === 'open' && (isEditor || isAdmin)}
							<button class="btn btn--small btn--approve" onclick={() => openResolveModal(p, 'accepted')}>✅ Accept</button>
							<button class="btn btn--small btn--reject" onclick={() => openResolveModal(p, 'rejected')}>❌ Reject</button>
						{/if}
					</div>

					<!-- Comments (expanded) -->
					{#if expandedId === p.id}
						<div class="comments-section">
							{#if commentsLoading}
								<p class="muted">Loading comments...</p>
							{:else}
								{#each comments as c}
									<div class="comment">
										<div class="comment__header">
											<span class="comment__author">{c.display_name}</span>
											<span class="comment__date muted">{formatDate(c.created_at)}</span>
											{#if c.user_id === $user?.id}
												<button class="comment__delete" onclick={() => deleteComment(c.id)}><X size={14} /></button>
											{/if}
										</div>
										<p class="comment__body">{c.body}</p>
									</div>
								{/each}
								{#if comments.length === 0}
									<p class="muted">No comments yet.</p>
								{/if}
								{#if isMember}
									<div class="comment-form">
										<textarea class="comment-form__input" bind:value={commentText} rows="2" placeholder="Add a comment..." maxlength="1000"></textarea>
										<button class="btn btn--small btn--accent" onclick={submitComment} disabled={commentSubmitting || !commentText.trim()}>
											{commentSubmitting ? '...' : 'Post'}
										</button>
									</div>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Resolution Modal -->
{#if resolveModalOpen && resolveProposal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" onclick={() => resolveModalOpen = false}></div>
	<div class="modal">
		<div class="modal__header">
			<h3>{resolveAction === 'accepted' ? 'Accept' : 'Reject'} Proposal</h3>
			<button class="modal__close" onclick={() => resolveModalOpen = false}>&times;</button>
		</div>
		<div class="modal__body">
			<p class="muted mb-1"><strong>{resolveProposal.title}</strong></p>
			<label class="modal__label">Resolution note (visible to everyone):</label>
			<textarea class="modal__textarea" bind:value={resolveNote} rows="3" placeholder="Why was this accepted/rejected?"></textarea>
		</div>
		<div class="modal__actions">
			<button class="btn btn--save" onclick={confirmResolve} disabled={resolveSubmitting}>{resolveSubmitting ? '...' : 'Confirm'}</button>
			<button class="btn btn--reset" onclick={() => resolveModalOpen = false}>Cancel</button>
		</div>
	</div>
{/if}

<style>
	.disc-toast { padding: 0.6rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.disc-toast--success { background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); color: #28a745; }
	.disc-toast--error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); color: #dc3545; }

	/* Committee header */
	.committee-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.committee-header h2 { margin: 0; font-size: 1.15rem; }
	.committee-header__actions { display: flex; align-items: center; gap: 0.5rem; }
	.committee-badge { font-size: 0.82rem; padding: 0.2rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }

	/* Member row */
	.member-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.member-chip { display: flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 20px; text-decoration: none; color: var(--fg); font-size: 0.82rem; }
	.member-chip:hover { border-color: var(--accent); }
	.member-chip__avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
	.member-chip__initial { width: 22px; height: 22px; border-radius: 50%; background: var(--surface); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; }
	.member-chip__name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.member-chip__badge { font-size: 0.75rem; }

	/* Proposals */
	.mt-section { margin-top: 1rem; }
	.proposals-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
	.proposals-header h2 { margin: 0; font-size: 1.15rem; }

	/* Proposal form */
	.proposal-form { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; }
	.proposal-form__title { width: 100%; padding: 0.5rem 0.7rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9rem; margin-bottom: 0.5rem; box-sizing: border-box; }
	.proposal-form__body { width: 100%; padding: 0.5rem 0.7rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9rem; resize: vertical; box-sizing: border-box; }
	.proposal-form__title:focus, .proposal-form__body:focus { outline: none; border-color: var(--accent); }
	.proposal-form__actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }

	/* Filter tabs */
	.proposal-filters { display: flex; gap: 0.25rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.filter-tab { padding: 0.35rem 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--fg); font-size: 0.8rem; cursor: pointer; font-family: inherit; }
	.filter-tab:hover { background: rgba(255,255,255,0.05); }
	.filter-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }

	.empty-state { text-align: center; padding: 2rem; color: var(--muted); font-size: 0.9rem; }

	/* Proposal cards */
	.proposal-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.proposal-card { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.proposal-card--accepted { border-left: 3px solid #28a745; }
	.proposal-card--rejected { border-left: 3px solid #dc3545; opacity: 0.7; }
	.proposal-card--withdrawn { opacity: 0.5; }
	.proposal-card__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
	.proposal-card__status { font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: 3px; font-weight: 600; text-transform: uppercase; }
	.proposal-card__status--open { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.proposal-card__status--accepted { background: rgba(40, 167, 69, 0.15); color: #28a745; }
	.proposal-card__status--rejected { background: rgba(220, 53, 69, 0.15); color: #dc3545; }
	.proposal-card__status--withdrawn { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }
	.proposal-card__title { margin: 0; font-size: 1rem; }
	.proposal-card__body { font-size: 0.9rem; line-height: 1.5; margin-bottom: 0.35rem; white-space: pre-wrap; }
	.proposal-card__meta { font-size: 0.78rem; margin-bottom: 0.5rem; }
	.proposal-card__resolution { font-style: italic; }

	/* Vote bar */
	.vote-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 0.25rem; }
	.vote-bar__segment--agree { background: #28a745; }
	.vote-bar__segment--neutral { background: #6b7280; }
	.vote-bar__segment--disagree { background: #dc3545; }
	.vote-counts { font-size: 0.78rem; margin-bottom: 0.5rem; }

	/* Vote + action buttons */
	.proposal-card__actions { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
	.vote-btn { padding: 0.3rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; cursor: pointer; font-size: 0.9rem; }
	.vote-btn:hover { background: rgba(255,255,255,0.08); }
	.vote-btn--active { border-color: var(--accent); background: rgba(99, 102, 241, 0.15); }

	.btn--approve { background: #28a745; color: white; border-color: #28a745; }
	.btn--reject { background: #dc3545; color: white; border-color: #dc3545; }
	.btn--outline { background: transparent; border: 1px solid var(--border); }

	/* Comments */
	.comments-section { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.comment { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
	.comment:last-of-type { border-bottom: none; }
	.comment__header { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.2rem; }
	.comment__author { font-weight: 600; font-size: 0.85rem; }
	.comment__date { font-size: 0.75rem; }
	.comment__delete { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 0; margin-left: auto; }
	.comment__delete:hover { color: #dc3545; }
	.comment__body { font-size: 0.88rem; line-height: 1.5; margin: 0; }

	.comment-form { margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: flex-end; }
	.comment-form__input { flex: 1; padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.85rem; resize: vertical; box-sizing: border-box; }
	.comment-form__input:focus { outline: none; border-color: var(--accent); }

	/* Modal */
	.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 101; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem; width: 90%; max-width: 500px; }
	.modal__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
	.modal__header h3 { margin: 0; font-size: 1.1rem; }
	.modal__close { background: none; border: none; color: var(--muted); font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1; }
	.modal__label { display: block; font-weight: 600; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.3rem; }
	.modal__textarea { width: 100%; padding: 0.5rem 0.7rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9rem; resize: vertical; box-sizing: border-box; }
	.modal__textarea:focus { outline: none; border-color: var(--accent); }
	.modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
	.mb-1 { margin-bottom: 0.5rem; }
	.muted { color: var(--muted); }
</style>
