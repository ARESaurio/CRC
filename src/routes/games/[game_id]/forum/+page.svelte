<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';
	import { SECTIONS, calculateAllConsensus, type SectionId } from './consensus';
	import * as Accordion from '$lib/components/ui/accordion/index.js';

	let { data } = $props();
	const game = $derived(data.game);

	let members = $state(data.members);
	let suggestions = $state(data.suggestions);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

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

	// ── Consensus for section status indicators ──────────────────────────
	const consensus = $derived(calculateAllConsensus(data.drafts, data.votes));

	// ── Section summary data ─────────────────────────────────────────────
	const sectionSummary = $derived.by(() => {
		return SECTIONS.map(s => {
			const sectionDrafts = data.drafts.filter((d: any) => d.section === s.id);
			const draftCount = sectionDrafts.length;
			const latestDraft = sectionDrafts[0]?.updated_at || null;
			const latestComment = data.latestComments.find((c: any) => c.section === s.id)?.created_at || null;
			const lastActivity = latestDraft && latestComment
				? (new Date(latestDraft) > new Date(latestComment) ? latestDraft : latestComment)
				: latestDraft || latestComment || null;
			return { ...s, draftCount, lastActivity, consensus: consensus[s.id] };
		});
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
		if (isEditor && !confirm('You are the editor. Leaving will remove your editor role. Continue?')) return;
		const { error } = await supabase.from('rules_committee_members').delete().eq('game_id', game.game_id).eq('user_id', $user.id);
		if (!error) {
			members = members.filter((m: any) => m.user_id !== $user?.id);
			showToast('success', 'Left the committee.');
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
			title: sugTitle.trim().slice(0, 200),
			body: sugBody.trim().slice(0, 3000),
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

	function statusIcon(status: string): string {
		switch (status) {
			case 'consensus': case 'single-draft': return '✓';
			case 'conflict': return '⚡';
			default: return '—';
		}
	}

	function statusClass(status: string): string {
		switch (status) {
			case 'consensus': case 'single-draft': return 'forum-thread--ok';
			case 'conflict': return 'forum-thread--conflict';
			default: return 'forum-thread--empty';
		}
	}
</script>

<svelte:head><title>Forum — {game.game_name} | CRC</title></svelte:head>

<div class="forum-overview">
	{#if toast}
		<div class="disc-toast disc-toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- ═══ Game Initialization Discussion ════════════════════════════════ -->
	<section class="forum-block">
		<div class="forum-block__header">
			<h2>📋 Game Initialization Discussion</h2>
			<div class="forum-block__actions">
				{#if $user && !isMember}
					<button class="btn btn--small btn--accent" onclick={joinCommittee} disabled={joining}>
						{joining ? '...' : 'Join Committee'}
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
					<span class="member-chip">
						{#if m.avatar_url}
							<img class="member-chip__avatar" src={m.avatar_url} alt="" />
						{:else}
							<span class="member-chip__initial">{(m.display_name || '?')[0]}</span>
						{/if}
						<span class="member-chip__name">{m.display_name}</span>
						{#if m.role === 'editor'}<span class="member-chip__badge">✏️</span>{/if}
					</span>
				{/each}
			</div>
		{/if}

		<Accordion.Root type="multiple">
			{#each sectionSummary as s}
				<Accordion.Item value={s.id} class={statusClass(s.consensus.status)}>
					<Accordion.Trigger>
						<span class="thread-row">
							<span class="thread-row__icon">{s.icon}</span>
							<span class="thread-row__label">{s.label}</span>
							<span class="thread-row__status">{statusIcon(s.consensus.status)}</span>
							<span class="thread-row__meta">{s.draftCount} draft{s.draftCount !== 1 ? 's' : ''}</span>
							<span class="thread-row__meta">{s.lastActivity ? timeAgo(s.lastActivity) : '—'}</span>
						</span>
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="thread-preview">
							{#if s.draftCount > 0}
								<span class="thread-preview__drafts">
									{s.draftCount} draft{s.draftCount !== 1 ? 's' : ''} submitted ·
									{#if s.consensus.status === 'consensus' || s.consensus.status === 'single-draft'}
										✅ Consensus reached
									{:else if s.consensus.status === 'conflict'}
										⚡ {s.consensus.conflictCount} conflict{s.consensus.conflictCount !== 1 ? 's' : ''}
									{:else}
										No activity yet
									{/if}
								</span>
							{:else}
								<span class="thread-preview__drafts">No drafts yet — be the first to propose your version.</span>
							{/if}
							<a class="thread-preview__link" href={localizeHref(`/games/${game.game_id}/forum/init/${s.id}`)}>
								Open thread →
							</a>
						</div>
					</Accordion.Content>
				</Accordion.Item>
			{/each}
		</Accordion.Root>
	</section>

	<!-- ═══ Game Suggestions ══════════════════════════════════════════════ -->
	<section class="forum-block">
		<div class="forum-block__header">
			<h2>💡 Game Suggestions</h2>
			{#if hasApprovedProfile && !showSuggestForm}
				<button class="btn btn--small btn--accent" onclick={() => { showSuggestForm = true; }}>+ New Suggestion</button>
			{:else if !$user}
				<span class="muted small">Sign in to suggest</span>
			{:else if !hasApprovedProfile}
				<span class="muted small">Approved profile required</span>
			{/if}
		</div>

		<!-- Suggestion form -->
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
			<Accordion.Root type="multiple">
				{#each suggestions as s}
					<Accordion.Item value={s.id}>
						<Accordion.Trigger>
							<span class="suggestion-trigger">
								<span class="suggestion-trigger__main">
									<span class="suggestion-trigger__title">{s.title}</span>
									<span class="suggestion-trigger__meta">
										<span>by {s.display_name}</span>
										<span>·</span>
										<span>{s.comment_count} comment{s.comment_count !== 1 ? 's' : ''}</span>
										<span>·</span>
										<span>👍 {s.vote_counts.agree} 👎 {s.vote_counts.disagree}</span>
										<span>·</span>
										<span>{timeAgo(s.updated_at || s.created_at)}</span>
									</span>
								</span>
								<span class="suggestion-trigger__tags">
									{#each s.sections as sec}
										{@const meta = SECTIONS.find(x => x.id === sec)}
										{#if meta}
											<span class="section-tag">{meta.icon} {meta.label}</span>
										{/if}
									{/each}
								</span>
							</span>
						</Accordion.Trigger>
						<Accordion.Content>
							<div class="suggestion-preview">
								<p class="suggestion-preview__body">{s.body || 'No description.'}</p>
								<a class="thread-preview__link" href={localizeHref(`/games/${game.game_id}/forum/suggestions/${s.id}`)}>
									View full thread →
								</a>
							</div>
						</Accordion.Content>
					</Accordion.Item>
				{/each}
			</Accordion.Root>
		{/if}
	</section>

	<!-- ═══ General Discussion ════════════════════════════════════════════ -->
	<section class="forum-block">
		<div class="forum-empty">
			<span class="forum-empty__icon">💬</span>
			<h3>General Discussion</h3>
			<p class="muted">Community discussion threads are coming soon.</p>
		</div>
	</section>
</div>

<style>
	.forum-overview { max-width: 960px; margin: 0 auto; }
	.empty-hint { font-size: 0.88rem; padding: 1rem 0; }

	/* Suggest form */
	.suggest-form { padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.75rem; }
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
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }
	.btn--outline { background: transparent; border: 1px solid var(--border); }
</style>
