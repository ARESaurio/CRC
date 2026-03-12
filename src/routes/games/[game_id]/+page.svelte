<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { formatDate } from '$lib/utils';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

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

<!-- 1. Modded/Base Game Links -->
{#if game.is_modded && data.baseGame}
	<div class="game-link-banner game-link-banner--base">
		<span class="game-link-banner__icon">🎮</span>
		<span class="game-link-banner__text">{@html m.game_modded_banner({ bold_start: '<strong>', bold_end: '</strong>' })}</span>
		<a href={localizeHref(`/games/${data.baseGame.game_id}`)} class="btn btn--small">{m.game_view_game({ name: data.baseGame.game_name })}</a>
	</div>
{/if}

{#if data.moddedVersions.length > 0}
	<div class="game-link-banner game-link-banner--modded">
		<span class="game-link-banner__icon">🔧</span>
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

<!-- 3. General Rules (Accordion) -->
<div class="card card--compact">
	<details class="rules-accordion" open>
		<summary class="rules-accordion__header">
			<h2 class="rules-accordion__title">{m.game_general_rules()}</h2>
			<span class="accordion-icon">▼</span>
		</summary>
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
	</details>
</div>

<!-- 4. Community Achievements -->
{#if game.community_achievements?.length}
	{@const completionMap = achievementCompletions()}
	<div class="card card--compact mt-section">
		<h2 class="mb-2">{m.game_community_achievements()}</h2>
		<p class="muted mb-3">{m.game_community_achievements_desc()}</p>

		<div class="achievements-list">
			{#each game.community_achievements as ach}
				{@const comp = completionMap[ach.slug] || { completed: [], inProgress: [] }}
				{@const completedCount = comp.completed.length}
				{@const inProgressCount = comp.inProgress.length}

				<details class="achievement-item">
					<summary class="achievement-header">
						<div class="achievement-header__left">
							<span class="achievement-icon">{ach.icon || '🏆'}</span>
							<div class="achievement-info">
								<h3>{ach.title}</h3>
								<p class="muted">{ach.description}</p>
							</div>
						</div>
						<div class="achievement-header__right">
							{#if ach.difficulty}
								<span class="difficulty difficulty--{ach.difficulty}">{ach.difficulty}</span>
							{/if}
							<span class="achievement-stat">
								<span class="achievement-stat__completed">{completedCount} {m.game_completed()}</span>
								{#if inProgressCount > 0}
									<span class="achievement-stat__progress">{inProgressCount} {m.game_in_progress()}</span>
								{/if}
							</span>
							<span class="accordion-icon">▼</span>
						</div>
					</summary>

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
												<div class="runner-row__avatar runner-row__avatar--default">👤</div>
											{/if}
											<span>{runner?.runner_name || c.runner_id}</span>
										</a>
										<div class="runner-row__progress">
											<div class="progress-bar progress-bar--full"><div class="progress-bar__fill" style="width: 100%"></div></div>
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
									{@const percent = Math.round((current / total) * 100)}
									<div class="runner-row runner-row--progress">
										<a href="/runners/{c.runner_id}" class="runner-row__info">
											{#if runner?.avatar}
												<div class="runner-row__avatar" style="background-image: url('{runner.avatar}')"></div>
											{:else}
												<div class="runner-row__avatar runner-row__avatar--default">👤</div>
											{/if}
											<span>{runner?.runner_name || c.runner_id}</span>
										</a>
										<div class="runner-row__progress">
											<div class="progress-bar"><div class="progress-bar__fill" style="width: {percent}%"></div></div>
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
				</details>
			{/each}
		</div>
	</div>
{/if}

<!-- 5. Credits -->
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

	/* Rules Accordion */
	.rules-accordion { border: none; }
	.rules-accordion__header {
		display: flex; justify-content: space-between; align-items: center;
		cursor: pointer; list-style: none; padding: 0.25rem 0;
	}
	.rules-accordion__header::-webkit-details-marker { display: none; }
	.rules-accordion__title { margin: 0; font-size: 1.15rem; }
	.accordion-icon { transition: transform 0.2s; font-size: 0.75rem; color: var(--text-muted); }
	details[open] > .rules-accordion__header .accordion-icon,
	details[open] > .achievement-header .accordion-icon { transform: rotate(180deg); }
	.rules-accordion__content { padding-top: 0.75rem; }
	.rules-accordion__content ul { padding-left: 1.5rem; margin: 0; }
	.rules-accordion__content li { margin-bottom: 0.5rem; line-height: 1.5; }
	.rules-accordion__content a { color: var(--accent); text-decoration: none; }
	.rules-accordion__content a:hover { text-decoration: underline; }

	/* Achievements */
	.achievements-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.achievement-item { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	.achievement-header {
		display: flex; justify-content: space-between; align-items: center;
		padding: 0.75rem 1rem; cursor: pointer; list-style: none; gap: 1rem;
	}
	.achievement-header::-webkit-details-marker { display: none; }
	.achievement-header__left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
	.achievement-header__right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
	.achievement-icon { font-size: 1.5rem; }
	.achievement-info h3 { margin: 0; font-size: 0.95rem; }
	.achievement-info p { margin: 0.15rem 0 0; font-size: 0.8rem; }
	.achievement-stat { display: flex; flex-direction: column; align-items: flex-end; font-size: 0.8rem; }
	.achievement-stat__completed { color: var(--accent); font-weight: 600; }
	.achievement-stat__progress { color: var(--text-muted); }
	.achievement-content { padding: 0 1rem 1rem; border-top: 1px solid var(--border); }
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
	.progress-bar {
		flex: 1; height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden;
		border: 1px solid var(--border);
	}
	.progress-bar__fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
	.progress-bar--full .progress-bar__fill { background: #10b981; }
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

	/* Responsive */
	@media (max-width: 640px) {
		.achievement-header { flex-direction: column; align-items: flex-start; }
		.achievement-header__right { width: 100%; justify-content: flex-start; }
		.runner-row { font-size: 0.85rem; }
		.quick-stats { justify-content: flex-start; }
		.btn--accent { margin-left: 0; }
	}
</style>
