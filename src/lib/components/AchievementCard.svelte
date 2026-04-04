<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Meter from '$lib/components/ui/meter/index.js';
	import Icon from '$lib/components/Icon.svelte';
	import { Trophy, ChevronRight, ChevronDown} from 'lucide-svelte';

	let {
		achievement,
		gameName = '',
		gameUrl = '',
		completions = [],
		showGame = false,
		showCompletions = true,
		progress = null
	}: {
		achievement: {
			title: string;
			description: string;
			icon?: string;
			difficulty?: 'easy' | 'medium' | 'hard' | 'legendary';
			requirements?: string[];
			total_required?: number;
		};
		gameName?: string;
		gameUrl?: string;
		completions?: Array<{
			runner_id: string;
			runner_name?: string;
			date_completed: string;
			status: string;
		}>;
		showGame?: boolean;
		showCompletions?: boolean;
		progress?: { current: number; total: number } | null;
	} = $props();

	let approvedCompletions = $derived(
		completions
			.filter(c => c.status === 'approved')
			.sort((a, b) => a.date_completed.localeCompare(b.date_completed))
	);

	let completionCount = $derived(approvedCompletions.length);
	let firstCompletion = $derived(approvedCompletions[0] ?? null);
	let isCompleted = $derived(completionCount > 0);

	let difficultyLabel = $derived(
		achievement.difficulty
			? achievement.difficulty.charAt(0).toUpperCase() + achievement.difficulty.slice(1)
			: ''
	);

	let progressPercent = $derived(
		progress && achievement.total_required
			? Math.min(100, Math.round((progress.current / achievement.total_required) * 100))
			: 0
	);

	let reqOpen = $state(false);
</script>

<div class="achievement-card" class:achievement-card--completed={isCompleted}>
	<div class="achievement-card__icon"><Icon name={achievement.icon || 'trophy'} size={28} /></div>

	<div class="achievement-card__content">
		<div class="achievement-card__header">
			<h4 class="achievement-card__title">{achievement.title}</h4>
			{#if difficultyLabel}
				<span class="achievement-card__difficulty difficulty--{achievement.difficulty}">{difficultyLabel}</span>
			{/if}
		</div>

		<p class="achievement-card__description">{achievement.description}</p>

		{#if showGame && gameUrl}
			<a href={gameUrl} class="achievement-card__game">{gameName}</a>
		{/if}

		{#if achievement.requirements && achievement.requirements.length > 0}
			<Collapsible.Root bind:open={reqOpen} class="achievement-card__requirements">
				<Collapsible.Trigger class="achievement-card__req-toggle">
					Requirements {reqOpen ? 'chevron-down' : 'chevron-right'}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<ul>
						{#each achievement.requirements as req}
							<li>{req}</li>
						{/each}
					</ul>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}

		{#if progress && achievement.total_required}
			<div class="achievement-card__progress">
				<Meter.Root value={progressPercent} max={100} class="achievement-progress-bar" />
				<span class="progress-bar__text">{progress.current} / {achievement.total_required}</span>
			</div>
		{/if}
	</div>

	{#if showCompletions}
		<div class="achievement-card__completions">
			{#if completionCount > 0}
				<div class="achievement-card__count">
					<span class="achievement-card__count-number">{completionCount}</span>
					<span class="achievement-card__count-label">completed</span>
				</div>
				{#if firstCompletion}
					<div class="achievement-card__first">
						<Trophy size={14} /> First:
						<a href="/runners/{firstCompletion.runner_id}">
							{firstCompletion.runner_name || firstCompletion.runner_id}
						</a>
						<span class="muted">({firstCompletion.date_completed})</span>
					</div>
				{/if}
			{:else}
				<div class="achievement-card__count achievement-card__count--none">
					<span class="achievement-card__count-label">Be the first!</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.achievement-card {
		display: flex;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		transition: border-color 0.2s;
	}
	.achievement-card--completed {
		border-color: rgba(234, 179, 8, 0.3);
		background: linear-gradient(135deg, var(--surface) 0%, rgba(234, 179, 8, 0.03) 100%);
	}
	.achievement-card__icon { font-size: 1.75rem; flex-shrink: 0; line-height: 1; padding-top: 0.1rem; }
	.achievement-card__content { flex: 1; min-width: 0; }
	.achievement-card__header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.achievement-card__title { margin: 0; font-size: 1rem; font-weight: 600; }
	.achievement-card__description { margin: 0.35rem 0 0; font-size: 0.85rem; color: var(--muted); line-height: 1.45; }
	.achievement-card__game { display: inline-block; margin-top: 0.4rem; font-size: 0.8rem; color: var(--accent); }

	.achievement-card__difficulty { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.15rem 0.5rem; border-radius: 4px; }
	.difficulty--easy { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
	.difficulty--medium { background: rgba(234, 179, 8, 0.15); color: #eab308; }
	.difficulty--hard { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.difficulty--legendary { background: rgba(168, 85, 247, 0.15); color: #a855f7; }

	/* Requirements (Collapsible) */
	:global(.achievement-card__requirements) { margin-top: 0.5rem; font-size: 0.8rem; }
	:global(.achievement-card__req-toggle) { cursor: pointer; color: var(--muted); font-weight: 600; font-size: 0.8rem; background: none; border: none; padding: 0; font-family: inherit; }
	:global(.achievement-card__req-toggle:hover) { color: var(--accent); }
	:global(.achievement-card__requirements ul) { margin: 0.35rem 0 0; padding-left: 1.25rem; color: var(--muted); }
	:global(.achievement-card__requirements li) { margin-bottom: 0.2rem; }

	/* Progress bar */
	.achievement-card__progress { margin-top: 0.6rem; display: flex; align-items: center; gap: 0.6rem; }
	:global(.achievement-progress-bar) { flex: 1; }
	.progress-bar__text { font-size: 0.75rem; color: var(--muted); font-weight: 600; white-space: nowrap; }

	/* Completions */
	.achievement-card__completions { flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 0.25rem; }
	.achievement-card__count-number { font-size: 1.5rem; font-weight: 700; color: var(--accent); line-height: 1; }
	.achievement-card__count-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
	.achievement-card__count--none .achievement-card__count-label { font-style: italic; text-transform: none; letter-spacing: 0; }
	.achievement-card__first { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
	.achievement-card__first a { color: var(--accent); }

	@media (max-width: 500px) {
		.achievement-card { flex-wrap: wrap; }
		.achievement-card__completions { width: 100%; flex-direction: row; align-items: center; justify-content: flex-start; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border); }
	}
</style>
