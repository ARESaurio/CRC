<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate, timeAgo } from '$lib/utils';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { Pin, Lock, MessageCircle, Lightbulb, Pencil, User, ChevronRight, MessageSquare, Eye, Plus } from 'lucide-svelte';
	import { SECTIONS } from './consensus';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import ForumThreadTable from '$lib/components/forum/ForumThreadTable.svelte';
	import ForumThreadRow from '$lib/components/forum/ForumThreadRow.svelte';
	import { stripTooltipSyntax } from '$lib/utils/markdown';

	let { data } = $props();
	const game = $derived(data.game);

	let members = $state(data.members);
	let suggestions = $state(data.suggestions);
	$effect(() => { members = data.members; suggestions = data.suggestions; });
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
		} else { isAdmin = false; }
	});

	// ── Committee ────────────────────────────────────────────────────────
	const isMember = $derived(!!$user && members.some((m: any) => m.user_id === $user?.id));
	const isEditor = $derived(!!$user && members.some((m: any) => m.user_id === $user?.id && m.role === 'editor'));
	let joining = $state(false);

	// ── Has approved profile (for suggestions) ───────────────────────────
	let hasApprovedProfile = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('status').eq('user_id', u.id).maybeSingle()
				.then(({ data: p }) => { hasApprovedProfile = p?.status === 'approved'; });
		} else { hasApprovedProfile = false; }
	});

	// ── Committee eligibility: must have ≥1 approved run for this game ──
	let hasGameRun = $state(false);
	let eligibilityChecked = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('runner_id').eq('user_id', u.id).maybeSingle()
				.then(({ data: profile }) => {
					if (!profile?.runner_id) { hasGameRun = false; eligibilityChecked = true; return; }
					supabase.from('runs').select('public_id', { count: 'exact', head: true })
						.eq('game_id', game.game_id)
						.eq('runner_id', profile.runner_id)
						.eq('status', 'approved')
						.then(({ count }) => { hasGameRun = (count ?? 0) > 0; eligibilityChecked = true; });
				});
		} else { hasGameRun = false; eligibilityChecked = true; }
	});

	// ── Suggestion form ──────────────────────────────────────────────────
	let showSuggestForm = $state(false);
	let sugTitle = $state('');
	let sugBody = $state('');
	let sugSections = $state<string[]>([]);
	let sugSubmitting = $state(false);

	// ── Discussion thread form ──────────────────────────────────────────
	let showDiscussForm = $state(false);
	let discTitle = $state('');
	let discBody = $state('');
	let discSubmitting = $state(false);

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	// ═════════════════════════════════════════════════════════════════════
	// COMMITTEE
	// ═════════════════════════════════════════════════════════════════════

	async function joinCommittee() {
		if (!$user) return;
		joining = true;

		if (!isAdmin) {
			const { data: profile } = await supabase.from('profiles').select('runner_id').eq('user_id', $user.id).maybeSingle();
			if (!profile?.runner_id) {
				showToast('error', 'You need an approved runner profile to join.');
				joining = false;
				return;
			}
			const { count } = await supabase.from('runs').select('public_id', { count: 'exact', head: true })
				.eq('game_id', game.game_id).eq('runner_id', profile.runner_id).eq('status', 'approved');
			if ((count ?? 0) < 1) {
				showToast('error', 'You need at least 1 approved run for this game to join the committee.');
				joining = false;
				return;
			}
		}

		const role = members.length === 0 ? 'editor' : 'member';
		const { data: row, error } = await supabase.from('rules_committee_members').insert({ game_id: game.game_id, user_id: $user.id, role }).select().single();
		if (error) {
			showToast('error', error.message.includes('duplicate') ? 'Already a member.' : error.message);
		} else if (row) {
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id, avatar_url').eq('user_id', $user.id).maybeSingle();
			members = [...members, { ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null, avatar_url: profile?.avatar_url || null }];
			showToast('success', role === 'editor' ? 'Joined as editor!' : 'Joined!');
		}
		joining = false;
	}

	async function leaveCommittee() {
		if (!$user) return;
		const doLeave = async () => {
			const { error } = await supabase.from('rules_committee_members').delete().eq('game_id', game.game_id).eq('user_id', $user!.id);
			if (!error) {
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
	// SUGGESTIONS
	// ═════════════════════════════════════════════════════════════════════

	function toggleSugSection(sectionId: string) {
		if (sugSections.includes(sectionId)) {
			sugSections = sugSections.filter(s => s !== sectionId);
		} else {
			sugSections = [...sugSections, sectionId];
		}
	}

	async function submitSuggestion() {
		if (!$user || !sugTitle.trim() || !sugBody.trim() || sugSections.length === 0) return;
		sugSubmitting = true;
		const { data: row, error } = await supabase.from('game_suggestions').insert({
			game_id: game.game_id,
			user_id: $user.id,
			title: stripTooltipSyntax(sugTitle.trim()).slice(0, 200),
			body: stripTooltipSyntax(sugBody.trim()).slice(0, 3000),
			sections: sugSections
		}).select().single();

		if (error) {
			showToast('error', error.message);
		} else if (row) {
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id').eq('user_id', $user.id).maybeSingle();
			suggestions = [{ ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null, vote_counts: { agree: 0, disagree: 0 }, comment_count: 0 }, ...suggestions];
			sugTitle = '';
			sugBody = '';
			sugSections = [];
			showSuggestForm = false;
			showToast('success', 'Suggestion posted!');
		}
		sugSubmitting = false;
	}

	// ═════════════════════════════════════════════════════════════════════
	// DISCUSSION THREADS
	// ═════════════════════════════════════════════════════════════════════

	async function submitDiscussionThread() {
		if (!$user || !discTitle.trim() || !discBody.trim() || !data.gameBoardId) return;
		discSubmitting = true;
		try {
			const session = (await supabase.auth.getSession()).data.session;
			const res = await fetch(`${PUBLIC_WORKER_URL}/forum/create-thread`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${session?.access_token}`,
				},
				body: JSON.stringify({
					board_id: data.gameBoardId,
					title: discTitle.trim(),
					body: discBody.trim(),
					game_id: game.game_id,
				}),
			});
			const result = await res.json();
			if (result.ok) {
				discTitle = '';
				discBody = '';
				showDiscussForm = false;
				showToast('success', 'Thread posted!');
				// Reload to show new thread
				window.location.reload();
			} else {
				showToast('error', result.error || 'Failed to create thread');
			}
		} catch {
			showToast('error', 'Network error');
		}
		discSubmitting = false;
	}
</script>

<svelte:head><title>Forum — {game.game_name} | CRC</title></svelte:head>

<div class="forum-overview">
	{#if toast}
		<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- ═══ Forum Header ═════════════════════════════════════════════════ -->
	<div class="forum-header">
		<h1 class="forum-header__title">{game.game_name} Forum</h1>
		<div class="forum-header__actions">
			{#if $user && !isMember}
				{#if isAdmin || hasGameRun}
					<Button.Root variant="accent" size="sm" onclick={joinCommittee} disabled={joining}>
						{joining ? '...' : 'Join Committee'}
					</Button.Root>
				{:else if eligibilityChecked}
					<span class="muted small">Need 1 approved run to join</span>
				{/if}
			{:else if isMember}
				<span class="committee-badge">{isEditor ? '<Pencil size={12} /> Editor' : '<User size={12} /> Member'}</span>
				<Button.Root variant="outline" size="sm" onclick={leaveCommittee}>Leave</Button.Root>
			{/if}
		</div>
	</div>

	{#if members.length > 0}
		<div class="committee-strip">
			<span class="committee-strip__label">Committee ({members.length}):</span>
			<div class="committee-strip__members">
				{#each members.slice(0, 8) as m}
					<span class="member-chip" title={m.display_name}>
						{#if m.avatar_url}
							<img class="member-chip__avatar" src={m.avatar_url} alt="" />
						{:else}
							<span class="member-chip__initial">{(m.display_name || '?')[0]}</span>
						{/if}
						<span class="member-chip__name">{m.display_name}</span>
						{#if m.role === 'editor'}<span class="member-chip__badge"><Pencil size={10} /></span>{/if}
					</span>
				{/each}
				{#if members.length > 8}
					<span class="member-chip member-chip--more">+{members.length - 8}</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ═══ Thread List ══════════════════════════════════════════════════ -->
	<div class="thread-list">

		<!-- Pinned: Game Initialization -->
		<a class="thread-card thread-card--pinned" href={localizeHref(`/games/${game.game_id}/forum/init`)}>
			<div class="thread-card__pin"><Pin size={16} /></div>
			<div class="thread-card__body">
				<span class="thread-card__title">
					Game Initialization
					{#if data.isCommunityReview}
						<span class="thread-card__tag thread-card__tag--cr">Community Review</span>
					{/if}
				</span>
				<span class="thread-card__desc">
					{#if data.isCommunityReview}
						Rough draft, proposals, and voting for this game's rules, categories, and structure.
					{:else}
						Section-by-section discussion and drafting for this game's configuration.
					{/if}
				</span>
			</div>
			<span class="thread-card__arrow"><ChevronRight size={16} /></span>
		</a>

		<!-- Suggestions -->
		<div class="thread-section-header">
			<h2><Lightbulb size={18} /> Suggestions</h2>
			{#if hasApprovedProfile && !showSuggestForm}
				<Button.Root variant="accent" size="sm" onclick={() => { showSuggestForm = true; }}>+ New Suggestion</Button.Root>
			{:else if !$user}
				<span class="muted small">Sign in to suggest</span>
			{:else if !hasApprovedProfile}
				<span class="muted small">Approved profile required</span>
			{/if}
		</div>

		{#if showSuggestForm}
			<div class="suggest-form">
				<input class="suggest-form__title" type="text" bind:value={sugTitle} placeholder="Suggestion title" maxlength="200" />
				<textarea class="suggest-form__body" bind:value={sugBody} rows="4" placeholder="Describe your suggestion..." maxlength="3000"></textarea>
				<div class="suggest-form__sections">
					<span class="suggest-form__label">Sections this applies to:</span>
					<div class="suggest-form__chips">
						{#each SECTIONS as sec}
							<button
								class="section-chip"
								class:section-chip--active={sugSections.includes(sec.id)}
								onclick={() => toggleSugSection(sec.id)}
							>
								{sec.icon} {sec.label}
							</button>
						{/each}
					</div>
				</div>
				<div class="suggest-form__actions">
					<button class="btn btn--save" onclick={submitSuggestion} disabled={sugSubmitting || !sugTitle.trim() || !sugBody.trim() || sugSections.length === 0}>
						{sugSubmitting ? '...' : 'Post Suggestion'}
					</button>
					<button class="btn btn--reset" onclick={() => { showSuggestForm = false; }}>Cancel</button>
				</div>
			</div>
		{/if}

		{#if suggestions.length === 0 && !showSuggestForm}
			<p class="muted empty-hint">No suggestions yet. Be the first to share your ideas!</p>
		{:else if suggestions.length > 0}
			<ForumThreadTable
				headers={[
					{ label: 'Suggestion', type: 'topic' },
					{ label: 'Comments', type: 'stat' },
					{ label: 'Votes', type: 'stat' },
					{ label: 'Activity', type: 'last' }
				]}
			>
				{#each suggestions as s}
					{@const sectionTags = s.sections.map((sec: string) => {
						const meta = SECTIONS.find(x => x.id === sec);
						return meta ? { label: `${meta.icon} ${meta.label}`, variant: 'section' } : null;
					}).filter(Boolean)}
					<ForumThreadRow
						href={localizeHref(`/games/${game.game_id}/forum/suggestions/${s.id}`)}
						title={s.title}
						tags={sectionTags}
						authorLine="by <strong>{s.display_name}</strong> · {timeAgo(s.updated_at || s.created_at)}"
						stat1={s.comment_count}
						stat2="👍 {s.vote_counts.agree} 👎 {s.vote_counts.disagree}"
						lastPostTime={timeAgo(s.updated_at || s.created_at)}
					>
						{#snippet icon()}<Lightbulb size={16} />{/snippet}
					</ForumThreadRow>
				{/each}
			</ForumThreadTable>
		{/if}

		<!-- General Discussion -->
		<div class="thread-section-header">
			<h2><MessageSquare size={18} /> Discussion</h2>
			{#if hasApprovedProfile && data.gameBoardId}
				<Button.Root variant="accent" size="sm" onclick={() => { showDiscussForm = true; }}>+ New Thread</Button.Root>
			{:else if !$user}
				<span class="muted small">Sign in to discuss</span>
			{:else if !hasApprovedProfile}
				<span class="muted small">Approved profile required</span>
			{:else if !data.gameBoardId}
				<span class="muted small">Discussion board not yet created</span>
			{/if}
		</div>

		{#if showDiscussForm && data.gameBoardId}
			<div class="suggest-form">
				<input class="suggest-form__title" type="text" bind:value={discTitle} placeholder="Thread title" maxlength="200" />
				<textarea class="suggest-form__body" bind:value={discBody} rows="4" placeholder="Write your post... (Markdown supported)" maxlength="10000"></textarea>
				<div class="suggest-form__actions">
					<button class="btn btn--save" onclick={submitDiscussionThread} disabled={discSubmitting || !discTitle.trim() || !discBody.trim()}>
						{discSubmitting ? '...' : 'Post Thread'}
					</button>
					<button class="btn btn--reset" onclick={() => { showDiscussForm = false; }}>Cancel</button>
				</div>
			</div>
		{/if}

		{#if data.discussionThreads.length === 0 && !showDiscussForm}
			<p class="muted empty-hint">No discussion threads yet. Start a conversation!</p>
		{:else if data.discussionThreads.length > 0}
			<ForumThreadTable empty={false}>
				{#each data.discussionThreads as t}
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
		{/if}
	</div>
</div>

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
	.forum-overview { max-width: 960px; margin: 0 auto; }

	/* Header */
	.forum-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
	.forum-header__title { font-size: 1.25rem; margin: 0; }
	.forum-header__actions { display: flex; align-items: center; gap: 0.5rem; }

	/* Committee strip */
	.committee-strip { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.committee-strip__label { font-size: 0.82rem; font-weight: 600; color: var(--muted); }
	.committee-strip__members { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.committee-badge { font-size: 0.82rem; padding: 0.15rem 0.5rem; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 5px; }
	.member-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem; }
	.member-chip__avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; }
	.member-chip__initial { width: 18px; height: 18px; border-radius: 50%; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; }
	.member-chip__name { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.member-chip__badge { font-size: 0.7rem; }
	.member-chip--more { color: var(--muted); font-style: italic; }

	/* Thread list */
	.thread-list { display: flex; flex-direction: column; gap: 0; }

	/* Section headers */
	.thread-section-header { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0 0.35rem; margin-top: 0.75rem; border-top: 1px solid var(--border); }
	.thread-section-header h2 { margin: 0; font-size: 1rem; }

	/* Thread card (Game Initialization pinned card only) */
	.thread-card { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--fg); transition: border-color 0.15s, background 0.15s; margin-bottom: 0.35rem; }
	.thread-card:hover { border-color: var(--accent); background: rgba(99, 102, 241, 0.03); }
	.thread-card--pinned { background: rgba(99, 102, 241, 0.04); border-color: rgba(99, 102, 241, 0.2); }
	.thread-card__pin { font-size: 1.2rem; flex-shrink: 0; padding-top: 0.1rem; }
	.thread-card__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
	.thread-card__title { font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.thread-card__tag { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 3px; }
	.thread-card__tag--cr { background: rgba(99, 102, 241, 0.12); color: rgba(99, 102, 241, 0.85); }
	.thread-card__desc { font-size: 0.84rem; color: var(--muted); line-height: 1.4; }
	.thread-card__arrow { color: var(--muted); font-size: 1rem; padding-top: 0.25rem; flex-shrink: 0; }

	/* Suggest form */
	.suggest-form { padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.5rem; }
	.suggest-form__title { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9rem; margin-bottom: 0.5rem; box-sizing: border-box; }
	.suggest-form__title:focus { outline: none; border-color: var(--accent); }
	.suggest-form__body { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.88rem; resize: vertical; box-sizing: border-box; }
	.suggest-form__body:focus { outline: none; border-color: var(--accent); }
	.suggest-form__sections { margin-top: 0.5rem; }
	.suggest-form__label { font-size: 0.82rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.3rem; }
	.suggest-form__chips { display: flex; gap: 0.25rem; flex-wrap: wrap; }
	.section-chip { padding: 0.25rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; font-size: 0.78rem; cursor: pointer; font-family: inherit; color: var(--fg); transition: all 0.1s; }
	.section-chip:hover { border-color: var(--accent); }
	.section-chip--active { background: rgba(59, 195, 110, 0.12); border-color: var(--accent); color: var(--accent); }
	.suggest-form__actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

	.empty-hint { font-size: 0.88rem; padding: 0.5rem 1rem; }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }
</style>
