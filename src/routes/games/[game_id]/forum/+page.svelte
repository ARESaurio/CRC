<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';
	import { SECTIONS } from './consensus';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
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

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		if (days < 30) return `${days}d ago`;
		return formatDate(dateStr);
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
				<span class="committee-badge">{isEditor ? '✏️ Editor' : '👤 Member'}</span>
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
						{#if m.role === 'editor'}<span class="member-chip__badge">✏️</span>{/if}
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
			<div class="thread-card__pin">📌</div>
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
			<span class="thread-card__arrow">→</span>
		</a>

		<!-- Suggestions -->
		<div class="thread-section-header">
			<h2>💡 Suggestions</h2>
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
		{:else}
			{#each suggestions as s}
				<a class="thread-card" href={localizeHref(`/games/${game.game_id}/forum/suggestions/${s.id}`)}>
					<div class="thread-card__icon">💡</div>
					<div class="thread-card__body">
						<span class="thread-card__title">{s.title}</span>
						<span class="thread-card__meta">
							by {s.display_name}
							· {s.comment_count} comment{s.comment_count !== 1 ? 's' : ''}
							· 👍 {s.vote_counts.agree} 👎 {s.vote_counts.disagree}
							· {timeAgo(s.updated_at || s.created_at)}
						</span>
						<div class="thread-card__tags">
							{#each s.sections as sec}
								{@const meta = SECTIONS.find(x => x.id === sec)}
								{#if meta}
									<span class="section-tag">{meta.icon} {meta.label}</span>
								{/if}
							{/each}
						</div>
					</div>
					<span class="thread-card__arrow">→</span>
				</a>
			{/each}
		{/if}

		<!-- General Discussion -->
		<div class="thread-section-header">
			<h2>💬 Discussion</h2>
		</div>
		<div class="thread-empty">
			<p class="muted">Community discussion threads are coming soon. Runners will be able to start threads for strategy talk, run analysis, and more.</p>
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

	/* Thread card */
	.thread-card { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--fg); transition: border-color 0.15s, background 0.15s; margin-bottom: 0.35rem; }
	.thread-card:hover { border-color: var(--accent); background: rgba(99, 102, 241, 0.03); }
	.thread-card--pinned { background: rgba(99, 102, 241, 0.04); border-color: rgba(99, 102, 241, 0.2); }
	.thread-card__pin, .thread-card__icon { font-size: 1.2rem; flex-shrink: 0; padding-top: 0.1rem; }
	.thread-card__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
	.thread-card__title { font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.thread-card__tag { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 3px; }
	.thread-card__tag--cr { background: rgba(99, 102, 241, 0.12); color: rgba(99, 102, 241, 0.85); }
	.thread-card__desc { font-size: 0.84rem; color: var(--muted); line-height: 1.4; }
	.thread-card__meta { font-size: 0.78rem; color: var(--muted); display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.thread-card__tags { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.15rem; }
	.thread-card__arrow { color: var(--muted); font-size: 1rem; padding-top: 0.25rem; flex-shrink: 0; }

	.section-tag { font-size: 0.7rem; padding: 0.1rem 0.4rem; background: var(--bg); border: 1px solid var(--border); border-radius: 3px; color: var(--muted); }

	/* Thread empty state */
	.thread-empty { padding: 1.25rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-align: center; }

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
