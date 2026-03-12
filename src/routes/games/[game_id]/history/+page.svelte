<script lang="ts">
	import { formatDate } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const game = $derived(data.game);
	const history = $derived(data.history || []);
	const achievements = $derived(game.community_achievements || []);
</script>

<svelte:head>
	<title>{m.game_history_title({ name: game.game_name })}</title>
</svelte:head>

<div class="history-page">
	<!-- Changes Log -->
	<section class="history-section">
		<h2>{m.game_history_changes()}</h2>
		<p class="muted">{m.game_history_changes_desc()}</p>

		{#if history.length === 0}
			<div class="empty-state">
				<p class="muted">{m.game_history_no_changes()}</p>
			</div>
		{:else}
			<div class="timeline">
				{#each history as entry}
					<div class="timeline__item">
						<div class="timeline__dot"></div>
						<div class="timeline__content">
							<div class="timeline__action">
								<span class="timeline__verb">{entry.action}</span>
								{#if entry.target}
									<span class="timeline__target">— {entry.target}</span>
								{/if}
							</div>
							{#if entry.note}
								<p class="timeline__note">{entry.note}</p>
							{/if}
							<div class="timeline__meta muted">
								<time>{formatDate(entry.date)}</time>
								{#if entry.by?.discord}
									<span>· {entry.by.discord}</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Community Achievements -->
	<section class="history-section">
		<h2>{m.game_history_achievements()}</h2>
		<p class="muted">{m.game_history_achievements_desc()}</p>

		{#if achievements.length === 0}
			<div class="empty-state">
				<p class="muted">{m.game_history_no_achievements()}</p>
			</div>
		{:else}
			<div class="ach-grid">
				{#each achievements as ach}
					<div class="ach-card">
						<div class="ach-card__icon">{ach.icon || '🏆'}</div>
						<div class="ach-card__info">
							<div class="ach-card__title">{ach.title}</div>
							{#if ach.description}
								<div class="ach-card__desc muted">{ach.description}</div>
							{/if}
							{#if ach.difficulty}
								<span class="ach-card__diff ach-card__diff--{ach.difficulty}">{ach.difficulty}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Community Milestones (placeholder) -->
	<section class="history-section">
		<h2>{m.game_history_milestones()}</h2>
		<p class="muted">{m.game_history_milestones_desc()}</p>

		<div class="empty-state">
			<p class="muted">{m.game_history_milestones_soon()}</p>
		</div>
	</section>
</div>

<style>
	.history-page { max-width: 800px; }

	.history-section { margin-bottom: 2.5rem; }
	.history-section h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
	.history-section > .muted { margin: 0 0 1rem; font-size: 0.9rem; }

	.empty-state {
		padding: 1.5rem; text-align: center;
		border: 1px dashed var(--border); border-radius: 8px;
	}

	/* Timeline */
	.timeline { position: relative; padding-left: 1.5rem; }
	.timeline::before {
		content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px;
		width: 2px; background: var(--border);
	}
	.timeline__item { position: relative; padding-bottom: 1.25rem; }
	.timeline__item:last-child { padding-bottom: 0; }
	.timeline__dot {
		position: absolute; left: -1.5rem; top: 6px;
		width: 10px; height: 10px; border-radius: 50%;
		background: var(--accent); border: 2px solid var(--bg);
	}
	.timeline__content { padding-left: 0.25rem; }
	.timeline__verb { font-weight: 600; font-size: 0.9rem; }
	.timeline__target { font-size: 0.9rem; color: var(--muted); }
	.timeline__note { font-size: 0.85rem; color: var(--muted); margin: 0.25rem 0 0; }
	.timeline__meta { font-size: 0.8rem; margin-top: 0.25rem; }

	/* Achievement grid */
	.ach-grid { display: flex; flex-direction: column; gap: 0.5rem; }
	.ach-card {
		display: flex; align-items: flex-start; gap: 0.75rem;
		padding: 0.75rem 1rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 8px;
	}
	.ach-card__icon { font-size: 1.5rem; flex-shrink: 0; }
	.ach-card__info { min-width: 0; }
	.ach-card__title { font-weight: 600; font-size: 0.95rem; }
	.ach-card__desc { font-size: 0.85rem; margin-top: 0.15rem; }
	.ach-card__diff {
		display: inline-block; margin-top: 0.3rem; padding: 0.1rem 0.4rem;
		border-radius: 4px; font-size: 0.7rem; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.03em;
	}
	.ach-card__diff--easy { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
	.ach-card__diff--medium { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
	.ach-card__diff--hard { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
	.ach-card__diff--legendary { background: rgba(168, 85, 247, 0.12); color: #a855f7; }

	.muted { opacity: 0.6; }

	@media (max-width: 600px) {
		.history-page { padding: 0; }
	}
</style>
