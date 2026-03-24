<script lang="ts">
	import { DateField } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<div class={className}>
<DateField.Root {...restProps}>
	{#if children}{@render children()}{:else}
		<DateField.Input class="ui-date-field">
			{#snippet children({ segments }: { segments: any[] })}
				{#each segments as seg}
					<DateField.Segment part={seg.part} class="ui-date-seg" />
				{/each}
			{/snippet}
		</DateField.Input>
	{/if}
</DateField.Root>
</div>
<style>
	:global(.ui-date-field) { display: inline-flex; align-items: center; gap: 0; padding: 0.4rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.9rem; }
	:global(.ui-date-field:focus-within) { border-color: var(--accent); }
	:global(.ui-date-seg) { padding: 0 1px; color: var(--fg); }
	:global(.ui-date-seg[data-segment="literal"]) { color: var(--text-muted); }
	:global(.ui-date-seg:focus) { outline: none; background: rgba(var(--accent-rgb), 0.15); border-radius: 2px; }
</style>
