<script lang="ts">
	import { formatDate } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { extractItems, groupLabel, type SectionId, type SectionConsensus, type ItemConsensus } from '../../consensus';
	import * as Accordion from '$lib/components/ui/accordion';

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
		memberCount,
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
		memberCount: number;
		onVote: (draftId: string, section: SectionId, itemSlug: string | null) => void;
		onOpenEditor: () => void;
		onWithdraw: (draftId: string) => void;
		onForkDraft: (draft: any) => void;
		onPublish: (section: SectionId) => void;
		onCompare: () => void;
		onPostComment: (body: string, draftId?: string, itemSlug?: string) => Promise<any>;
		onDeleteComment: (id: string) => void;
	} = $props();

	let commentText = $state('');
	let commentSubmitting = $state(false);

	// ── Publish threshold ────────────────────────────────────────────────
	const requiredVotes = $derived(Math.ceil(memberCount / 2));
	const winningVoteCount = $derived.by(() => {
		if (!consensus.winningDraftId) return 0;
		return consensus.sectionVotes[consensus.winningDraftId] || 0;
	});
	const canPublish = $derived(
		(isEditor || isAdmin) &&
		winningVoteCount >= requiredVotes &&
		requiredVotes >= 2
	);

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

	function getDraftItems(draft: any): { slug: string; label: string; group: string; description?: string; parentSlug: string | null; isParent: boolean; childSlugs: string[] }[] {
		return extractItems(draft.data, section).map(i => ({
			slug: i.slug,
			label: i.label,
			group: i.group,
			description: i.data?.description || '',
			parentSlug: i.parentSlug,
			isParent: i.isParent,
			childSlugs: i.childSlugs
		}));
	}

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

	const hasItems = $derived(section !== 'rules' && section !== 'overview' && allSlugs.size > 0);

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

	function renderRules(text: string): string {
		if (!text?.trim()) return '<p class="muted">No content.</p>';
		return renderMarkdown(text);
	}

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
	<Accordion.Root type="multiple" value={['approved']}>
		<Accordion.Item value="approved">
			<Accordion.Trigger>
				<span class="thread-row">
					<span class="thread-row__icon">📋</span>
					<span class="thread-row__label">Current Approved Rules</span>
					<span class="thread-row__meta">What's currently live on the site</span>
				</span>
			</Accordion.Trigger>
			<Accordion.Content>
				<div class="approved-body">
					{#if section === 'rules'}
						{#if game.general_rules?.trim()}
							<div class="markdown-body">{@html renderRules(game.general_rules)}</div>
						{:else}
							<p class="muted">No rules defined yet.</p>
						{/if}
					{:else if section === 'overview'}
						{#if game.content?.trim()}
							<div class="markdown-body">{@html renderRules(game.content)}</div>
						{:else}
							<p class="muted">No game description yet.</p>
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
			</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>

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
					<div class="consensus-item" class:consensus-item--agreed={item.status === 'agreed'} class:consensus-item--conflict={item.status === 'conflict'} class:consensus-item--child={!!item.parentSlug}>
						<span class="consensus-item__icon">{item.status === 'agreed' ? '✓' : '⚡'}</span>
						<span class="consensus-item__label">
							{item.label}
							{#if item.isParent}<span class="consensus-item__parent-tag">group</span>{/if}
						</span>
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
			{#if canPublish}
				<div class="publish-bar">
					<button class="btn btn--save" onclick={() => onPublish(section)} disabled={publishing}>
						{publishing ? 'Publishing...' : '🚀 Publish Consensus to Live Game'}
					</button>
					<p class="muted small">Updates the actual game data with the winning versions.</p>
				</div>
			{:else if (isEditor || isAdmin) && (consensus.status === 'consensus' || consensus.status === 'single-draft')}
				<div class="publish-bar publish-bar--locked">
					<p class="muted small">🔒 Needs {requiredVotes} vote{requiredVotes !== 1 ? 's' : ''} from committee members to publish ({winningVoteCount}/{requiredVotes}).</p>
				</div>
			{/if}
		</div>
	{:else if drafts.length > 1 && !hasItems}
		<div class="consensus-panel">
			<h3 class="consensus-panel__title">
				{#if consensus.winningDraftId}
					✅ Consensus — {drafts.find((d: any) => d.id === consensus.winningDraftId)?.display_name}'s version leads
				{:else}
					⚡ Split votes — no majority yet
				{/if}
			</h3>
			{#if canPublish}
				<div class="publish-bar">
					<button class="btn btn--save" onclick={() => onPublish(section)} disabled={publishing}>
						{publishing ? 'Publishing...' : '🚀 Publish Consensus to Live Game'}
					</button>
					<p class="muted small">Updates the actual game data with the winning version.</p>
				</div>
			{:else if (isEditor || isAdmin) && consensus.winningDraftId}
				<div class="publish-bar publish-bar--locked">
					<p class="muted small">🔒 Needs {requiredVotes} vote{requiredVotes !== 1 ? 's' : ''} to publish ({winningVoteCount}/{requiredVotes}).</p>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Single draft publish -->
	{#if drafts.length === 1 && (isEditor || isAdmin)}
		<div class="consensus-panel">
			<h3 class="consensus-panel__title">📋 One Draft Submitted</h3>
			<p class="muted small" style="margin: 0.25rem 0 0;">By {drafts[0].display_name}.</p>
			{#if canPublish}
				<div class="publish-bar">
					<button class="btn btn--save" onclick={() => onPublish(section)} disabled={publishing}>
						{publishing ? 'Publishing...' : '🚀 Publish to Live Game'}
					</button>
				</div>
			{:else}
				<div class="publish-bar publish-bar--locked">
					<p class="muted small">🔒 Needs {requiredVotes} vote{requiredVotes !== 1 ? 's' : ''} from committee members to publish ({winningVoteCount}/{requiredVotes}).</p>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ═══ Submitted Drafts (Accordion Threads) ══════════════════════════ -->
	<div class="forum-block">
		<div class="forum-block__header">
			<h3>Submitted Drafts ({drafts.length})</h3>
			<div class="forum-block__actions">
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
			<Accordion.Root type="multiple">
				{#each drafts as draft}
					{@const isOwn = draft.user_id === userId}
					{@const sectionVoteCount = getVoteCountForDraft(draft.id, null)}
					{@const userSectionVote = getUserVoteForScope(null)}

					<Accordion.Item
						value={draft.id}
						class={isOwn ? 'forum-thread--own' : (userSectionVote === draft.id ? 'forum-thread--voted' : '')}
					>
						<Accordion.Trigger>
							<span class="draft-trigger">
								<span class="draft-trigger__author">
									{#if draft.avatar_url}
										<img class="draft-trigger__avatar" src={draft.avatar_url} alt="" />
									{/if}
									<strong>{draft.display_name}</strong>
									{#if isOwn}<span class="badge badge--you">You</span>{/if}
									{#if draft.title}
										<span class="draft-trigger__title-text">— {draft.title}</span>
									{/if}
								</span>
								<span class="draft-trigger__votes">👍 {sectionVoteCount}</span>
								<span class="draft-trigger__date">{formatDate(draft.updated_at || draft.created_at)}</span>
							</span>
						</Accordion.Trigger>
						<Accordion.Content>
							<div class="draft-body">
								{#if draft.notes}
									<p class="draft-body__notes">{draft.notes}</p>
								{/if}

								<!-- Section-level voting -->
								<div class="draft-body__voting">
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

									{#if isOwn}
										<button class="btn btn--small btn--outline btn--danger-text" onclick={() => onWithdraw(draft.id)}>Withdraw</button>
									{:else if isMember}
										<button class="btn btn--small btn--outline" onclick={() => onForkDraft(draft)} title="Start your draft based on this one">🔀 Fork</button>
									{/if}
								</div>

								<!-- Draft details -->
								<div class="draft-details">
									{#if section === 'rules'}
										<div class="draft-preview markdown-body">
											{@html renderRules(draft.data?.general_rules || '')}
										</div>
									{:else if section === 'overview'}
										<div class="draft-preview markdown-body">
											{@html renderRules(draft.data?.content || '')}
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
													{#each items.filter(i => i.group === grp && !i.parentSlug) as item}
														{@const itemVoteCount = getVoteCountForDraft(draft.id, item.slug)}
														{@const userItemVote = getUserVoteForScope(item.slug)}
														{@const ic = getItemConsensus(item.slug)}

														<div class="draft-item" class:draft-item--parent={item.isParent} class:draft-item--agreed={ic?.status === 'agreed' && ic.winningDraftId === draft.id} class:draft-item--conflict={ic?.status === 'conflict'}>
															<div class="draft-item__content">
																<span class="draft-item__label">{item.label}</span>
																<span class="draft-item__slug">({item.slug})</span>
																{#if item.isParent}
																	<span class="draft-item__parent-hint">· {item.childSlugs.length} sub-item{item.childSlugs.length !== 1 ? 's' : ''}</span>
																{/if}
																{#if item.description}
																	<p class="draft-item__desc">{item.description}</p>
																{/if}
															</div>
															{#if isMember && drafts.length > 1}
																<button
																	class="vote-btn vote-btn--small"
																	class:vote-btn--active={userItemVote === draft.id}
																	onclick={() => onVote(draft.id, section, item.slug)}
																	title={item.isParent ? 'Vote for this and all sub-items' : 'Vote for this item'}
																>
																	{item.isParent ? '👍 Vote all' : '👍'} {itemVoteCount}
																</button>
															{/if}
														</div>

														<!-- Children -->
														{#if item.isParent}
															{#each items.filter(c => c.parentSlug === item.slug) as child}
																{@const childVoteCount = getVoteCountForDraft(draft.id, child.slug)}
																{@const userChildVote = getUserVoteForScope(child.slug)}
																{@const childIc = getItemConsensus(child.slug)}

																<div class="draft-item draft-item--child" class:draft-item--agreed={childIc?.status === 'agreed' && childIc.winningDraftId === draft.id} class:draft-item--conflict={childIc?.status === 'conflict'}>
																	<div class="draft-item__content">
																		<span class="draft-item__label">{child.label}</span>
																		<span class="draft-item__slug">({child.slug})</span>
																		{#if child.description}
																			<p class="draft-item__desc">{child.description}</p>
																		{/if}
																	</div>
																	{#if isMember && drafts.length > 1}
																		<button
																			class="vote-btn vote-btn--small"
																			class:vote-btn--active={userChildVote === draft.id}
																			onclick={() => onVote(draft.id, section, child.slug)}
																			title="Vote for this sub-item (overrides parent vote)"
																		>
																			👍 {childVoteCount}
																		</button>
																	{/if}
																</div>
															{/each}
														{/if}
													{/each}
												</div>
											{/each}
										{/if}
									{/if}
								</div>
							</div>
						</Accordion.Content>
					</Accordion.Item>
				{/each}
			</Accordion.Root>
		{/if}
	</div>

	<!-- ═══ Comments ══════════════════════════════════════════════════════ -->
	<div class="forum-block">
		<h3 style="margin: 0 0 0.75rem; font-size: 1.05rem;">Discussion ({comments.length})</h3>
		<div class="comment-thread">
			{#each comments as c}
				<div class="comment-thread__item">
					<div class="comment-thread__header">
						<span class="comment-thread__author">{c.display_name}</span>
						<span class="comment-thread__date">{formatDate(c.created_at)}</span>
						{#if c.user_id === userId}
							<button class="comment-thread__delete" onclick={() => onDeleteComment(c.id)}>&times;</button>
						{/if}
					</div>
					<p class="comment-thread__body">{c.body}</p>
				</div>
			{/each}
			{#if comments.length === 0}
				<p class="muted small">No comments yet.</p>
			{/if}
		</div>
		{#if isMember}
			<div class="comment-thread__form">
				<textarea class="comment-thread__input" bind:value={commentText} rows="2" placeholder="Add to the discussion..." maxlength="2000"></textarea>
				<button class="btn btn--small btn--accent" onclick={handlePostComment} disabled={commentSubmitting || !commentText.trim()}>
					{commentSubmitting ? '...' : 'Post'}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.section-view { display: flex; flex-direction: column; gap: 1rem; }

	/* Approved body */
	.approved-body { padding-top: 0.5rem; }
	.item-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.item-chip { padding: 0.3rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; font-size: 0.82rem; }
	.item-chip__label { font-weight: 600; }
	.item-chip__group { color: var(--muted); font-size: 0.75rem; margin-left: 0.3rem; }

	/* Consensus panel */
	.consensus-panel { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); }
	.consensus-panel__title { margin: 0 0 0.5rem; font-size: 1rem; }
	.consensus-items { display: flex; flex-direction: column; gap: 0.35rem; }
	.consensus-item { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem; border-radius: 5px; font-size: 0.85rem; }
	.consensus-item--agreed { background: rgba(16, 185, 129, 0.06); }
	.consensus-item--conflict { background: rgba(245, 158, 11, 0.06); }
	.consensus-item__icon { font-size: 0.8rem; }
	.consensus-item__label { font-weight: 600; }
	.consensus-item__parent-tag { font-size: 0.65rem; padding: 0.05rem 0.3rem; background: rgba(59, 195, 110, 0.12); color: var(--accent); border-radius: 3px; font-weight: 500; vertical-align: middle; margin-left: 0.2rem; }
	.consensus-item--child { margin-left: 1.25rem; font-size: 0.82rem; }
	.consensus-item__group { color: var(--muted); font-size: 0.75rem; }
	.consensus-item__votes { margin-left: auto; display: flex; gap: 0.3rem; }
	.vote-chip { font-size: 0.72rem; padding: 0.1rem 0.4rem; background: var(--surface); border: 1px solid var(--border); border-radius: 3px; }
	.vote-chip--winning { border-color: var(--status-verified); color: var(--status-verified); }

	/* Empty state */
	.empty-state { text-align: center; padding: 1.5rem; color: var(--muted); }

	/* Draft body (inside accordion content) */
	.draft-body { display: flex; flex-direction: column; gap: 0.6rem; padding-top: 0.5rem; }
	.draft-body__notes { color: var(--muted); font-size: 0.85rem; margin: 0; line-height: 1.4; }
	.draft-body__voting { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }

	.draft-trigger__title-text { color: var(--text-muted); font-weight: 400; font-size: 0.85rem; }

	.badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px; }
	.badge--you { background: rgba(59, 195, 110, 0.15); color: var(--accent); }

	/* Vote buttons */
	.vote-btn { padding: 0.3rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; cursor: pointer; font-size: 0.82rem; font-family: inherit; color: var(--fg); transition: all 0.15s; }
	.vote-btn:hover { background: rgba(255,255,255,0.06); }
	.vote-btn--active { border-color: var(--status-verified); background: rgba(16, 185, 129, 0.1); color: var(--status-verified); }
	.vote-btn--small { padding: 0.2rem 0.4rem; font-size: 0.78rem; }
	.vote-count { font-size: 0.82rem; color: var(--muted); }

	/* Draft details */
	.draft-details { border-top: 1px solid var(--border); padding-top: 0.6rem; }
	.draft-preview { font-size: 0.9rem; max-height: 400px; overflow-y: auto; padding: 0.5rem; background: var(--surface); border-radius: 6px; }
	.draft-group { margin-bottom: 0.75rem; }
	.draft-group__title { font-size: 0.85rem; color: var(--muted); margin: 0 0 0.4rem; text-transform: uppercase; letter-spacing: 0.03em; }
	.draft-item { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 5px; margin-bottom: 0.25rem; }
	.draft-item--agreed { background: rgba(16, 185, 129, 0.05); }
	.draft-item--conflict { background: rgba(245, 158, 11, 0.05); }
	.draft-item__content { flex: 1; min-width: 0; }
	.draft-item__label { font-weight: 600; font-size: 0.9rem; }
	.draft-item__slug { color: var(--muted); font-size: 0.78rem; }
	.draft-item__desc { font-size: 0.82rem; color: var(--muted); margin: 0.15rem 0 0; line-height: 1.4; }
	.draft-item__parent-hint { font-size: 0.75rem; color: var(--muted); }
	.draft-item--parent { border-left: 2px solid var(--accent); padding-left: 0.75rem; }
	.draft-item--child { margin-left: 1.25rem; padding-left: 0.75rem; border-left: 1px solid var(--border); font-size: 0.88rem; }

	/* Publish bar */
	.publish-bar { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.publish-bar .muted { margin: 0; }
	.publish-bar--locked { opacity: 0.7; }

	.btn--danger-text { color: var(--status-rejected); }
	.btn--danger-text:hover { background: rgba(239, 68, 68, 0.08); }
	.btn--outline { background: transparent; border: 1px solid var(--border); }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }
</style>
