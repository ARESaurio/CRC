<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { SECTIONS, calculateAllConsensus, type SectionId } from './consensus';
	import SectionView from './SectionView.svelte';
	import DraftEditor from './DraftEditor.svelte';
	import DraftCompare from './DraftCompare.svelte';

	/** Deep clone that works with Svelte 5 $state proxies */
	function clone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

	let { data } = $props();
	const game = $derived(data.game);

	let members = $state(data.members);
	let drafts = $state(data.drafts);
	let votes = $state(data.votes);
	let comments = $state(data.comments);
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

	// ── Committee state ──────────────────────────────────────────────────
	const isMember = $derived(!!$user && members.some((m: any) => m.user_id === $user?.id));
	const isEditor = $derived(!!$user && members.some((m: any) => m.user_id === $user?.id && m.role === 'editor'));
	let joining = $state(false);

	// ── Active section tab ───────────────────────────────────────────────
	let activeSection = $state<SectionId>('overview');

	// ── Draft editor state ───────────────────────────────────────────────
	let showDraftEditor = $state(false);
	let showDraftCompare = $state(false);
	let editingDraftSection = $state<SectionId>('categories');
	let editingDraftData = $state<any>(null);

	// ── Consensus calculation ────────────────────────────────────────────
	const consensus = $derived(calculateAllConsensus(drafts, votes));

	// ── Section-filtered data ────────────────────────────────────────────
	const sectionDrafts = $derived(drafts.filter((d: any) => d.section === activeSection));
	const sectionVotes = $derived(votes.filter((v: any) => v.section === activeSection));
	const sectionComments = $derived(comments.filter((c: any) => c.section === activeSection));
	const sectionConsensus = $derived(consensus[activeSection]);
	const myDraft = $derived(sectionDrafts.find((d: any) => d.user_id === $user?.id));

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	// ═════════════════════════════════════════════════════════════════════
	// COMMITTEE JOIN / LEAVE
	// ═════════════════════════════════════════════════════════════════════

	async function joinCommittee() {
		if (!$user) return;
		joining = true;
		const role = members.length === 0 ? 'editor' : 'member';

		const { data: row, error } = await supabase
			.from('rules_committee_members')
			.insert({ game_id: game.game_id, user_id: $user.id, role })
			.select()
			.single();

		if (error) {
			showToast('error', error.message.includes('duplicate') ? 'You are already a member.' : error.message);
		} else if (row) {
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
		if (isEditor && !confirm('You are the editor. Leaving will remove your editor role. Continue?')) return;

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

	// ═════════════════════════════════════════════════════════════════════
	// DRAFT MANAGEMENT
	// ═════════════════════════════════════════════════════════════════════

	function openDraftEditor(section: SectionId) {
		editingDraftSection = section;
		// Pre-populate with existing draft or current game data
		const existing = drafts.find((d: any) => d.section === section && d.user_id === $user?.id);
		if (existing) {
			editingDraftData = clone(existing.data);
		} else {
			editingDraftData = getCurrentGameDataForSection(section);
		}
		showDraftEditor = true;
	}

	function getCurrentGameDataForSection(section: SectionId): any {
		switch (section) {
			case 'overview':
				return { content: game.content || '' };
			case 'categories':
				return { full_runs: clone(game.full_runs || []), mini_challenges: clone(game.mini_challenges || []), player_made: clone(game.player_made || []) };
			case 'rules':
				return { general_rules: game.general_rules || '' };
			case 'challenges':
				return { challenges_data: clone(game.challenges_data || []), glitches_data: clone(game.glitches_data || []), nmg_rules: game.nmg_rules || '', glitch_doc_links: game.glitch_doc_links || '' };
			case 'restrictions':
				return { restrictions_data: clone(game.restrictions_data || []) };
			case 'characters':
				return { character_column: clone(game.character_column || { enabled: false, label: 'Character' }), characters_data: clone(game.characters_data || []) };
			case 'difficulties':
				return { difficulty_column: clone(game.difficulty_column || { enabled: false, label: 'Difficulty' }), difficulties_data: clone(game.difficulties_data || []) };
			case 'achievements':
				return { community_achievements: clone(game.community_achievements || []) };
			default:
				return {};
		}
	}

	async function saveDraft(section: SectionId, draftData: any, title: string, notes: string) {
		if (!$user) return;

		const existing = drafts.find((d: any) => d.section === section && d.user_id === $user?.id);

		if (existing) {
			// Update
			const { data: row, error } = await supabase
				.from('discussion_drafts')
				.update({ data: draftData, title, notes, updated_at: new Date().toISOString() })
				.eq('id', existing.id)
				.select()
				.single();

			if (error) {
				showToast('error', error.message);
				return;
			}
			drafts = drafts.map((d: any) => d.id === existing.id ? { ...d, ...row } : d);
		} else {
			// Insert
			const { data: row, error } = await supabase
				.from('discussion_drafts')
				.insert({ game_id: game.game_id, user_id: $user.id, section, data: draftData, title, notes })
				.select()
				.single();

			if (error) {
				showToast('error', error.message);
				return;
			}
			// Enrich with profile
			const { data: profile } = await supabase
				.from('profiles')
				.select('display_name, runner_id, avatar_url')
				.eq('user_id', $user.id)
				.maybeSingle();
			drafts = [...drafts, {
				...row,
				display_name: profile?.display_name || 'You',
				runner_id: profile?.runner_id || null,
				avatar_url: profile?.avatar_url || null
			}];
		}

		showDraftEditor = false;
		showToast('success', 'Draft saved!');
	}

	async function withdrawDraft(draftId: string) {
		if (!confirm('Withdraw this draft? Your votes for it will also be removed.')) return;
		const { error } = await supabase.from('discussion_drafts').delete().eq('id', draftId);
		if (error) {
			showToast('error', error.message);
		} else {
			drafts = drafts.filter((d: any) => d.id !== draftId);
			votes = votes.filter((v: any) => v.draft_id !== draftId);
			showToast('success', 'Draft withdrawn.');
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// FORK DRAFT
	// ═════════════════════════════════════════════════════════════════════

	function forkDraft(draft: any) {
		editingDraftSection = draft.section;
		editingDraftData = clone(draft.data);
		showDraftEditor = true;
	}

	// ═════════════════════════════════════════════════════════════════════
	// PUBLISH CONSENSUS (editor/admin only → calls Worker save endpoint)
	// ═════════════════════════════════════════════════════════════════════

	let publishing = $state(false);

	async function publishConsensus(section: SectionId) {
		if (!isEditor && !isAdmin) return;
		if (!confirm('Publish the winning draft data to the live game? This updates the actual game rules.')) return;

		const sc = consensus[section];
		if (!sc.winningDraftId && section !== 'rules') {
			// No overall winner — try to build merged data from per-item winners
			const hasAnyWinner = sc.items.some(i => i.winningDraftId);
			if (!hasAnyWinner) {
				showToast('error', 'No clear consensus yet — resolve conflicts first.');
				return;
			}
		}

		let publishData: Record<string, any> = {};

		if (section === 'rules') {
			const winDraft = drafts.find((d: any) => d.id === sc.winningDraftId);
			if (!winDraft) { showToast('error', 'Winning draft not found.'); return; }
			publishData = { general_rules: winDraft.data.general_rules || '' };
		} else if (section === 'overview') {
			const winDraft = drafts.find((d: any) => d.id === sc.winningDraftId);
			if (!winDraft) { showToast('error', 'Winning draft not found.'); return; }
			publishData = { content: winDraft.data.content || '' };
		} else {
			// Start from the section winner's data as base, or first draft
			const baseDraft = sc.winningDraftId
				? drafts.find((d: any) => d.id === sc.winningDraftId)
				: drafts.find((d: any) => d.section === section);
			if (!baseDraft) { showToast('error', 'No drafts to publish.'); return; }
			publishData = clone(baseDraft.data);

			// Override individual items from their respective winning drafts
			for (const item of sc.items) {
				if (item.winningDraftId && item.winningDraftId !== baseDraft.id) {
					const itemDraft = drafts.find((d: any) => d.id === item.winningDraftId);
					if (!itemDraft) continue;
					for (const key of Object.keys(publishData)) {
						if (!Array.isArray(publishData[key])) continue;
						const srcArr = itemDraft.data?.[key];
						if (!Array.isArray(srcArr)) continue;
						const srcItem = srcArr.find((i: any) => i.slug === item.slug);
						if (srcItem) {
							const idx = publishData[key].findIndex((i: any) => i.slug === item.slug);
							if (idx >= 0) {
								publishData[key][idx] = clone(srcItem);
							} else {
								publishData[key].push(clone(srcItem));
							}
						}
					}
				}
			}
		}

		publishing = true;
		try {
			const { getAccessToken } = await import('$lib/admin');
			const token = await getAccessToken();
			if (!token) { showToast('error', 'Not authenticated.'); publishing = false; return; }

			const { PUBLIC_WORKER_URL } = await import('$env/static/public');
			const res = await fetch(`${PUBLIC_WORKER_URL}/game-editor/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify({ game_id: game.game_id, section_name: section, updates: publishData })
			});
			const result = await res.json();
			if (res.ok && result.ok) {
				showToast('success', `Published ${section} consensus to live game!`);
			} else {
				showToast('error', result.error || 'Publish failed. You may need admin/moderator access.');
			}
		} catch (err: any) {
			showToast('error', err?.message || 'Network error');
		}
		publishing = false;
	}

	// ═════════════════════════════════════════════════════════════════════
	// VOTING
	// ═════════════════════════════════════════════════════════════════════

	async function castVote(draftId: string, section: SectionId, itemSlug: string | null) {
		if (!$user) return;
		const scope = itemSlug ? 'item' : 'section';
		const coalesced = itemSlug || '__section__';

		// Check for existing vote at this scope
		const existing = votes.find((v: any) =>
			v.user_id === $user?.id &&
			v.section === section &&
			(v.item_slug || '__section__') === coalesced
		);

		if (existing) {
			if (existing.draft_id === draftId) {
				// Remove vote (toggle off)
				const { error } = await supabase.from('discussion_votes').delete().eq('id', existing.id);
				if (!error) votes = votes.filter((v: any) => v.id !== existing.id);
				return;
			}
			// Switch vote to different draft
			const { data: row, error } = await supabase
				.from('discussion_votes')
				.update({ draft_id: draftId })
				.eq('id', existing.id)
				.select()
				.single();
			if (!error && row) {
				votes = votes.map((v: any) => v.id === existing.id ? { ...v, draft_id: draftId } : v);
			}
		} else {
			// New vote
			const { data: row, error } = await supabase
				.from('discussion_votes')
				.insert({ game_id: game.game_id, user_id: $user.id, draft_id: draftId, section, scope, item_slug: itemSlug })
				.select()
				.single();
			if (error) {
				showToast('error', error.message);
			} else if (row) {
				votes = [...votes, row];
			}
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// COMMENTS
	// ═════════════════════════════════════════════════════════════════════

	async function postComment(section: SectionId, body: string, draftId?: string, itemSlug?: string) {
		if (!$user || !body.trim()) return;
		const { data: row, error } = await supabase
			.from('discussion_comments')
			.insert({
				game_id: game.game_id,
				user_id: $user.id,
				section,
				body: body.trim().slice(0, 2000),
				draft_id: draftId || null,
				item_slug: itemSlug || null
			})
			.select()
			.single();

		if (error) {
			showToast('error', error.message);
			return null;
		}
		const { data: profile } = await supabase
			.from('profiles')
			.select('display_name, runner_id, avatar_url')
			.eq('user_id', $user.id)
			.maybeSingle();
		const enriched = {
			...row,
			display_name: profile?.display_name || 'You',
			runner_id: profile?.runner_id || null,
			avatar_url: profile?.avatar_url || null
		};
		comments = [...comments, enriched];
		return enriched;
	}

	async function deleteComment(commentId: string) {
		const { error } = await supabase.from('discussion_comments').delete().eq('id', commentId);
		if (!error) comments = comments.filter((c: any) => c.id !== commentId);
	}
</script>

<div class="discussion-page">
	{#if toast}
		<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- ═══ Committee Panel ═══════════════════════════════════════════════ -->
	<section class="committee-panel">
		<div class="committee-header">
			<h2>Rules Committee</h2>
			<div class="committee-header__actions">
				{#if $user && !isMember}
					<button class="btn btn--small btn--accent" onclick={joinCommittee} disabled={joining}>
						{joining ? '...' : 'Join the Committee'}
					</button>
				{:else if isMember}
					<span class="committee-badge">{isEditor ? '✏️ Editor' : '👤 Member'}</span>
					<button class="btn btn--small btn--outline" onclick={leaveCommittee}>Leave</button>
				{/if}
			</div>
		</div>

		{#if members.length > 0}
			<div class="member-row">
				{#each members as m}
					<a class="member-chip" href={m.runner_id ? localizeHref(`/runners/${m.runner_id}`) : undefined}>
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
		{:else}
			<p class="muted small">No committee members yet. Join to start shaping the rules.</p>
		{/if}
	</section>

	<!-- ═══ Section Tabs ══════════════════════════════════════════════════ -->
	<nav class="section-tabs">
		{#each SECTIONS as s}
			{@const sc = consensus[s.id]}
			<button
				class="section-tab"
				class:section-tab--active={activeSection === s.id}
				onclick={() => { activeSection = s.id; }}
			>
				<span class="section-tab__icon">{s.icon}</span>
				<span class="section-tab__label">{s.label}</span>
				{#if sc.status === 'consensus' || sc.status === 'single-draft'}
					<span class="section-tab__status section-tab__status--ok">✓</span>
				{:else if sc.status === 'conflict'}
					<span class="section-tab__status section-tab__status--conflict">⚡</span>
				{:else if sc.status === 'no-drafts'}
					<span class="section-tab__status section-tab__status--empty">—</span>
				{/if}
			</button>
		{/each}
	</nav>

	<!-- ═══ Section Content ═══════════════════════════════════════════════ -->
	<SectionView
		section={activeSection}
		{game}
		drafts={sectionDrafts}
		votes={sectionVotes}
		comments={sectionComments}
		consensus={sectionConsensus}
		userId={$user?.id || null}
		{isMember}
		{isEditor}
		{isAdmin}
		{myDraft}
		{publishing}
		memberCount={members.length}
		onVote={castVote}
		onOpenEditor={() => openDraftEditor(activeSection)}
		onWithdraw={withdrawDraft}
		onForkDraft={forkDraft}
		onPublish={publishConsensus}
		onCompare={() => { showDraftCompare = true; }}
		onPostComment={(body, draftId, itemSlug) => postComment(activeSection, body, draftId, itemSlug)}
		onDeleteComment={deleteComment}
	/>
</div>

<!-- ═══ Draft Editor Modal ════════════════════════════════════════════ -->
{#if showDraftEditor}
	<DraftEditor
		section={editingDraftSection}
		initialData={editingDraftData}
		existingTitle={myDraft?.title || ''}
		existingNotes={myDraft?.notes || ''}
		onSave={(draftData, title, notes) => saveDraft(editingDraftSection, draftData, title, notes)}
		onClose={() => { showDraftEditor = false; }}
	/>
{/if}

{#if showDraftCompare && sectionDrafts.length > 0}
	<DraftCompare
		section={activeSection}
		drafts={sectionDrafts}
		{game}
		onClose={() => { showDraftCompare = false; }}
	/>
{/if}

<style>
	.discussion-page { max-width: 960px; margin: 0 auto; }

	.disc-toast { padding: 0.6rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.disc-toast--success { background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); color: #28a745; }
	.disc-toast--error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); color: #dc3545; }

	/* Committee */
	.committee-panel { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; }
	.committee-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.committee-header h2 { margin: 0; font-size: 1.1rem; }
	.committee-header__actions { display: flex; align-items: center; gap: 0.5rem; }
	.committee-badge { font-size: 0.82rem; padding: 0.2rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; }
	.member-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.member-chip { display: flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; text-decoration: none; color: var(--fg); font-size: 0.82rem; }
	.member-chip:hover { border-color: var(--accent); }
	.member-chip__avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
	.member-chip__initial { width: 22px; height: 22px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; }
	.member-chip__name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.member-chip__badge { font-size: 0.75rem; }
	.small { font-size: 0.85rem; }

	/* Section tabs */
	.section-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 1rem; padding: 0.25rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.section-tab { display: flex; align-items: center; gap: 0.3rem; padding: 0.45rem 0.7rem; background: transparent; border: 1px solid transparent; border-radius: 6px; color: var(--muted); font-size: 0.82rem; cursor: pointer; font-family: inherit; transition: all 0.15s; }
	.section-tab:hover { color: var(--fg); background: var(--surface); }
	.section-tab--active { color: var(--fg); background: var(--surface); border-color: var(--border); font-weight: 600; }
	.section-tab__icon { font-size: 0.9rem; }
	.section-tab__label { white-space: nowrap; }
	.section-tab__status { font-size: 0.7rem; margin-left: 0.15rem; }
	.section-tab__status--ok { color: #28a745; }
	.section-tab__status--conflict { color: #f59e0b; }
	.section-tab__status--empty { color: var(--muted); }

	.muted { color: var(--muted); }

	.btn--outline { background: transparent; border: 1px solid var(--border); }
</style>
