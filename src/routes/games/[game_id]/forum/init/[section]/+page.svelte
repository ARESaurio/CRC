<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { SECTIONS, calculateSectionConsensus, type SectionId } from '../../consensus';
	import SectionView from './SectionView.svelte';
	import DraftEditor from './DraftEditor.svelte';
	import DraftCompare from './DraftCompare.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$components/ui/button/index.js';

	function clone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

	let { data } = $props();
	const game = $derived(data.game);
	const section = $derived(data.section as SectionId);
	const sectionMeta = $derived(SECTIONS.find(s => s.id === section)!);

	let members = $state(data.members);
	let drafts = $state(data.drafts);
	let votes = $state(data.votes);
	let comments = $state(data.comments);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => Promise<void>) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => Promise<void>) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	async function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) await confirmCallback();
		confirmCallback = null;
	}

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

	// ── Draft editor state ───────────────────────────────────────────────
	let showDraftEditor = $state(false);
	let showDraftCompare = $state(false);
	let editingDraftData = $state<any>(null);

	// ── Consensus ────────────────────────────────────────────────────────
	const consensus = $derived(calculateSectionConsensus(section, drafts, votes));
	const myDraft = $derived(drafts.find((d: any) => d.user_id === $user?.id));

	let publishing = $state(false);

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
			.select().single();
		if (error) {
			showToast('error', error.message.includes('duplicate') ? 'You are already a member.' : error.message);
		} else if (row) {
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id, avatar_url').eq('user_id', $user.id).maybeSingle();
			members = [...members, { ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null, avatar_url: profile?.avatar_url || null }];
			showToast('success', role === 'editor' ? 'Joined as editor!' : 'Joined the committee!');
		}
		joining = false;
	}

	async function leaveCommittee() {
		if (!$user) return;
		const doLeave = async () => {
			const { error } = await supabase.from('rules_committee_members').delete().eq('game_id', game.game_id).eq('user_id', $user!.id);
			if (error) { showToast('error', error.message); } else {
				members = members.filter((m: any) => m.user_id !== $user?.id);
				showToast('success', 'Left the committee.');
			}
		};
		if (isEditor) {
			openConfirm('Leave Committee', 'You are the editor. Leaving will remove your editor role. Continue?', doLeave);
		} else {
			await doLeave();
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// DRAFT MANAGEMENT
	// ═════════════════════════════════════════════════════════════════════

	function openDraftEditor() {
		const existing = drafts.find((d: any) => d.user_id === $user?.id);
		editingDraftData = existing ? clone(existing.data) : getCurrentGameDataForSection(section);
		showDraftEditor = true;
	}

	function forkDraft(draft: any) {
		editingDraftData = clone(draft.data);
		showDraftEditor = true;
	}

	function getCurrentGameDataForSection(s: SectionId): any {
		switch (s) {
			case 'overview': return { content: game.content || '' };
			case 'categories': return { full_runs: clone(game.full_runs || []), mini_challenges: clone(game.mini_challenges || []), player_made: clone(game.player_made || []) };
			case 'rules': return { general_rules: game.general_rules || '' };
			case 'challenges': return { challenges_data: clone(game.challenges_data || []), glitches_data: clone(game.glitches_data || []), nmg_rules: game.nmg_rules || '', glitch_doc_links: game.glitch_doc_links || '' };
			case 'restrictions': return { restrictions_data: clone(game.restrictions_data || []) };
			case 'characters': return { character_column: clone(game.character_column || { enabled: false, label: 'Character' }), characters_data: clone(game.characters_data || []) };
			case 'difficulties': return { difficulty_column: clone(game.difficulty_column || { enabled: false, label: 'Difficulty' }), difficulties_data: clone(game.difficulties_data || []) };
			case 'achievements': return { community_achievements: clone(game.community_achievements || []) };
			default: return {};
		}
	}

	async function saveDraft(draftData: any, title: string, notes: string) {
		if (!$user) return;
		const existing = drafts.find((d: any) => d.user_id === $user?.id);
		if (existing) {
			const { data: row, error } = await supabase.from('discussion_drafts').update({ data: draftData, title, notes, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single();
			if (error) { showToast('error', error.message); return; }
			drafts = drafts.map((d: any) => d.id === existing.id ? { ...d, ...row } : d);
		} else {
			const { data: row, error } = await supabase.from('discussion_drafts').insert({ game_id: game.game_id, user_id: $user.id, section, data: draftData, title, notes }).select().single();
			if (error) { showToast('error', error.message); return; }
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id, avatar_url').eq('user_id', $user.id).maybeSingle();
			drafts = [...drafts, { ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null, avatar_url: profile?.avatar_url || null }];
		}
		showDraftEditor = false;
		showToast('success', 'Draft saved!');
	}

	async function withdrawDraft(draftId: string) {
		openConfirm('Withdraw Draft', 'Withdraw this draft? This cannot be undone.', async () => {
			const { error } = await supabase.from('discussion_drafts').delete().eq('id', draftId);
			if (error) { showToast('error', error.message); } else {
				drafts = drafts.filter((d: any) => d.id !== draftId);
				votes = votes.filter((v: any) => v.draft_id !== draftId);
				showToast('success', 'Draft withdrawn.');
			}
		});
	}

	// ═════════════════════════════════════════════════════════════════════
	// VOTING
	// ═════════════════════════════════════════════════════════════════════

	async function castVote(draftId: string, _section: SectionId, itemSlug: string | null) {
		if (!$user) return;
		const scope = itemSlug ? 'item' : 'section';
		const coalesced = itemSlug || '__section__';
		const existing = votes.find((v: any) => v.user_id === $user?.id && v.section === section && (v.item_slug || '__section__') === coalesced);

		if (existing) {
			if (existing.draft_id === draftId) {
				const { error } = await supabase.from('discussion_votes').delete().eq('id', existing.id);
				if (!error) votes = votes.filter((v: any) => v.id !== existing.id);
				return;
			}
			const { data: row, error } = await supabase.from('discussion_votes').update({ draft_id: draftId }).eq('id', existing.id).select().single();
			if (!error && row) votes = votes.map((v: any) => v.id === existing.id ? { ...v, draft_id: draftId } : v);
		} else {
			const { data: row, error } = await supabase.from('discussion_votes').insert({ game_id: game.game_id, user_id: $user.id, draft_id: draftId, section, scope, item_slug: itemSlug }).select().single();
			if (error) { showToast('error', error.message); } else if (row) { votes = [...votes, row]; }
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// PUBLISH CONSENSUS
	// ═════════════════════════════════════════════════════════════════════

	async function publishConsensus(s: SectionId) {
		if (!isEditor && !isAdmin) return;
		openConfirm('Publish Consensus', 'Publish the winning draft data to the live game?', async () => {
			const sc = consensus;
			if (!sc.winningDraftId && s !== 'rules' && s !== 'overview') {
				const hasAnyWinner = sc.items.some(i => i.winningDraftId);
				if (!hasAnyWinner) { showToast('error', 'No clear consensus yet.'); return; }
			}
			let publishData: Record<string, any> = {};
			if (s === 'rules') {
				const winDraft = drafts.find((d: any) => d.id === sc.winningDraftId);
				if (!winDraft) { showToast('error', 'Winning draft not found.'); return; }
				publishData = { general_rules: winDraft.data.general_rules || '' };
			} else if (s === 'overview') {
				const winDraft = drafts.find((d: any) => d.id === sc.winningDraftId);
				if (!winDraft) { showToast('error', 'Winning draft not found.'); return; }
				publishData = { content: winDraft.data.content || '' };
			} else {
				const baseDraft = sc.winningDraftId ? drafts.find((d: any) => d.id === sc.winningDraftId) : drafts[0];
				if (!baseDraft) { showToast('error', 'No drafts to publish.'); return; }
				publishData = clone(baseDraft.data);
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
								if (idx >= 0) publishData[key][idx] = clone(srcItem);
								else publishData[key].push(clone(srcItem));
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
					body: JSON.stringify({ game_id: game.game_id, section_name: s, updates: publishData })
				});
				const result = await res.json();
				if (res.ok && result.ok) showToast('success', `Published ${s} consensus to live game!`);
				else showToast('error', result.error || 'Publish failed.');
			} catch (err: any) { showToast('error', err?.message || 'Network error'); }
			publishing = false;
		});
	}

	// ═════════════════════════════════════════════════════════════════════
	// COMMENTS
	// ═════════════════════════════════════════════════════════════════════

	async function postComment(body: string, draftId?: string, itemSlug?: string) {
		if (!$user || !body.trim()) return;
		const { data: row, error } = await supabase.from('discussion_comments').insert({ game_id: game.game_id, user_id: $user.id, section, body: body.trim().slice(0, 2000), draft_id: draftId || null, item_slug: itemSlug || null }).select().single();
		if (error) { showToast('error', error.message); return null; }
		const { data: profile } = await supabase.from('profiles').select('display_name, runner_id, avatar_url').eq('user_id', $user.id).maybeSingle();
		const enriched = { ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null, avatar_url: profile?.avatar_url || null };
		comments = [...comments, enriched];
		return enriched;
	}

	async function deleteComment(commentId: string) {
		const { error } = await supabase.from('discussion_comments').delete().eq('id', commentId);
		if (!error) comments = comments.filter((c: any) => c.id !== commentId);
	}
</script>

<svelte:head><title>{sectionMeta.label} — Game Initialization | {game.game_name} | CRC</title></svelte:head>

<div class="section-page">
	{#if toast}
		<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- Breadcrumb -->
	<nav class="breadcrumb">
		<a href={localizeHref(`/games/${game.game_id}/forum`)}>← Forum</a>
		<span class="breadcrumb__sep">›</span>
		<span>Game Initialization</span>
		<span class="breadcrumb__sep">›</span>
		<span class="breadcrumb__current">{sectionMeta.icon} {sectionMeta.label}</span>
	</nav>

	<!-- Committee bar -->
	<div class="committee-bar">
		<span class="committee-bar__label">Committee ({members.length})</span>
		{#if $user && !isMember}
			<Button.Root variant="accent" size="sm" onclick={joinCommittee} disabled={joining}>
				{joining ? '...' : 'Join'}
			</Button.Root>
		{:else if isMember}
			<span class="committee-badge">{isEditor ? '✏️ Editor' : '👤 Member'}</span>
			<Button.Root variant="outline" size="sm" onclick={leaveCommittee}>Leave</Button.Root>
		{/if}
	</div>

	<!-- Section content -->
	<SectionView
		{section}
		{game}
		{drafts}
		{votes}
		{comments}
		{consensus}
		userId={$user?.id || null}
		{isMember}
		{isEditor}
		{isAdmin}
		{myDraft}
		{publishing}
		memberCount={members.length}
		onVote={castVote}
		onOpenEditor={openDraftEditor}
		onWithdraw={withdrawDraft}
		onForkDraft={forkDraft}
		onPublish={publishConsensus}
		onCompare={() => { showDraftCompare = true; }}
		onPostComment={(body, draftId, itemSlug) => postComment(body, draftId, itemSlug)}
		onDeleteComment={deleteComment}
	/>
</div>

<!-- Modals -->
{#if showDraftEditor}
	<DraftEditor
		{section}
		initialData={editingDraftData}
		existingTitle={myDraft?.title || ''}
		existingNotes={myDraft?.notes || ''}
		onSave={(draftData, title, notes) => saveDraft(draftData, title, notes)}
		onClose={() => { showDraftEditor = false; }}
	/>
{/if}

{#if showDraftCompare && drafts.length > 0}
	<DraftCompare
		{section}
		{drafts}
		{game}
		onClose={() => { showDraftCompare = false; }}
	/>
{/if}

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleConfirmAction}>Confirm</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.section-page { max-width: 960px; margin: 0 auto; }

	.breadcrumb { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.breadcrumb a { color: var(--accent); text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }
	.breadcrumb__sep { color: var(--muted); }
	.breadcrumb__current { font-weight: 600; }

	.btn--outline { background: transparent; border: 1px solid var(--border); }
</style>
