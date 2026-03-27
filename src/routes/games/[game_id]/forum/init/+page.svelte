<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import CommunityReview from '../CommunityReview.svelte';
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';

	let { data } = $props();
	const game = $derived(data.game);

	// ── Admin check ──────────────────────────────────────────────────────
	let isAdmin = $state(false);
	$effect(() => {
		const u = $user;
		if (u) {
			supabase.from('profiles').select('is_admin, is_super_admin').eq('user_id', u.id).maybeSingle()
				.then(({ data: p }) => { isAdmin = !!(p?.is_admin || p?.is_super_admin); });
		} else { isAdmin = false; }
	});

	const isBasicSubmission = $derived(data.originalSubmission?.game_data?.submission_type === 'basic');
</script>

<svelte:head><title>Game Initialization — {game.game_name} | CRC</title></svelte:head>

<div class="init-page">
	<div class="init-page__breadcrumb">
		<a href={localizeHref(`/games/${game.game_id}/forum`)}>← Back to Forum</a>
	</div>

	{#if isBasicSubmission}
		<div class="basic-submission-banner">
			<span class="basic-submission-banner__icon">📝</span>
			<div class="basic-submission-banner__text">
				<strong>This game was submitted via basic mode.</strong>
				Structured data like categories, challenges, and restrictions needs to be built out. Join the committee and submit drafts in the sections below.
				{#if data.originalSubmission?.submitter_notes}
					<p class="basic-submission-banner__notes">Submitter's notes: {data.originalSubmission.submitter_notes}</p>
				{/if}
				{#if data.originalSubmission?.simple_category_notes}
					<p class="basic-submission-banner__notes">Category notes: {data.originalSubmission.simple_category_notes}</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if data.roughDraft}
		<CommunityReview
			{game}
			roughDraft={data.roughDraft}
			proposals={data.proposals}
			proposalVotes={data.proposalVotes}
			volunteers={data.volunteers}
			draftHistory={data.draftHistory}
			userId={data.userId}
			{isAdmin}
		/>
	{:else}
		<section class="forum-block">
			<div class="forum-empty">
				<span class="forum-empty__icon">🏗️</span>
				<h3>Community Review</h3>
				<p class="muted">This game is in Community Review, but the rough draft could not be loaded. An admin should check the Supabase RLS policies on the <code>game_rough_draft</code> table.</p>
			</div>
		</section>
	{/if}
</div>

<style>
	.init-page { max-width: 960px; margin: 0 auto; }
	.init-page__breadcrumb { margin-bottom: 1rem; }
	.init-page__breadcrumb a { font-size: 0.88rem; color: var(--accent); text-decoration: none; }
	.init-page__breadcrumb a:hover { text-decoration: underline; }

	.basic-submission-banner { display: flex; align-items: flex-start; gap: 0.75rem; padding: 1rem 1.25rem; background: rgba(234, 179, 8, 0.06); border: 1px solid rgba(234, 179, 8, 0.25); border-radius: 10px; margin-bottom: 1rem; line-height: 1.55; font-size: 0.9rem; }
	.basic-submission-banner__icon { font-size: 1.3rem; flex-shrink: 0; padding-top: 0.1rem; }
	.basic-submission-banner__text { flex: 1; }
	.basic-submission-banner__notes { margin: 0.4rem 0 0; font-size: 0.85rem; color: var(--muted); font-style: italic; }

	.forum-empty { text-align: center; padding: 2rem 1rem; }
	.forum-empty__icon { font-size: 2rem; }
	.muted { color: var(--muted); }
</style>
