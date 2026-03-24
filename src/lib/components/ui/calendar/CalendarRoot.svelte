<script lang="ts">
	import { Calendar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { type = 'single', class: className = '', children, ...restProps }: { type?: 'single' | 'multiple'; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Calendar.Root type={type as any} class="ui-calendar {className}" {...restProps}>
	{#if children}{@render children()}{:else}
		{#snippet header({ headingValue, prevButtonProps, nextButtonProps }: { headingValue: string; prevButtonProps: Record<string, any>; nextButtonProps: Record<string, any> })}
			<div class="ui-cal-header">
				<button class="ui-cal-nav" {...prevButtonProps}>‹</button>
				<span class="ui-cal-heading">{headingValue}</span>
				<button class="ui-cal-nav" {...nextButtonProps}>›</button>
			</div>
		{/snippet}
		{#snippet cell({ date, props: cellProps }: { date: any; props: Record<string, any> })}
			<Calendar.Cell {date}>
				<Calendar.Day class="ui-cal-day" />
			</Calendar.Cell>
		{/snippet}
	{/if}
</Calendar.Root>
<style>
	:global(.ui-calendar) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem; width: fit-content; }
	:global(.ui-cal-header) { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
	:global(.ui-cal-heading) { font-size: 0.9rem; font-weight: 600; }
	:global(.ui-cal-nav) { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 1rem; }
	:global(.ui-cal-nav:hover) { background: var(--panel); }
	:global(.ui-cal-day) { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 0.82rem; cursor: pointer; border: none; background: none; color: var(--fg); }
	:global(.ui-cal-day:hover) { background: var(--panel); }
	:global(.ui-cal-day[data-selected]) { background: var(--accent); color: #fff; }
	:global(.ui-cal-day[data-today]) { font-weight: 700; }
	:global(.ui-cal-day[data-outside-month]) { color: var(--text-muted); opacity: 0.4; }
	:global(.ui-cal-day[data-disabled]) { opacity: 0.3; cursor: default; }
</style>
