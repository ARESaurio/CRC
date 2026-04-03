<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate, timeAgo } from '$lib/utils';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { Pin, Lock, MessageCircle, Lightbulb, Pencil, User, ChevronRight, ChevronLeft, MessageSquare, Eye, Plus, Search, ThumbsUp, ThumbsDown} from 'lucide-svelte';
	import { SECTIONS } from './consensus';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import ForumThreadTable from '$lib/components/forum/ForumThreadTable.svelte';
	import ForumThreadRow from '$lib/components/forum/ForumThreadRow.svelte';
	import RetroToolbar from '$lib/components/forum/RetroToolbar.svelte';
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

	// ── Admin check ──────────────────────────────────────────────────
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

	// ── Search ───────────────────────────────────────────────────────────
	let searchInput = $state('');
	const filteredSuggestions = $derived(
		searchInput.trim()
			? suggestions.filter((s: any) => s.title.toLowerCase().includes(searchInput.trim().toLowerCase()))
			: suggestions
	);
	const filteredThreads = $derived(
		searchInput.trim()
			? data.discussionThreads.filter((t: any) => t.title.toLowerCase().includes(searchInput.trim().toLowerCase()))
			: data.discussionThreads
	);

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
	let discTextareaEl = $state<HTMLTextAreaElement | null>(null);

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

<div class="page-width">
	<div class="forum-index">
		{#if toast}
			<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
		{/if}

		<!-- Breadcrumb -->
		<nav class="forum-breadcrumb">
			<a href={localizeHref('/forum')}>Forum</a>
			<span class="forum-breadcrumb__sep">›</span>
			<a href={localizeHref(`/games/${game.game_id}`)}>{game.game_name}</a>
			<span class="forum-breadcrumb__sep">›</span>
			<span>Game Forum</span>
		</nav>

		<!-- Header -->
		<div class="forum-index__header">
			<div class="forum-index__header-left">
				<h1>{game.game_name} Forum</h1>
				{#if isMember}
					<span class="committee-badge">
						{#if isEditor}<Pencil size={12} /> Editor{:else}<User size={12} /> Member{/if}
					</span>
				{/if}
			</div>
			<div class="forum-index__header-actions">
				{#if $user && !isMember}
					{#if isAdmin || hasGameRun}
						<Button.Root variant="accent" size="sm" onclick={joinCommittee} disabled={joining}>
							{joining ? '...' : 'Join Committee'}
						</Button.Root>
					{:else if eligibilityChecked}
						<span class="muted small">Need 1 approved run to join</span>
					{/if}
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

		<!-- Board listing (Game Init + Suggestions + Discussion) -->
		<div class="board-table">
			<div class="board-table__head">
				<span class="board-table__col board-table__col--board">Section</span>
				<span class="board-table__col board-table__col--stats">Threads</span>
				<span class="board-table__col board-table__col--stats">Posts</span>
				<span class="board-table__col board-table__col--last">Latest</span>
			</div>

			<a class="board-row" href={localizeHref(`/games/${game.game_id}/forum/init`)}>
				<div class="board-row__info">
					<span class="board-row__icon"><Pin size={22} /></span>
					<div class="board-row__text">
						<span class="board-row__name">
							Game Initialization
							{#if data.isCommunityReview}
								<span class="board-row__tag board-row__tag--cr">Community Review</span>
							{/if}
						</span>
						<span class="board-row__desc">
							{#if data.isCommunityReview}
								Rough draft, proposals, and voting for this game's rules, categories, and structure.
							{:else}
								Section-by-section discussion and drafting for this game's configuration.
							{/if}
						</span>
					</div>
				</div>
				<span class="board-row__stat">—</span>
				<span class="board-row__stat">—</span>
				<div class="board-row__last">
					<span class="board-row__no-posts">View sections →</span>
				</div>
			</a>

			<a class="board-row" href="#suggestions">
				<div class="board-row__info">
					<span class="board-row__icon"><Lightbulb size={22} /></span>
					<div class="board-row__text">
						<span class="board-row__name">Suggestions</span>
						<span class="board-row__desc">Propose changes to this game's categories, rules, and structure.</span>
					</div>
				</div>
				<span class="board-row__stat">{suggestions.length}</span>
				<span class="board-row__stat">{suggestions.reduce((sum: number, s: any) => sum + (s.comment_count || 0), 0)}</span>
				<div class="board-row__last">
					{#if suggestions.length > 0}
						<span class="board-row__last-title">{suggestions[0].title}</span>
						<span class="board-row__last-meta">
							by <strong>{suggestions[0].display_name}</strong>
							· {timeAgo(suggestions[0].updated_at || suggestions[0].created_at)}
						</span>
					{:else}
						<span class="board-row__no-posts">No suggestions yet</span>
					{/if}
				</div>
			</a>

			<a class="board-row" href="#discussion">
				<div class="board-row__info">
					<span class="board-row__icon"><MessageSquare size={22} /></span>
					<div class="board-row__text">
						<span class="board-row__name">Discussion</span>
						<span class="board-row__desc">General community discussion about this game.</span>
					</div>
				</div>
				<span class="board-row__stat">{data.discussionThreads.length}</span>
				<span class="board-row__stat">{data.discussionThreads.reduce((sum: number, t: any) => sum + (t.reply_count || 0), 0)}</span>
				<div class="board-row__last">
					{#if data.discussionThreads.length > 0}
						{@const latest = data.discussionThreads[0]}
						<span class="board-row__last-title">{latest.title}</span>
						<span class="board-row__last-meta">
							{#if latest.last_post_by_avatar}
								<img class="board-row__last-avatar" src={latest.last_post_by_avatar} alt="" />
							{/if}
							by <strong>{latest.last_post_by_name || latest.author_name}</strong>
							· {timeAgo(latest.last_post_at || latest.created_at)}
						</span>
					{:else}
						<span class="board-row__no-posts">No threads yet</span>
					{/if}
				</div>
			</a>
		</div>

		<div class="forum-stats">
			<span>{suggestions.length + data.discussionThreads.length} thread{suggestions.length + data.discussionThreads.length !== 1 ? 's' : ''}</span>
			<span class="forum-stats__sep">·</span>
			<span>{members.length} committee member{members.length !== 1 ? 's' : ''}</span>
		</div>

		<!-- Recent Threads -->
		<div class="recent-threads">
			<h2 class="recent-threads__title">Recent Threads</h2>

			<!-- Filter bar -->
			<div class="filter-bar">
				<div class="filter-bar__search">
					<Search size={14} />
					<input
						type="text"
						bind:value={searchInput}
						placeholder="Search threads..."
						onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
					/>
				</div>
				<div class="filter-bar__actions">
					{#if hasApprovedProfile}
						<Button.Root variant="accent" size="sm" onclick={() => { showSuggestForm = !showSuggestForm; showDiscussForm = false; }}>
							+ Suggestion
						</Button.Root>
					{/if}
					{#if hasApprovedProfile && data.gameBoardId}
						<Button.Root variant="accent" size="sm" onclick={() => { showDiscussForm = !showDiscussForm; showSuggestForm = false; }}>
							+ Thread
						</Button.Root>
					{:else if !$user}
						<span class="muted small">Sign in to post</span>
					{:else if !hasApprovedProfile}
						<span class="muted small">Approved profile required</span>
					{/if}
				</div>
			</div>

			<!-- Suggestion form -->
			{#if showSuggestForm}
				<div class="new-thread-form">
					<input class="new-thread-form__title" type="text" bind:value={sugTitle} placeholder="Suggestion title" maxlength="200" />
					<textarea class="new-thread-form__body" bind:value={sugBody} rows="4" placeholder="Describe your suggestion... (Markdown supported)" maxlength="3000"></textarea>
					<div class="new-thread-form__sections">
						<span class="new-thread-form__label">Sections this applies to:</span>
						<div class="new-thread-form__chips">
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
					<div class="new-thread-form__actions">
						<button class="btn btn--accent" onclick={submitSuggestion} disabled={sugSubmitting || !sugTitle.trim() || !sugBody.trim() || sugSections.length === 0}>
							{sugSubmitting ? 'Posting...' : 'Post Suggestion'}
						</button>
						<button class="btn btn--reset" onclick={() => { showSuggestForm = false; }}>Cancel</button>
					</div>
				</div>
			{/if}

			<!-- Discussion thread form -->
			{#if showDiscussForm && data.gameBoardId}
				<div class="new-thread-form">
					<input class="new-thread-form__title" type="text" bind:value={discTitle} placeholder="Thread title" maxlength="200" />
					<RetroToolbar bind:textarea={discTextareaEl} />
					<textarea
						class="new-thread-form__body new-thread-form__body--with-toolbar"
						bind:this={discTextareaEl}
						bind:value={discBody}
						rows="6"
						placeholder="Write your post... (Markdown supported)"
						maxlength="10000"
					></textarea>
					<div class="new-thread-form__actions">
						<button class="btn btn--accent" onclick={submitDiscussionThread} disabled={discSubmitting || !discTitle.trim() || !discBody.trim()}>
							{discSubmitting ? 'Posting...' : 'Post Thread'}
						</button>
						<button class="btn btn--reset" onclick={() => { showDiscussForm = false; }}>Cancel</button>
					</div>
				</div>
			{/if}

			<!-- Suggestions -->
			{#if filteredSuggestions.length > 0}
				<h3 class="section-heading" id="suggestions"><Lightbulb size={16} /> Suggestions</h3>
				<ForumThreadTable
					headers={[
						{ label: 'Suggestion', type: 'topic' },
						{ label: 'Comments', type: 'stat' },
						{ label: 'Votes', type: 'stat' },
						{ label: 'Activity', type: 'last' }
					]}
				>
					{#each filteredSuggestions as s}
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
							stat2="<ThumbsUp size={12} /> {s.vote_counts.agree} <ThumbsDown size={12} /> {s.vote_counts.disagree}"
							lastPostTime={timeAgo(s.updated_at || s.created_at)}
						>
							{#snippet icon()}<Lightbulb size={16} />{/snippet}
						</ForumThreadRow>
					{/each}
				</ForumThreadTable>
			{:else if searchInput.trim() && suggestions.length > 0}
				<!-- Search active but no suggestion matches — skip silently -->
			{:else if !searchInput.trim() && suggestions.length === 0}
				<h3 class="section-heading" id="suggestions"><Lightbulb size={16} /> Suggestions</h3>
				<p class="muted empty-hint">No suggestions yet. Be the first to share your ideas!</p>
			{/if}

			<!-- Discussion -->
			{#if filteredThreads.length > 0 || (!searchInput.trim() && data.discussionThreads.length === 0)}
				<h3 class="section-heading" id="discussion"><MessageSquare size={16} /> Discussion</h3>
			{/if}

			{#if filteredThreads.length > 0}
				<ForumThreadTable empty={false}>
					{#each filteredThreads as t}
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
			{:else if !searchInput.trim() && data.discussionThreads.length === 0}
				<p class="muted empty-hint">No discussion threads yet. Start a conversation!</p>
			{/if}

			{#if searchInput.trim() && filteredSuggestions.length === 0 && filteredThreads.length === 0}
				<p class="muted empty-hint">No threads matching "{searchInput}".</p>
			{/if}
		</div>
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
	.forum-index { max-width: 960px; margin: 0 auto; }
	.forum-index__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
	.forum-index__header-left { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.forum-index__header-left h1 { margin: 0; font-size: 1.35rem; }
	.forum-index__header-actions { display: flex; align-items: center; gap: 0.5rem; }

	/* ── Breadcrumb (matches /forum/[board_slug]) ─────────── */
	.forum-breadcrumb {
		display: flex; align-items: center; gap: 0.35rem;
		font-size: 0.82rem; color: var(--muted); margin-bottom: 0.75rem;
	}
	.forum-breadcrumb a { color: var(--accent); text-decoration: none; }
	.forum-breadcrumb a:hover { text-decoration: underline; }
	.forum-breadcrumb__sep { opacity: 0.5; }

	/* ── Committee ─────────────────────────────────────────── */
	.committee-badge {
		display: inline-flex; align-items: center; gap: 0.25rem;
		font-size: 0.82rem; padding: 0.15rem 0.5rem;
		background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 5px;
	}
	.committee-strip { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
	.committee-strip__label { font-size: 0.82rem; font-weight: 600; color: var(--muted); }
	.committee-strip__members { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.member-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem; }
	.member-chip__avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; }
	.member-chip__initial { width: 18px; height: 18px; border-radius: 50%; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; }
	.member-chip__name { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.member-chip__badge { font-size: 0.7rem; }
	.member-chip--more { color: var(--muted); font-style: italic; }

	/* ── Board table (matches /forum) ─────────────────────── */
	.board-table { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
	.board-table__head {
		display: grid; grid-template-columns: 1fr 70px 70px 200px; gap: 0.5rem;
		padding: 0.5rem 0.85rem;
		background: linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
		border-bottom: 1px solid var(--border);
		font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);
	}
	.board-table__col--stats { text-align: center; }

	.board-row {
		display: grid; grid-template-columns: 1fr 70px 70px 200px; gap: 0.5rem; align-items: center;
		padding: 0.75rem 0.85rem; text-decoration: none; color: var(--fg);
		border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.12s;
	}
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

	/* ── Recent Threads (matches /forum) ──────────────────── */
	.recent-threads { margin-top: 1rem; }
	.recent-threads__title { margin: 0 0 0.75rem; font-size: 1.15rem; }

	.section-heading {
		display: flex; align-items: center; gap: 0.35rem;
		margin: 1rem 0 0.5rem; font-size: 0.95rem; font-weight: 700; color: var(--fg);
	}
	.section-heading:first-of-type { margin-top: 0; }

	/* ── Filter bar (matches /forum) ──────────────────────── */
	.filter-bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.filter-bar__search {
		display: flex; align-items: center; gap: 0.4rem;
		padding: 0.3rem 0.6rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 6px;
		flex: 1; min-width: 160px; max-width: 280px; color: var(--muted);
	}
	.filter-bar__search input {
		border: none; background: none; color: var(--fg);
		font-size: 0.85rem; font-family: inherit; outline: none; width: 100%;
	}
	.filter-bar__search:focus-within { border-color: var(--accent); }
	.filter-bar__actions { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }

	/* ── New thread form (matches /forum/[board_slug]) ─────── */
	.new-thread-form {
		margin-bottom: 1rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem;
	}
	.new-thread-form__title {
		width: 100%; padding: 0.5rem 0.65rem; background: var(--bg);
		border: 1px solid var(--border); border-radius: var(--radius-sm);
		color: var(--fg); font-family: inherit; font-size: 0.95rem; font-weight: 600;
		margin-bottom: 0.5rem; box-sizing: border-box;
	}
	.new-thread-form__title:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__body {
		width: 100%; padding: 0.5rem 0.65rem; background: var(--bg);
		border: 1px solid var(--border); border-radius: var(--radius-sm);
		color: var(--fg); font-family: inherit; font-size: 0.88rem;
		resize: vertical; box-sizing: border-box;
	}
	.new-thread-form__body--with-toolbar { border-radius: 0 0 var(--radius-sm) var(--radius-sm); }
	.new-thread-form__body:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
	.new-thread-form__sections { margin-top: 0.5rem; }
	.new-thread-form__label { font-size: 0.82rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.3rem; }
	.new-thread-form__chips { display: flex; gap: 0.25rem; flex-wrap: wrap; }

	.section-chip { padding: 0.25rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; font-size: 0.78rem; cursor: pointer; font-family: inherit; color: var(--fg); transition: all 0.1s; }
	.section-chip:hover { border-color: var(--accent); }
	.section-chip--active { background: rgba(59, 195, 110, 0.12); border-color: var(--accent); color: var(--accent); }

	.empty-hint { font-size: 0.88rem; padding: 0.5rem 1rem; }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }

	@media (max-width: 700px) {
		.board-table__head { display: none; }
		.board-row { grid-template-columns: 1fr; gap: 0.25rem; }
		.board-row__stat { display: none; }
		.board-row__last { flex-direction: row; gap: 0.5rem; }
		.filter-bar { flex-direction: column; align-items: stretch; }
		.filter-bar__search { max-width: none; }
		.filter-bar__actions { margin-left: 0; }
	}
</style>
