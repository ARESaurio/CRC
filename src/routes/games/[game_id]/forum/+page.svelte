<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { timeAgo } from '$lib/utils';
	import { Pin, Lightbulb, MessageSquare, Pencil, ChevronRight } from 'lucide-svelte';
	import ForumThreadTable from '$lib/components/forum/ForumThreadTable.svelte';
	import ForumThreadRow from '$lib/components/forum/ForumThreadRow.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';

	let { data } = $props();
	const game = $derived(data.game);
	const members = $state(data.members);
	const stats = $derived(data.boardStats);
	const recent = $derived(data.recentActivity || []);

	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	// ── Confirm dialog ───────────────────────────────────────────────────
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

	// Committee eligibility
	let hasGameRun = $state(false);
	let eligibilityChecked = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('runner_id').eq('user_id', u.id).maybeSingle()
				.then(({ data: profile }) => {
					if (!profile?.runner_id) { hasGameRun = false; eligibilityChecked = true; return; }
					supabase.from('runs').select('public_id', { count: 'exact', head: true })
						.eq('game_id', game.game_id).eq('runner_id', profile.runner_id).eq('status', 'approved')
						.then(({ count }) => { hasGameRun = (count ?? 0) > 0; eligibilityChecked = true; });
				});
		} else { hasGameRun = false; eligibilityChecked = true; }
	});

	async function joinCommittee() {
		if (!$user) return;
		joining = true;
		if (!isAdmin) {
			const { data: profile } = await supabase.from('profiles').select('runner_id').eq('user_id', $user.id).maybeSingle();
			if (!profile?.runner_id) { showToast('error', 'You need an approved runner profile to join.'); joining = false; return; }
			const { count } = await supabase.from('runs').select('public_id', { count: 'exact', head: true })
				.eq('game_id', game.game_id).eq('runner_id', profile.runner_id).eq('status', 'approved');
			if ((count ?? 0) < 1) { showToast('error', 'You need at least 1 approved run for this game to join the committee.'); joining = false; return; }
		}
		const role = members.length === 0 ? 'editor' : 'member';
		const { data: row, error } = await supabase.from('rules_committee_members').insert({ game_id: game.game_id, user_id: $user.id, role }).select().single();
		if (error) {
			showToast('error', error.message.includes('duplicate') ? 'Already a member.' : error.message);
		} else if (row) {
			const { data: profile } = await supabase.from('profiles').select('display_name, runner_id, avatar_url').eq('user_id', $user.id).maybeSingle();
			members.push({ ...row, display_name: profile?.display_name || 'You', runner_id: profile?.runner_id || null, avatar_url: profile?.avatar_url || null });
			showToast('success', role === 'editor' ? 'Joined as editor!' : 'Joined!');
		}
		joining = false;
	}

	async function leaveCommittee() {
		if (!$user) return;
		const doLeave = async () => {
			const { error } = await supabase.from('rules_committee_members').delete().eq('game_id', game.game_id).eq('user_id', $user!.id);
			if (!error) {
				const idx = members.findIndex((m: any) => m.user_id === $user?.id);
				if (idx >= 0) members.splice(idx, 1);
				showToast('success', 'Left the committee.');
			}
		};
		if (isEditor) {
			openConfirm('Leave Committee', 'You are the editor. Leaving will remove your editor role. Continue?', doLeave);
		} else { await doLeave(); }
	}
</script>

<svelte:head>
	<title>{game.game_name} Forum | CRC</title>
</svelte:head>

<div class="forum-index">
	<div class="forum-index__header">
		<div class="forum-index__header-left">
			<h1>{game.game_name} Forum</h1>
			{#if isMember}
				<span class="committee-badge"><Pencil size={12} /> Committee {isEditor ? '(Editor)' : 'Member'}</span>
			{/if}
		</div>
		<div class="forum-index__header-actions">
			{#if $user && !isMember && eligibilityChecked && (hasGameRun || isAdmin)}
				<Button.Root variant="outline" size="sm" onclick={joinCommittee} disabled={joining}>
					{joining ? 'Joining...' : 'Join Committee'}
				</Button.Root>
			{:else if isMember}
				<Button.Root variant="outline" size="sm" onclick={leaveCommittee}>Leave</Button.Root>
			{/if}
		</div>
	</div>

	<!-- Committee strip -->
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

	<!-- Board table -->
	<div class="board-table">
		<div class="board-table__head">
			<span class="board-table__col board-table__col--board">Section</span>
			<span class="board-table__col board-table__col--stats">Threads</span>
			<span class="board-table__col board-table__col--stats">Posts</span>
			<span class="board-table__col board-table__col--last">Latest</span>
		</div>

		{#if data.isCommunityReview}
			<a class="board-row" href={localizeHref(`/games/${game.game_id}/forum/init`)}>
				<div class="board-row__info">
					<span class="board-row__icon"><Pin size={22} /></span>
					<div class="board-row__text">
						<span class="board-row__name">Game Initialization <span class="board-row__tag board-row__tag--cr">Community Review</span></span>
						<span class="board-row__desc">Rough draft, proposals, and voting for this game's rules, categories, and structure.</span>
					</div>
				</div>
				<span class="board-row__stat">—</span>
				<span class="board-row__stat">—</span>
				<div class="board-row__last"><span class="board-row__no-posts">View sections →</span></div>
			</a>
		{/if}

		<a class="board-row" href={localizeHref(`/games/${game.game_id}/forum/suggestions`)}>
			<div class="board-row__info">
				<span class="board-row__icon"><Lightbulb size={22} /></span>
				<div class="board-row__text">
					<span class="board-row__name">Suggestions</span>
					<span class="board-row__desc">Propose changes to this game's categories, rules, and structure.</span>
				</div>
			</div>
			<span class="board-row__stat">{stats.suggestions.count}</span>
			<span class="board-row__stat">—</span>
			<div class="board-row__last">
				{#if stats.suggestions.latest}
					<span class="board-row__last-title">{stats.suggestions.latest.title}</span>
					<span class="board-row__last-meta">by <strong>{stats.suggestions.latest.authorName}</strong> · {timeAgo(stats.suggestions.latest.date)}</span>
				{:else}
					<span class="board-row__no-posts">No suggestions yet</span>
				{/if}
			</div>
		</a>

		<a class="board-row" href={localizeHref(`/games/${game.game_id}/forum/discussion`)}>
			<div class="board-row__info">
				<span class="board-row__icon"><MessageSquare size={22} /></span>
				<div class="board-row__text">
					<span class="board-row__name">Discussion</span>
					<span class="board-row__desc">General community discussion about this game.</span>
				</div>
			</div>
			<span class="board-row__stat">{stats.discussion.count}</span>
			<span class="board-row__stat">{stats.discussion.replyCount}</span>
			<div class="board-row__last">
				{#if stats.discussion.latest}
					<span class="board-row__last-title">{stats.discussion.latest.title}</span>
					<span class="board-row__last-meta">
						{#if stats.discussion.latest.authorAvatar}
							<img class="board-row__last-avatar" src={stats.discussion.latest.authorAvatar} alt="" />
						{/if}
						by <strong>{stats.discussion.latest.authorName}</strong> · {timeAgo(stats.discussion.latest.date)}
					</span>
				{:else}
					<span class="board-row__no-posts">No threads yet</span>
				{/if}
			</div>
		</a>
	</div>

	<div class="forum-stats">
		<span>{stats.suggestions.count + stats.discussion.count} thread{stats.suggestions.count + stats.discussion.count !== 1 ? 's' : ''}</span>
		<span class="forum-stats__sep">·</span>
		<span>{members.length} committee member{members.length !== 1 ? 's' : ''}</span>
	</div>

	<!-- Recent Activity -->
	{#if recent.length > 0}
		<h2 class="recent-title">Recent Activity</h2>
		<ForumThreadTable empty={recent.length === 0} emptyMessage="No activity yet.">
			{#each recent as item}
				<ForumThreadRow
					href={localizeHref(item.href)}
					title={item.title}
					pinned={item.is_pinned}
					locked={item.is_locked}
					tags={[
						{ label: item.type === 'suggestion' ? 'Suggestion' : 'Discussion', variant: item.type === 'suggestion' ? 'section' : undefined }
					]}
					authorName={item.author_name}
					authorTime={timeAgo(item.created_at)}
					stat1={item.reply_count ?? 0}
					stat2={item.view_count ?? 0}
					lastPostName={item.last_post_by_name}
					lastPostAvatar={item.last_post_by_avatar}
					lastPostTime={timeAgo(item.date)}
				>
					{#snippet icon()}{#if item.type === 'suggestion'}<Lightbulb size={16} />{:else}<MessageSquare size={16} />{/if}{/snippet}
				</ForumThreadRow>
			{/each}
		</ForumThreadTable>
	{:else}
		<p class="muted empty-hint">No activity yet. Start a suggestion or discussion!</p>
	{/if}
</div>

{#if toast}
	<div class="toast toast--{toast.type}">{toast.text}</div>
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
	.forum-index { max-width: 960px; margin: 0 auto; }
	.forum-index__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
	.forum-index__header-left { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.forum-index__header-left h1 { margin: 0; font-size: 1.35rem; }
	.forum-index__header-actions { display: flex; align-items: center; gap: 0.5rem; }

	.committee-badge { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.82rem; padding: 0.15rem 0.5rem; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 5px; }
	.committee-strip { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.committee-strip__label { font-size: 0.82rem; font-weight: 600; color: var(--muted); }
	.committee-strip__members { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.member-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem; }
	.member-chip__avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; }
	.member-chip__initial { width: 18px; height: 18px; border-radius: 50%; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; }
	.member-chip__name { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.member-chip__badge { font-size: 0.7rem; }
	.member-chip--more { color: var(--muted); font-style: italic; }

	.board-table { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
	.board-table__head { display: grid; grid-template-columns: 1fr 70px 70px 200px; gap: 0.5rem; padding: 0.5rem 0.85rem; background: linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border-bottom: 1px solid var(--border); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
	.board-table__col--stats { text-align: center; }
	.board-row { display: grid; grid-template-columns: 1fr 70px 70px 200px; gap: 0.5rem; align-items: center; padding: 0.75rem 0.85rem; text-decoration: none; color: var(--fg); border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s; }
	.board-row:last-child { border-bottom: none; }
	.board-row:hover { background: rgba(255,255,255,0.03); }
	.board-row__info { display: flex; align-items: flex-start; gap: 0.65rem; }
	.board-row__icon { flex-shrink: 0; color: var(--accent); padding-top: 0.1rem; }
	.board-row__text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
	.board-row__name { font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.board-row__desc { font-size: 0.82rem; color: var(--muted); line-height: 1.3; }
	.board-row__stat { text-align: center; font-size: 0.88rem; font-weight: 600; color: var(--text-muted); }
	.board-row__last { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.board-row__last-title { font-size: 0.82rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.board-row__last-meta { font-size: 0.72rem; color: var(--muted); display: flex; align-items: center; gap: 0.25rem; }
	.board-row__last-avatar { width: 14px; height: 14px; border-radius: 50%; object-fit: cover; }
	.board-row__no-posts { font-size: 0.8rem; color: var(--muted); font-style: italic; }
	.board-row__tag { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; padding: 0.05rem 0.35rem; border-radius: 3px; }
	.board-row__tag--cr { background: rgba(99,102,241,0.12); color: rgba(99,102,241,0.85); }

	.forum-stats { display: flex; align-items: center; gap: 0.4rem; padding: 0.75rem 0; font-size: 0.8rem; color: var(--muted); }
	.forum-stats__sep { opacity: 0.4; }

	.recent-title { margin: 0.5rem 0 0.75rem; font-size: 1.15rem; }
	.empty-hint { font-size: 0.88rem; padding: 0.5rem 0; }
	.muted { color: var(--muted); }

	.toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.88rem; font-weight: 500; z-index: 999; animation: toast-in 0.2s; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
	@keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

	.alert-dialog-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }

	@media (max-width: 700px) {
		.board-table__head { display: none; }
		.board-row { grid-template-columns: 1fr; gap: 0.25rem; }
		.board-row__stat { display: none; }
		.board-row__last { flex-direction: row; gap: 0.5rem; }
	}
</style>
