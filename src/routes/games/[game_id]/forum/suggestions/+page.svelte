<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { timeAgo } from '$lib/utils';
	import { Lightbulb, Search, ChevronLeft, ThumbsUp, ThumbsDown } from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { SECTIONS } from '../consensus';
	import ForumThreadTable from '$lib/components/forum/ForumThreadTable.svelte';
	import ForumThreadRow from '$lib/components/forum/ForumThreadRow.svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import { stripTooltipSyntax } from '$lib/utils/markdown';

	let { data } = $props();
	const game = $derived(data.game);
	let suggestions = $state(data.suggestions);
	$effect(() => { suggestions = data.suggestions; });

	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3500);
	}

	// ── Search ───────────────────────────────────────────────────────────
	let searchInput = $state('');
	const filtered = $derived(
		searchInput.trim()
			? suggestions.filter((s: any) => s.title.toLowerCase().includes(searchInput.trim().toLowerCase()))
			: suggestions
	);

	// ── Form ─────────────────────────────────────────────────────────────
	let showForm = $state(false);
	let sugTitle = $state('');
	let sugBody = $state('');
	let sugSections = $state<string[]>([]);
	let submitting = $state(false);

	function toggleSection(sectionId: string) {
		if (sugSections.includes(sectionId)) {
			sugSections = sugSections.filter(s => s !== sectionId);
		} else {
			sugSections = [...sugSections, sectionId];
		}
	}

	async function submitSuggestion() {
		if (!$user || !sugTitle.trim() || !sugBody.trim() || sugSections.length === 0) return;
		submitting = true;
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
			sugTitle = ''; sugBody = ''; sugSections = []; showForm = false;
			showToast('success', 'Suggestion posted!');
		}
		submitting = false;
	}
</script>

<svelte:head>
	<title>Suggestions — {game.game_name} Forum | CRC</title>
</svelte:head>

<div class="forum-page">
	<nav class="forum-breadcrumb">
		<a href={localizeHref(`/games/${game.game_id}/forum`)}><ChevronLeft size={14} /> {game.game_name} Forum</a>
	</nav>

	<div class="forum-page__header">
		<h1><Lightbulb size={22} /> Suggestions</h1>
		<p class="muted">Propose changes to this game's categories, rules, and structure.</p>
	</div>

	<div class="filter-bar">
		<div class="filter-bar__search">
			<Search size={14} />
			<input type="text" bind:value={searchInput} placeholder="Search suggestions..." />
		</div>
		<div class="filter-bar__actions">
			{#if data.hasApprovedProfile}
				<Button.Root variant="accent" size="sm" onclick={() => { showForm = !showForm; }}>
					{showForm ? 'Cancel' : '+ Suggestion'}
				</Button.Root>
			{:else if !$user}
				<span class="muted small">Sign in to post</span>
			{:else}
				<span class="muted small">Approved profile required</span>
			{/if}
		</div>
	</div>

	{#if showForm}
		<div class="new-thread-form">
			<input class="new-thread-form__title" type="text" bind:value={sugTitle} placeholder="Suggestion title" maxlength="200" />
			<textarea class="new-thread-form__body" bind:value={sugBody} rows="4" placeholder="Describe your suggestion... (Markdown supported)" maxlength="3000"></textarea>
			<div class="new-thread-form__sections">
				<span class="new-thread-form__label">Sections this applies to:</span>
				<div class="new-thread-form__chips">
					{#each SECTIONS as sec}
						<button class="section-chip" class:section-chip--active={sugSections.includes(sec.id)} onclick={() => toggleSection(sec.id)}>
							<Icon name={sec.icon} size={14} /> {sec.label}
						</button>
					{/each}
				</div>
			</div>
			<div class="new-thread-form__actions">
				<button class="btn btn--accent" onclick={submitSuggestion} disabled={submitting || !sugTitle.trim() || !sugBody.trim() || sugSections.length === 0}>
					{submitting ? 'Posting...' : 'Post Suggestion'}
				</button>
				<button class="btn btn--reset" onclick={() => { showForm = false; }}>Cancel</button>
			</div>
		</div>
	{/if}

	<ForumThreadTable empty={filtered.length === 0} emptyMessage={searchInput ? 'No suggestions matching your search.' : 'No suggestions yet. Be the first to share your ideas!'}
		headers={[
			{ label: 'Suggestion', type: 'topic' },
			{ label: 'Comments', type: 'stat' },
			{ label: 'Votes', type: 'stat' },
			{ label: 'Activity', type: 'last' }
		]}
	>
		{#each filtered as s}
			{@const sectionTags = (s.sections || []).map((sec: string) => {
				const meta = SECTIONS.find(x => x.id === sec);
				return meta ? { label: meta.label, variant: 'section' } : null;
			}).filter(Boolean)}
			<ForumThreadRow
				href={localizeHref(`/games/${game.game_id}/forum/suggestions/${s.id}`)}
				title={s.title}
				tags={sectionTags}
				authorLine="by <strong>{s.display_name}</strong> · {timeAgo(s.updated_at || s.created_at)}"
				stat1={s.comment_count}
				stat2="{s.vote_counts.agree}↑ {s.vote_counts.disagree}↓"
				lastPostTime={timeAgo(s.updated_at || s.created_at)}
			>
				{#snippet icon()}<Lightbulb size={16} />{/snippet}
			</ForumThreadRow>
		{/each}
	</ForumThreadTable>
</div>

{#if toast}
	<div class="toast toast--{toast.type}">{toast.text}</div>
{/if}

<style>
	.forum-page { max-width: 960px; margin: 0 auto; }
	.forum-breadcrumb { display: flex; align-items: center; gap: 0.25rem; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.75rem; }
	.forum-breadcrumb a { color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 0.15rem; }
	.forum-breadcrumb a:hover { text-decoration: underline; }
	.forum-page__header { margin-bottom: 1rem; }
	.forum-page__header h1 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.25rem; font-size: 1.35rem; }
	.forum-page__header .muted { margin: 0; font-size: 0.9rem; }

	.filter-bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.filter-bar__search { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; flex: 1; min-width: 160px; max-width: 280px; color: var(--muted); }
	.filter-bar__search input { border: none; background: none; color: var(--fg); font-size: 0.85rem; font-family: inherit; outline: none; width: 100%; }
	.filter-bar__search:focus-within { border-color: var(--accent); }
	.filter-bar__actions { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }

	.new-thread-form { margin-bottom: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; }
	.new-thread-form__title { width: 100%; padding: 0.5rem 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem; box-sizing: border-box; }
	.new-thread-form__title:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__body { width: 100%; padding: 0.5rem 0.65rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.88rem; resize: vertical; box-sizing: border-box; }
	.new-thread-form__body:focus { outline: none; border-color: var(--accent); }
	.new-thread-form__actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
	.new-thread-form__sections { margin-top: 0.5rem; }
	.new-thread-form__label { font-size: 0.82rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.3rem; }
	.new-thread-form__chips { display: flex; gap: 0.25rem; flex-wrap: wrap; }
	.section-chip { padding: 0.25rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; font-size: 0.78rem; cursor: pointer; font-family: inherit; color: var(--fg); transition: all 0.1s; }
	.section-chip:hover { border-color: var(--accent); }
	.section-chip--active { background: rgba(59, 195, 110, 0.12); border-color: var(--accent); color: var(--accent); }

	.btn { display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; font-family: inherit; }
	.btn:hover { border-color: var(--accent); }
	.btn--accent { background: var(--accent); color: white; border-color: var(--accent); }
	.btn--reset { background: none; border-color: var(--border); color: var(--muted); }
	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }

	.toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 0.88rem; font-weight: 500; z-index: 999; animation: toast-in 0.2s; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
	@keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

	@media (max-width: 700px) { .filter-bar { flex-direction: column; align-items: stretch; } .filter-bar__search { max-width: none; } .filter-bar__actions { margin-left: 0; } }
</style>
