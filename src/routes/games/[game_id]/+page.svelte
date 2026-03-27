<script lang="ts">
	import { renderMarkdown, stripTooltipSyntax } from '$lib/utils/markdown';
	import { formatDate } from '$lib/utils';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { ClipboardList, Gamepad2, Wrench, BookOpen, MessageSquare, FileEdit, Pin, CheckCircle, User } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { user } from '$stores/auth';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import * as Separator from '$lib/components/ui/separator/index.js';
	import * as Meter from '$lib/components/ui/meter/index.js';

	let { data } = $props();
	const game = $derived(data.game);
	const achievements = $derived(data.achievements);
	const runnerMap = $derived(data.runnerMap);
	const runCountByCategory = $derived(data.runCountByCategory);
	const totalRunCount = $derived(data.totalRunCount);

	// General rules: game-specific or default fallback
	const generalRules = $derived(
		game.general_rules || data.defaultGeneralRules || null
	);
	const isDefaultRules = $derived(!game.general_rules && !!data.defaultGeneralRules);

	// ── Rules system ─────────────────────────────────────────────────────
	const isReview = $derived(game.status === 'Community Review');
	const defaultRules = $derived(data.defaultRules || null);
	const rulesChangelog = $derived(data.rulesChangelog || []);
	const ruleSuggestions = $derived(data.ruleSuggestions || []);

	// Suggestion form state
	let suggestionText = $state('');
	let suggestionSubmitting = $state(false);
	let suggestionMsg = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let hasPendingSuggestion = $derived(
		ruleSuggestions.some((s: any) => s.user_id === $user?.id && s.status === 'pending')
	);

	async function submitSuggestion() {
		if (!$user || !suggestionText.trim() || suggestionSubmitting) return;
		suggestionSubmitting = true;
		suggestionMsg = null;

		const { error } = await supabase.from('rule_suggestions').insert({
			game_id: game.game_id,
			user_id: $user.id,
			suggestion: stripTooltipSyntax(suggestionText.trim()).slice(0, 1000)
		});

		if (error) {
			suggestionMsg = { type: 'error', text: error.message.includes('unique') ? 'You already have a pending suggestion for this game.' : error.message };
		} else {
			suggestionMsg = { type: 'success', text: 'Thanks! Your suggestion is under review.' };
			suggestionText = '';
		}
		suggestionSubmitting = false;
	}

	// Description: detect placeholder/empty
	const hasDescription = $derived(
		game.content &&
		game.content.trim() !== '' &&
		!game.content.includes('Game submitted via form') &&
		!game.content.includes('Awaiting review')
	);

	// Achievement completions grouped by slug
	const achievementCompletions = $derived(() => {
		const map: Record<string, { completed: typeof achievements; inProgress: typeof achievements }> = {};
		for (const def of game.community_achievements || []) {
			const completed = achievements.filter(
				(a) => a.achievement_slug === def.slug && a.date_completed
			);
			const inProgress = achievements.filter(
				(a) => a.achievement_slug === def.slug && !a.date_completed
			);
			map[def.slug] = { completed, inProgress };
		}
		return map;
	});
</script>

<!-- 0. Community Review Banner -->
{#if game.status === 'Community Review'}
	<div class="game-link-banner game-link-banner--review">
		<span class="game-link-banner__icon"><ClipboardList size={16} /></span>
		<span class="game-link-banner__text">
			<strong>Rules Under Community Review</strong> — This game's rules are being shaped by the community. Runs submitted now will be honored even if rules change.
		</span>
	</div>
{/if}

<!-- 1. Modded/Base Game Links -->
{#if game.is_modded && data.baseGame}
	<div class="game-link-banner game-link-banner--base">
		<span class="game-link-banner__icon"><Gamepad2 size={16} /></span>
		<span class="game-link-banner__text">{@html m.game_modded_banner({ bold_start: '<strong>', bold_end: '</strong>' })}</span>
		<a href={localizeHref(`/games/${data.baseGame.game_id}`)} class="btn btn--small">{m.game_view_game({ name: data.baseGame.game_name })}</a>
	</div>
{/if}

{#if data.moddedVersions.length > 0}
	<div class="game-link-banner game-link-banner--modded">
		<span class="game-link-banner__icon"><Wrench size={16} /></span>
		<span class="game-link-banner__text">{@html m.game_modded_available({ bold_start: '<strong>', bold_end: '</strong>' })}</span>
		<div class="game-link-banner__links">
			{#each data.moddedVersions as mod}
				<a href={localizeHref(`/games/${mod.game_id}`)} class="btn btn--small btn--outline">{mod.game_name}</a>
			{/each}
		</div>
	</div>
{/if}

<!-- 2. Game Description -->
<section>
	{#if hasDescription}
		<div class="card">
			{@html renderMarkdown(game.content ?? '')}
		</div>
	{:else}
		<div class="card">
			<p class="muted"><em>{@html m.game_desc_needed({ link_start: `<a href="${localizeHref(`/games/${game.game_id}/resources`)}">`, link_end: '</a>' })}</em></p>
		</div>
	{/if}
</section>

<!-- Quick Stats Bar -->
<section class="quick-stats">
	<div class="stat-pill">
		<span class="stat-pill__value">{totalRunCount}</span>
		<span class="stat-pill__label">{totalRunCount !== 1 ? m.game_stat_runs().split(' | ')[1] : m.game_stat_runs().split(' | ')[0]}</span>
	</div>
	<div class="stat-pill">
		<span class="stat-pill__value">{data.categories.length}</span>
		<span class="stat-pill__label">{data.categories.length !== 1 ? m.game_stat_categories().split(' | ')[1] : m.game_stat_categories().split(' | ')[0]}</span>
	</div>
	{#if game.community_achievements?.length}
		<div class="stat-pill">
			<span class="stat-pill__value">{game.community_achievements.length}</span>
			<span class="stat-pill__label">{game.community_achievements.length !== 1 ? m.game_stat_achievements().split(' | ')[1] : m.game_stat_achievements().split(' | ')[0]}</span>
		</div>
	{/if}
	<a href={localizeHref(`/games/${game.game_id}/submit`)} class="btn btn--accent">{m.game_submit_run()}</a>
</section>

<!-- 3. General Rules -->
<div class="card card--compact">
	{#if isReview && defaultRules}
		<!-- Community Review: show default rules + proposed rules separately -->
		<Collapsible.Root open={true} class="rules-accordion">
			<Collapsible.Trigger class="rules-accordion__header">
				<h2 class="rules-accordion__title"><BookOpen size={18} style="display:inline-block;vertical-align:-0.125em;" /> Active Rules (CRC Defaults)</h2>
				<span class="accordion-icon">▼</span>
			</Collapsible.Trigger>
			<Collapsible.Content>
				<div class="rules-accordion__content">
					<div class="md">
						{@html renderMarkdown(defaultRules)}
					</div>
				</div>
			</Collapsible.Content>
		</Collapsible.Root>

		{#if game.general_rules}
			<Separator.Root class="rules-divider" />
			<Collapsible.Root open={true} class="rules-accordion">
				<Collapsible.Trigger class="rules-accordion__header">
					<h2 class="rules-accordion__title"><ClipboardList size={18} style="display:inline-block;vertical-align:-0.125em;" /> Proposed Game-Specific Rules</h2>
					<span class="accordion-icon">▼</span>
				</Collapsible.Trigger>
				<Collapsible.Content>
					<div class="rules-accordion__content">
						<p class="rules-review-note muted mb-2">These rules have been proposed by the community and are under review. They will become official when this game moves to Active status.</p>
						<div class="md">
							{@html renderMarkdown(game.general_rules)}
						</div>
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}

		<!-- Suggestion form -->
		<Separator.Root class="rules-divider" />
		<div class="rules-suggestions">
			<h3 class="rules-suggestions__title"><MessageSquare size={18} style="display:inline-block;vertical-align:-0.125em;" /> Suggest a Rule Change</h3>
			{#if $user && !hasPendingSuggestion}
				<textarea
					class="rules-suggestions__input"
					bind:value={suggestionText}
					placeholder="What rule would you change, and why?"
					maxlength="1000"
					rows="3"
					disabled={suggestionSubmitting}
				></textarea>
				<div class="rules-suggestions__actions">
					<button
						class="btn btn--accent btn--small"
						onclick={submitSuggestion}
						disabled={!suggestionText.trim() || suggestionSubmitting}
					>{suggestionSubmitting ? 'Submitting...' : 'Submit Suggestion'}</button>
					<span class="muted" style="font-size: 0.8rem;">{suggestionText.length}/1000</span>
				</div>
			{:else if $user && hasPendingSuggestion}
				<p class="muted">⏳ You have a pending suggestion for this game.</p>
			{:else}
				<p class="muted"><a href={localizeHref('/sign-in')}>Sign in</a> to suggest rule changes.</p>
			{/if}
			{#if suggestionMsg}
				<div class="rules-suggestions__msg rules-suggestions__msg--{suggestionMsg.type}">{suggestionMsg.text}</div>
			{/if}
		</div>

		<!-- Show accepted/noted suggestions -->
		{#if ruleSuggestions.filter((s) => s.status !== 'pending').length > 0}
			<Separator.Root class="rules-divider" />
			<div class="rules-suggestions-list">
				<h3 class="rules-suggestions__title">Community Feedback</h3>
				{#each ruleSuggestions.filter((s) => s.status !== 'pending') as s}
					<div class="suggestion-card suggestion-card--{s.status}">
						<div class="suggestion-card__body">{s.suggestion}</div>
						{#if s.admin_response}
							<div class="suggestion-card__response"><strong>Response:</strong> {s.admin_response}</div>
						{/if}
						<div class="suggestion-card__meta muted">
							{#if s.status === 'accepted'}<CheckCircle size={12} style="display:inline-block;vertical-align:-0.125em;" /> Accepted{:else if s.status === 'noted'}<Pin size={12} style="display:inline-block;vertical-align:-0.125em;" /> Noted{/if}
							 · {formatDate(s.created_at)}
						</div>
					</div>
				{/each}
			</div>
		{/if}

	{:else}
		<!-- Active / standard display -->
		<Collapsible.Root open={true} class="rules-accordion">
			<Collapsible.Trigger class="rules-accordion__header">
				<h2 class="rules-accordion__title">{m.game_general_rules()}</h2>
				<span class="accordion-icon">▼</span>
			</Collapsible.Trigger>
			<Collapsible.Content>
				<div class="rules-accordion__content">
					{#if generalRules}
						<p class="muted mb-2">{isDefaultRules ? m.game_rules_default() : m.game_rules_specific({ name: game.game_name })}</p>
						<div class="md">
							{@html renderMarkdown(generalRules)}
						</div>
					{:else}
						<ul>
							<li><strong>{m.game_timing_method()}</strong> {game.timing_method || 'RTA (Real Time Attack)'}</li>
							<li><strong>{m.game_video_required()}</strong> {m.game_video_required_desc()}</li>
							<li><strong>{m.game_no_cheats()}</strong> {m.game_no_cheats_desc()}</li>
						</ul>
					{/if}
					<p class="muted mt-2" style="font-size: 0.85rem;">
						<em>{@html m.game_rules_detail_link({ link_start: `<a href="${localizeHref(`/games/${game.game_id}/rules`)}">`, link_end: '</a>' })}</em>
					</p>
				</div>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}

	<!-- Rules Changelog (shown for both Community Review and Active) -->
	{#if rulesChangelog.length > 0}
		<Separator.Root class="rules-divider" />
		<Collapsible.Root open={false} class="rules-accordion">
			<Collapsible.Trigger class="rules-accordion__header">
				<h2 class="rules-accordion__title"><FileEdit size={18} style="display:inline-block;vertical-align:-0.125em;" /> Rules History {#if game.rules_version}<span class="muted" style="font-size: 0.85rem; font-weight: 400;">(v{game.rules_version})</span>{/if}</h2>
				<span class="accordion-icon">▼</span>
			</Collapsible.Trigger>
			<Collapsible.Content>
				<div class="rules-accordion__content">
					<div class="changelog-list">
						{#each rulesChangelog as entry}
							<div class="changelog-entry">
								<div class="changelog-entry__version">v{entry.rules_version}</div>
								<div class="changelog-entry__body">
									<span class="changelog-entry__date muted">{formatDate(entry.created_at)}</span>
									{#if entry.change_summary}
										<span class="changelog-entry__summary">{entry.change_summary}</span>
									{/if}
									<span class="changelog-entry__sections muted">Updated: {entry.sections_changed.join(', ')}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
</div>

<!-- 4. Community Achievements -->
{#if game.community_achievements?.length}
	{@const completionMap = achievementCompletions()}
	<div class="card card--compact mt-section">
		<h2 class="mb-2">{m.game_community_achievements()}</h2>
		<p class="muted mb-3">{m.game_community_achievements_desc()}</p>

		<Accordion.Root type="multiple" class="achievements-list">
			{#each game.community_achievements as ach}
				{@const comp = completionMap[ach.slug] || { completed: [], inProgress: [] }}
				{@const completedCount = comp.completed.length}
				{@const inProgressCount = comp.inProgress.length}

				<Accordion.Item value={ach.slug} class="achievement-item">
					<Accordion.Trigger class="achievement-trigger">
						<span class="achievement-header__left">
							<span class="achievement-icon">{ach.icon || '🏆'}</span>
							<span class="achievement-info">
								<strong>{ach.title}</strong>
								<span class="muted achievement-info__desc">{ach.description}</span>
							</span>
						</span>
						<span class="achievement-header__right">
							{#if ach.difficulty}
								<span class="difficulty difficulty--{ach.difficulty}">{ach.difficulty}</span>
							{/if}
							<span class="achievement-stat">
								<span class="achievement-stat__completed">{completedCount} {m.game_completed()}</span>
								{#if inProgressCount > 0}
									<span class="achievement-stat__progress">{inProgressCount} {m.game_in_progress()}</span>
								{/if}
							</span>
						</span>
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="achievement-content">
						{#if ach.requirements?.length}
							<div class="achievement-requirements">
								<h4>{m.game_requirements()}</h4>
								<ul>
									{#each ach.requirements as req}
										<li>{req}</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if completedCount > 0 || inProgressCount > 0}
							<div class="achievement-runners">
								<h4>{m.game_runner_progress()}</h4>
								{#each comp.completed.sort((a, b) => String(a.date_completed).localeCompare(String(b.date_completed))) as c}
									{@const runner = runnerMap[c.runner_id]}
									<div class="runner-row runner-row--completed">
										<a href="/runners/{c.runner_id}" class="runner-row__info">
											{#if runner?.avatar}
												<div class="runner-row__avatar" style="background-image: url('{runner.avatar}')"></div>
											{:else}
												<div class="runner-row__avatar runner-row__avatar--default"><User size={18} /></div>
											{/if}
											<span>{runner?.runner_name || c.runner_id}</span>
										</a>
										<div class="runner-row__progress">
											<Meter.Root value={ach.total_required || 1} max={ach.total_required || 1} class="progress-bar progress-bar--full" />
											<span class="progress-bar__text">{ach.total_required || '?'} / {ach.total_required || '?'}</span>
										</div>
										<div class="runner-row__status">
											<span class="status-badge status-badge--completed">{m.game_status_completed()}</span>
											<span class="runner-row__date">{formatDate(c.date_completed)}</span>
										</div>
										{#if c.proof_url}
											<a href={c.proof_url} target="_blank" rel="noopener" class="btn btn--small">{m.game_proof()}</a>
										{/if}
									</div>
								{/each}

								{#each comp.inProgress as c}
									{@const runner = runnerMap[c.runner_id]}
									{@const current = (c as any).current_progress || 0}
									{@const total = ach.total_required || 1}
									<div class="runner-row runner-row--progress">
										<a href="/runners/{c.runner_id}" class="runner-row__info">
											{#if runner?.avatar}
												<div class="runner-row__avatar" style="background-image: url('{runner.avatar}')"></div>
											{:else}
												<div class="runner-row__avatar runner-row__avatar--default"><User size={18} /></div>
											{/if}
											<span>{runner?.runner_name || c.runner_id}</span>
										</a>
										<div class="runner-row__progress">
											<Meter.Root value={current} max={total} class="progress-bar" />
											<span class="progress-bar__text">{current} / {total}</span>
										</div>
										<div class="runner-row__status">
											<span class="status-badge status-badge--progress">{m.game_status_in_progress()}</span>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="muted" style="padding: 0.5rem 0;">{m.game_no_runners_yet()}</p>
						{/if}
					</div>
					</Accordion.Content>
				</Accordion.Item>
			{/each}
		</Accordion.Root>
	</div>
{/if}

<!-- 5. Contributions -->
{#if game.contributions?.length}
	<div class="card card--compact mt-section">
		<h2 class="mb-2"><FileEdit size={18} style="display:inline-block;vertical-align:-0.125em;" /> Community Contributions</h2>
		<p class="muted mb-2">Guides, tools, and resources created by the community for {game.game_name}.</p>
		<div class="contributions-list">
			{#each game.contributions as c}
				<div class="contribution-item">
					<div class="contribution-icon">{c.icon || '📄'}</div>
					<div class="contribution-info">
						<h4>
							{#if c.url}
								<a href={c.url} target="_blank" rel="noopener">{c.title}</a>
							{:else}
								{c.title}
							{/if}
						</h4>
						{#if c.description}<p class="muted">{c.description}</p>{/if}
						{#if c.contributor}
							<span class="contribution-by muted">
								{#if c.contributor_runner_id}
									by <a href={localizeHref(`/runners/${c.contributor_runner_id}`)}>{c.contributor}</a>
								{:else}
									by {c.contributor}
								{/if}
							</span>
						{/if}
					</div>
					{#if c.type}
						<span class="contribution-type">{c.type}</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}

<!-- 6. Credits -->
{#if (game as any).credits?.length}
	<div class="card card--compact mt-section">
		<h2 class="mb-2">{m.game_credits()}</h2>
		<p class="muted mb-2">{m.game_credits_desc()}</p>
		<ul class="credits-list">
			{#each (game as any).credits as credit}
				<li>
					{#if credit.runner_id}
						<a href={localizeHref(`/runners/${credit.runner_id}`)}>{credit.name}</a>
					{:else if credit.url}
						<a href={credit.url} target="_blank" rel="noopener">{credit.name}</a>
					{:else}
						{credit.name}
					{/if}
					{#if credit.role}
						<span class="muted"> — {credit.role}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{:else}
	<div class="card card--compact mt-section">
		<h2 class="mb-2">{m.game_credits()}</h2>
		<p class="muted">{m.game_no_credits()}</p>
	</div>
{/if}

<style>
	/* Layout */
	section { margin-bottom: 1.5rem; }
	h2 { margin-bottom: 0.75rem; }
	.mb-2 { margin-bottom: 0.75rem; }
	.mb-3 { margin-bottom: 1rem; }
	.mt-2 { margin-top: 0.75rem; }
	.mt-section { margin-top: 1.5rem; }

	/* Game Link Banners */
	.game-link-banner {
		display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
		border-radius: 8px; margin-bottom: 1.5rem; flex-wrap: wrap;
		background: var(--panel); border: 1px solid var(--border);
	}
	.game-link-banner__icon { font-size: 1.25rem; }
	.game-link-banner__links { display: flex; gap: 0.5rem; flex-wrap: wrap; }

	/* Quick Stats */
	.quick-stats {
		display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
		margin-bottom: 1.5rem; padding: 0.75rem 0;
	}
	.stat-pill {
		display: flex; align-items: baseline; gap: 0.35rem;
		padding: 0.4rem 0.75rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 20px; font-size: 0.85rem;
	}
	.stat-pill__value { font-weight: 700; color: var(--accent); }
	.stat-pill__label { color: var(--text-muted); }
	.btn--accent {
		margin-left: auto;
	}

	/* Rules Accordion (Collapsible) */
	:global(.rules-accordion) { border: none; }
	:global(.rules-accordion__header) { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.25rem 0; width: 100%; background: none; border: none; color: var(--fg); font: inherit; text-align: left; }
	.rules-accordion__title { margin: 0; font-size: 1.15rem; }
	.accordion-icon { transition: transform 0.2s; font-size: 0.75rem; color: var(--text-muted); }
	:global([data-state="open"] > .rules-accordion__header .accordion-icon),
	:global(.rules-accordion__header[data-state="open"] .accordion-icon) { transform: rotate(180deg); }
	:global(.rules-accordion__content) { padding-top: 0.75rem; }
	:global(.rules-accordion__content ul) { padding-left: 1.5rem; margin: 0; }
	:global(.rules-accordion__content li) { margin-bottom: 0.5rem; line-height: 1.5; }

	/* Achievements (Accordion) */
	:global(.achievements-list) { display: flex; flex-direction: column; gap: 0; }
	:global(.achievement-item) { border: 1px solid var(--border); overflow: hidden; }
	:global(.achievement-item:first-child) { border-radius: 8px 8px 0 0; }
	:global(.achievement-item:last-child) { border-radius: 0 0 8px 8px; }
	:global(.achievement-item:only-child) { border-radius: 8px; }
	:global(.achievement-item + .achievement-item) { border-top: none; }
	:global(.achievement-trigger) { width: 100%; }
	.achievement-header__left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
	.achievement-header__right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
	.achievement-icon { font-size: 1.5rem; }
	.achievement-info { display: flex; flex-direction: column; text-align: left; }
	.achievement-info strong { font-size: 0.95rem; }
	.achievement-info__desc { font-size: 0.8rem; margin-top: 0.15rem; }
	.achievement-stat { display: flex; flex-direction: column; align-items: flex-end; font-size: 0.8rem; }
	.achievement-stat__completed { color: var(--accent); font-weight: 600; }
	.achievement-stat__progress { color: var(--text-muted); }
	.achievement-content { padding: 0 1rem 1rem; }
	.achievement-requirements { margin-top: 0.75rem; }
	.achievement-requirements h4 { margin: 0 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
	.achievement-requirements ul { padding-left: 1.5rem; margin: 0; font-size: 0.9rem; }
	.achievement-requirements li { margin-bottom: 0.35rem; }
	.achievement-runners { margin-top: 1rem; }
	.achievement-runners h4 { margin: 0 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }

	/* Runner rows in achievements */
	.runner-row {
		display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0;
		border-bottom: 1px solid var(--border); flex-wrap: wrap;
	}
	.runner-row:last-child { border-bottom: none; }
	.runner-row__info { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; color: var(--fg); min-width: 120px; }
	.runner-row__info:hover { color: var(--accent); }
	.runner-row__avatar {
		width: 28px; height: 28px; border-radius: 50%; background-size: cover; background-position: center;
		flex-shrink: 0;
	}
	.runner-row__avatar--default {
		display: flex; align-items: center; justify-content: center;
		background: var(--surface); border: 1px solid var(--border); font-size: 0.75rem;
	}
	.runner-row__progress { flex: 1; min-width: 100px; display: flex; align-items: center; gap: 0.5rem; }
	:global(.progress-bar.ui-meter) {
		flex: 1; height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden;
		border: 1px solid var(--border);
	}
	:global(.progress-bar--full [data-meter-indicator]) { background: #10b981; }
	.progress-bar__text { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
	.runner-row__status { display: flex; flex-direction: column; align-items: flex-end; }
	.runner-row__date { font-size: 0.75rem; color: var(--text-muted); }
	.status-badge {
		padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;
	}
	.status-badge--completed { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.status-badge--progress { background: rgba(99, 102, 241, 0.15); color: #818cf8; }

	/* Difficulty badges */
	.difficulty {
		padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize;
	}
	.difficulty--easy { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.difficulty--medium { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.difficulty--hard { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.difficulty--legendary { background: rgba(168, 85, 247, 0.15); color: #a855f7; }

	/* Credits */
	.credits-list { padding-left: 1.5rem; margin: 0; }
	.credits-list li { margin-bottom: 0.5rem; line-height: 1.5; }
	.credits-list a { color: var(--accent); text-decoration: none; }
	.credits-list a:hover { text-decoration: underline; }

	/* Contributions */
	.contributions-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.contribution-item {
		display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem;
		background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
	}
	.contribution-icon { font-size: 1.25rem; flex-shrink: 0; padding-top: 0.1rem; }
	.contribution-info { flex: 1; min-width: 0; }
	.contribution-info h4 { margin: 0 0 0.15rem; font-size: 0.95rem; }
	.contribution-info h4 a { color: var(--accent); text-decoration: none; }
	.contribution-info h4 a:hover { text-decoration: underline; }
	.contribution-info p { margin: 0; font-size: 0.85rem; }
	.contribution-by { font-size: 0.8rem; }
	.contribution-by a { color: var(--accent); text-decoration: none; }
	.contribution-by a:hover { text-decoration: underline; }
	.contribution-type {
		flex-shrink: 0; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem;
		font-weight: 600; text-transform: capitalize; background: var(--surface); border: 1px solid var(--border);
	}

	/* Responsive */
	@media (max-width: 640px) {
		.achievement-header { flex-direction: column; align-items: flex-start; }
		.achievement-header__right { width: 100%; justify-content: flex-start; }
		.runner-row { font-size: 0.85rem; }
		.quick-stats { justify-content: flex-start; }
		.btn--accent { margin-left: 0; }
	}

	/* Rules system */
	:global(.rules-divider) { margin: 1rem 0; }
	.rules-review-note { font-style: italic; font-size: 0.9rem; }

	/* Suggestions */
	.rules-suggestions { padding: 0.5rem 0; }
	.rules-suggestions__title { font-size: 1rem; margin: 0 0 0.75rem; }
	.rules-suggestions__input { width: 100%; padding: 0.6rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9rem; resize: vertical; box-sizing: border-box; }
	.rules-suggestions__input:focus { outline: none; border-color: var(--accent); }
	.rules-suggestions__actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
	.rules-suggestions__msg { margin-top: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; }
	.rules-suggestions__msg--success { background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); color: #28a745; }
	.rules-suggestions__msg--error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); color: #dc3545; }

	/* Suggestion cards */
	.rules-suggestions-list { padding: 0.5rem 0; }
	.suggestion-card { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.5rem; }
	.suggestion-card--accepted { border-left: 3px solid #28a745; }
	.suggestion-card--noted { border-left: 3px solid #f59e0b; }
	.suggestion-card__body { font-size: 0.9rem; line-height: 1.5; margin-bottom: 0.35rem; }
	.suggestion-card__response { font-size: 0.85rem; color: var(--fg); margin-bottom: 0.35rem; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 4px; }
	.suggestion-card__meta { font-size: 0.78rem; }

	/* Changelog */
	.changelog-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.changelog-entry { display: flex; gap: 0.75rem; align-items: flex-start; }
	.changelog-entry__version { font-weight: 700; font-size: 0.85rem; color: var(--accent); min-width: 2.5rem; padding-top: 0.1rem; }
	.changelog-entry__body { display: flex; flex-direction: column; gap: 0.15rem; }
	.changelog-entry__date { font-size: 0.78rem; }
	.changelog-entry__summary { font-size: 0.9rem; }
	.changelog-entry__sections { font-size: 0.78rem; }
</style>
