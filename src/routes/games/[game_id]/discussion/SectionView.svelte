<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { extractItems, groupLabel, type SectionId, type SectionConsensus, type ItemConsensus } from './consensus';

	let {
		section,
		game,
		drafts,
		votes,
		comments,
		consensus,
		userId,
		isMember,
		isEditor,
		isAdmin,
		myDraft,
		publishing,
		onVote,
		onOpenEditor,
		onWithdraw,
		onForkDraft,
		onPublish,
		onCompare,
		onPostComment,
		onDeleteComment
	}: {
		section: SectionId;
		game: any;
		drafts: any[];
		votes: any[];
		comments: any[];
		consensus: SectionConsensus;
		userId: string | null;
		isMember: boolean;
		isEditor: boolean;
		isAdmin: boolean;
		myDraft: any;
		publishing: boolean;
		onVote: (draftId: string, section: SectionId, itemSlug: string | null) => void;
		onOpenEditor: () => void;
		onWithdraw: (draftId: string) => void;
		onForkDraft: (draft: any) => void;
		onPublish: (section: SectionId) => void;
		onCompare: () => void;
		onPostComment: (body: string, draftId?: string, itemSlug?: string) => Promise<any>;
		onDeleteComment: (id: string) => void;
	} = $props();

	let expandedDraftId = $state<string | null>(null);
	let commentText = $state('');
	let commentSubmitting = $state(false);

	// ── Helpers ──────────────────────────────────────────────────────────

	function getUserVoteForScope(itemSlug: string | null): string | null {
		if (!userId) return null;
		const coalesced = itemSlug || '__section__';
		const vote = votes.find((v: any) =>
			v.user_id === userId &&
			(v.item_slug || '__section__') === coalesced
		);
		return vote?.draft_id || null;
	}

	function getVoteCountForDraft(draftId: string, itemSlug: string | null): number {
		const coalesced = itemSlug || '__section__';
		return votes.filter((v: any) =>
			v.draft_id === draftId &&
			(v.item_slug || '__section__') === coalesced
		).length;
	}

	function getTotalVotesForScope(itemSlug: string | null): number {
		const coalesced = itemSlug || '__section__';
		return votes.filter((v: any) =>
			(v.item_slug || '__section__') === coalesced
		).length;
	}

	/** Get items from a draft's data */
	function getDraftItems(draft: any): { slug: string; label: string; group: string; description?: string }[] {
		return extractItems(draft.data, section).map(i => ({
			slug: i.slug,
			label: i.label,
			group: i.group,
			description: i.data?.description || ''
		}));
	}

	/** Get all unique slugs across all drafts */
	const allSlugs = $derived.by(() => {
		const slugMap = new Map<string, { label: string; group: string }>();
		for (const d of drafts) {
			for (const item of getDraftItems(d)) {
				if (!slugMap.has(item.slug)) {
					slugMap.set(item.slug, { label: item.label, group: item.group });
				}
			}
		}
		return slugMap;
	});

	/** Section has items (not 'rules') */
	const hasItems = $derived(section !== 'rules' && allSlugs.size > 0);

	/** Get item consensus by slug */
	function getItemConsensus(slug: string): ItemConsensus | undefined {
		return consensus.items.find(i => i.slug === slug);
	}

	async function handlePostComment() {
		if (!commentText.trim()) return;
		commentSubmitting = true;
		await onPostComment(commentText.trim());
		commentText = '';
		commentSubmitting = false;
	}

	/** Render rules preview safely */
	function renderRules(text: string): string {
		if (!text?.trim()) return '<p class="muted">No content.</p>';
		return renderMarkdown(text);
	}

	/** Get current game data shaped for extractItems */
	function getCurrentData(): any {
		switch (section) {
			case 'categories':
				return { full_runs: game.full_runs || [], mini_challenges: game.mini_challenges || [], player_made: game.player_made || [] };
			case 'challenges':
				return { challenges_data: game.challenges_data || [], glitches_data: game.glitches_data || [] };
			case 'restrictions':
				return { restrictions_data: game.restrictions_data || [] };
			case 'characters':
				return { characters_data: game.characters_data || [] };
			case 'difficulties':
				return { difficulties_data: game.difficulties_data || [] };
			case 'achievements':
				return { community_achievements: game.community_achievements || [] };
			default:
				return {};
		}
	}
</script>

<div class="section-view">

	<!-- ═══ Current Approved Data ═════════════════════════════════════════ -->
	<details class="approved-panel" open>
		<summary class="approved-panel__header">
			<span>📋 Current Approved Rules</span>
			<span class="approved-panel__hint">What's currently live on the site</span>
		</summary>
		<div class="approved-panel__body">
			{#if section === 'rules'}
				{#if game.general_rules?.trim()}
					<div class="markdown-body">{@html renderRules(game.general_rules)}</div>
				{:else}
					<p class="muted">No rules defined yet.</p>
				{/if}
			{:else}
				{@const currentItems = extractItems(getCurrentData(), section)}
				{#if currentItems.length > 0}
					<div class="item-chips">
						{#each currentItems as item}
							<div class="item-chip">
								<span class="item-chip__label">{item.label}</span>
								<span class="item-chip__group">{groupLabel(item.group)}</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="muted">No items defined yet for this section.</p>
				{/if}
			{/if}
		</div>
	</details>

	<!-- ═══ Consensus Summary ═════════════════════════════════════════════ -->
	{#if drafts.length > 1 && hasItems}
		<div class="consensus-panel">
			<h3 class="consensus-panel__title">
				{#if consensus.status === 'consensus'}
					✅ Consensus Reached
				{:else}
					⚡ {consensus.conflictCount} Conflict{consensus.conflictCount !== 1 ? 's' : ''} · {consensus.agreedCount} Agreed
				{/if}
			</h3>
			<div class="consensus-items">
				{#each consensus.items as item}
					<div class="consensus-item" class:consensus-item--agreed={item.status === 'agreed'} class:consensus-item--conflict={item.status === 'conflict'}>
						<span class="consensus-item__icon">{item.status === 'agreed' ? '✓' : '⚡'}</span>
						<span class="consensus-item__label">{item.label}</span>
						<span class="consensus-item__group">{groupLabel(item.group)}</span>
						{#if item.totalVotes > 0}
							<span class="consensus-item__votes">
								{#each Object.entries(item.votes) as [draftId, count]}
									{@const draft = drafts.find((d: any) => d.id === draftId)}
									<span class="vote-chip" class:vote-chip--winning={item.winningDraftId === draftId}>
										{draft?.display_name || '?'}: {count}
									</span>
								{/each}
							</span>
						{/if}
					</div>
				{/each}
			</div>
			{#if (isEditor || isAdmin) && (consensus.status === 'consensus' || consensus.status === 'single-draft')}
				<div class="publish-bar">
					<button class="btn btn--save" onclick={() => onPublish(section)} disabled={publishing}>
						{publishing ? 'Publishing...' : '🚀 Publish Consensus to Live Game'}
					</button>
					<p class="muted small">Updates the actual game data with the winning versions.</p>
				</div>
			{/if}
		</div>
		<div class="consensus-panel">
			<h3 class="consensus-panel__title">
				{#if consensus.winningDraftId}
					✅ Consensus — {drafts.find((d: any) => d.id === consensus.winningDraftId)?.display_name}'s version leads
				{:else}
					⚡ Split votes — no majority yet
				{/if}
			</h3>
			{#if (isEditor || isAdmin) && consensus.winningDraftId}
				<div class="publish-bar">
					<button class="btn btn--save" onclick={() => onPublish(section)} disabled={publishing}>
						{publishing ? 'Publishing...' : '🚀 Publish Consensus to Live Game'}
					</button>
					<p class="muted small">Updates the actual game data with the winning version.</p>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Single draft publish (no consensus panel needed) -->
	{#if drafts.length === 1 && (isEditor || isAdmin)}
		<div class="consensus-panel">
			<h3 class="consensus-panel__title">📋 One Draft Submitted</h3>
			<p class="muted small" style="margin: 0.25rem 0 0;">By {drafts[0].display_name}. As the editor, you can publish this directly.</p>
			<div class="publish-bar">
				<button class="btn btn--save" onclick={() => onPublish(section)} disabled={publishing}>
					{publishing ? 'Publishing...' : '🚀 Publish to Live Game'}
				</button>
			</div>
		</div>
	{/if}

	<!-- ═══ Submitted Drafts ══════════════════════════════════════════════ -->
	<div class="drafts-section">
		<div class="drafts-header">
			<h3>Submitted Drafts ({drafts.length})</h3>
			<div class="drafts-header__actions">
				{#if drafts.length >= 2}
					<button class="btn btn--small btn--outline" onclick={onCompare}>🔍 Compare All</button>
				{/if}
				{#if isMember}
					<button class="btn btn--small btn--accent" onclick={onOpenEditor}>
						{myDraft ? '✏️ Edit Your Draft' : '➕ Submit Draft'}
					</button>
				{:else if !userId}
					<span class="muted small">Sign in to participate</span>
				{:else}
					<span class="muted small">Join the committee to submit drafts</span>
				{/if}
			</div>
		</div>

		{#if drafts.length === 0}
			<div class="empty-state">
				<p>No drafts submitted yet for this section.</p>
				{#if isMember}
					<p class="muted">Be the first to propose your version!</p>
				{/if}
			</div>
		{:else}
			<div class="draft-list">
				{#each drafts as draft}
					{@const isOwn = draft.user_id === userId}
					{@const sectionVoteCount = getVoteCountForDraft(draft.id, null)}
					{@const userSectionVote = getUserVoteForScope(null)}
					{@const isExpanded = expandedDraftId === draft.id}

					<div class="draft-card" class:draft-card--own={isOwn} class:draft-card--voted={userSectionVote === draft.id}>
						<div class="draft-card__header">
							<div class="draft-card__author">
								{#if draft.avatar_url}
									<img class="draft-card__avatar" src={draft.avatar_url} alt="" />
								{/if}
								<strong>{draft.display_name}</strong>
								{#if isOwn}<span class="badge badge--you">You</span>{/if}
							</div>
							<div class="draft-card__meta">
								<span class="muted">{formatDate(draft.updated_at || draft.created_at)}</span>
							</div>
						</div>

						{#if draft.title}
							<p class="draft-card__title">{draft.title}</p>
						{/if}
						{#if draft.notes}
							<p class="draft-card__notes">{draft.notes}</p>
						{/if}

						<!-- Section-level voting -->
						<div class="draft-card__voting">
							{#if isMember}
								<button
									class="vote-btn"
									class:vote-btn--active={userSectionVote === draft.id}
									onclick={() => onVote(draft.id, section, null)}
								>
									👍 {sectionVoteCount} vote{sectionVoteCount !== 1 ? 's' : ''}
									{#if userSectionVote === draft.id}(your vote){/if}
								</button>
							{:else}
								<span class="vote-count">👍 {sectionVoteCount} vote{sectionVoteCount !== 1 ? 's' : ''}</span>
							{/if}

							<button class="btn btn--small btn--outline" onclick={() => { expandedDraftId = isExpanded ? null : draft.id; }}>
								{isExpanded ? 'Collapse' : 'View Details'}
							</button>

							{#if isOwn}
								<button class="btn btn--small btn--outline btn--danger-text" onclick={() => onWithdraw(draft.id)}>Withdraw</button>
							{:else if isMember}
								<button class="btn btn--small btn--outline" onclick={() => onForkDraft(draft)} title="Start your draft based on this one">🔀 Fork</button>
							{/if}
						</div>

						<!-- Expanded view: show items + item-level voting -->
						{#if isExpanded}
							<div class="draft-details">
								{#if section === 'rules'}
									<div class="draft-preview markdown-body">
										{@html renderRules(draft.data?.general_rules || '')}
									</div>
								{:else}
									{@const items = getDraftItems(draft)}
									{#if items.length === 0}
										<p class="muted">No items in this draft.</p>
									{:else}
										{@const groups = [...new Set(items.map(i => i.group))]}
										{#each groups as grp}
											<div class="draft-group">
												<h4 class="draft-group__title">{groupLabel(grp)}</h4>
												{#each items.filter(i => i.group === grp) as item}
													{@const itemVoteCount = getVoteCountForDraft(draft.id, item.slug)}
													{@const userItemVote = getUserVoteForScope(item.slug)}
													{@const ic = getItemConsensus(item.slug)}

													<div class="draft-item" class:draft-item--agreed={ic?.status === 'agreed' && ic.winningDraftId === draft.id} class:draft-item--conflict={ic?.status === 'conflict'}>
														<div class="draft-item__content">
															<span class="draft-item__label">{item.label}</span>
															<span class="draft-item__slug">({item.slug})</span>
															{#if item.description}
																<p class="draft-item__desc">{item.description}</p>
															{/if}
														</div>
														{#if isMember && drafts.length > 1}
															<button
																class="vote-btn vote-btn--small"
																class:vote-btn--active={userItemVote === draft.id}
																onclick={() => onVote(draft.id, section, item.slug)}
																title="Vote for this specific item from this draft"
															>
																👍 {itemVoteCount}
															</button>
														{/if}
													</div>
												{/each}
											</div>
										{/each}
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- ═══ Comments ══════════════════════════════════════════════════════ -->
	<div class="comments-section">
		<h3>Discussion ({comments.length})</h3>
		{#each comments as c}
			<div class="comment">
				<div class="comment__header">
					<strong class="comment__author">{c.display_name}</strong>
					<span class="comment__date muted">{formatDate(c.created_at)}</span>
					{#if c.user_id === userId}
						<button class="comment__delete" onclick={() => onDeleteComment(c.id)}>&times;</button>
					{/if}
				</div>
				<p class="comment__body">{c.body}</p>
			</div>
		{/each}
		{#if comments.length === 0}
			<p class="muted small">No comments yet.</p>
		{/if}
		{#if isMember}
			<div class="comment-form">
				<textarea class="comment-form__input" bind:value={commentText} rows="2" placeholder="Add to the discussion..." maxlength="2000"></textarea>
				<button class="btn btn--small btn--accent" onclick={handlePostComment} disabled={commentSubmitting || !commentText.trim()}>
					{commentSubmitting ? '...' : 'Post'}
				</button>
			</div>
		{/if}
	</div>
</div>



<style>
	.section-view { display: flex; flex-direction: column; gap: 1rem; }

	/* Approved panel */
	.approved-panel { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.approved-panel__header { padding: 0.75rem 1rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 0.95rem; list-style: none; }
	.approved-panel__header::-webkit-details-marker { display: none; }
	.approved-panel__hint { font-weight: 400; font-size: 0.78rem; color: var(--muted); }
	.approved-panel__body { padding: 0 1rem 1rem; }
	.item-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.item-chip { padding: 0.3rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; font-size: 0.82rem; }
	.item-chip__label { font-weight: 600; }
	.item-chip__group { color: var(--muted); font-size: 0.75rem; margin-left: 0.3rem; }

	/* Consensus panel */
	.consensus-panel { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.consensus-panel__title { margin: 0 0 0.5rem; font-size: 1rem; }
	.consensus-items { display: flex; flex-direction: column; gap: 0.35rem; }
	.consensus-item { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem; border-radius: 5px; font-size: 0.85rem; }
	.consensus-item--agreed { background: rgba(40, 167, 69, 0.06); }
	.consensus-item--conflict { background: rgba(245, 158, 11, 0.06); }
	.consensus-item__icon { font-size: 0.8rem; }
	.consensus-item__label { font-weight: 600; }
	.consensus-item__group { color: var(--muted); font-size: 0.75rem; }
	.consensus-item__votes { margin-left: auto; display: flex; gap: 0.3rem; }
	.vote-chip { font-size: 0.72rem; padding: 0.1rem 0.4rem; background: var(--surface); border: 1px solid var(--border); border-radius: 3px; }
	.vote-chip--winning { border-color: #28a745; color: #28a745; }

	/* Drafts section */
	.drafts-section { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
	.drafts-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
	.drafts-header h3 { margin: 0; font-size: 1.05rem; }
	.empty-state { text-align: center; padding: 1.5rem; color: var(--muted); }

	/* Draft cards */
	.draft-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.draft-card { padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.draft-card--own { border-left: 3px solid var(--accent); }
	.draft-card--voted { border-left: 3px solid #28a745; }
	.draft-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
	.draft-card__author { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
	.draft-card__avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
	.draft-card__meta { font-size: 0.78rem; }
	.draft-card__title { font-weight: 600; margin: 0.25rem 0; font-size: 0.95rem; }
	.draft-card__notes { color: var(--muted); font-size: 0.85rem; margin: 0.25rem 0 0.5rem; line-height: 1.4; }

	.draft-card__voting { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }

	.badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px; }
	.badge--you { background: rgba(99, 102, 241, 0.15); color: var(--accent); }

	/* Vote buttons */
	.vote-btn { padding: 0.3rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; cursor: pointer; font-size: 0.82rem; font-family: inherit; transition: all 0.15s; }
	.vote-btn:hover { background: rgba(255,255,255,0.06); }
	.vote-btn--active { border-color: #28a745; background: rgba(40, 167, 69, 0.1); color: #28a745; }
	.vote-btn--small { padding: 0.2rem 0.4rem; font-size: 0.78rem; }
	.vote-count { font-size: 0.82rem; color: var(--muted); }

	/* Draft details (expanded) */
	.draft-details { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.draft-preview { font-size: 0.9rem; max-height: 400px; overflow-y: auto; padding: 0.5rem; background: var(--bg); border-radius: 6px; }
	.draft-group { margin-bottom: 0.75rem; }
	.draft-group__title { font-size: 0.85rem; color: var(--muted); margin: 0 0 0.4rem; text-transform: uppercase; letter-spacing: 0.03em; }
	.draft-item { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 5px; margin-bottom: 0.25rem; }
	.draft-item--agreed { background: rgba(40, 167, 69, 0.05); }
	.draft-item--conflict { background: rgba(245, 158, 11, 0.05); }
	.draft-item__content { flex: 1; min-width: 0; }
	.draft-item__label { font-weight: 600; font-size: 0.9rem; }
	.draft-item__slug { color: var(--muted); font-size: 0.78rem; }
	.draft-item__desc { font-size: 0.82rem; color: var(--muted); margin: 0.15rem 0 0; line-height: 1.4; }

	/* Comments */
	.comments-section { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
	.comments-section h3 { margin: 0 0 0.75rem; font-size: 1.05rem; }
	.comment { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
	.comment:last-of-type { border-bottom: none; }
	.comment__header { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.2rem; }
	.comment__author { font-size: 0.85rem; }
	.comment__date { font-size: 0.75rem; }
	.comment__delete { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 1rem; padding: 0; margin-left: auto; line-height: 1; }
	.comment__delete:hover { color: #dc3545; }
	.comment__body { font-size: 0.88rem; line-height: 1.5; margin: 0; }
	.comment-form { margin-top: 0.75rem; display: flex; gap: 0.5rem; align-items: flex-end; }
	.comment-form__input { flex: 1; padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.85rem; resize: vertical; box-sizing: border-box; }
	.comment-form__input:focus { outline: none; border-color: var(--accent); }

	.btn--danger-text { color: #dc3545; }
	.btn--danger-text:hover { background: rgba(220, 53, 69, 0.08); }
	.btn--outline { background: transparent; border: 1px solid var(--border); }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }

	/* Publish bar */
	.publish-bar { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.publish-bar .muted { margin: 0; }

	/* Drafts header */
	.drafts-header__actions { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
</style>
