<script lang="ts">
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Select.Trigger class="ui-select-trigger {className}" {...restProps}>
	{@render children?.()}
	<svg class="ui-select-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
</Select.Trigger>
<style>
	:global(.ui-select-trigger) { display: inline-flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.9rem; cursor: pointer; min-width: 140px; }
	:global(.ui-select-trigger:hover) { border-color: var(--border-hover); }
	:global(.ui-select-trigger:focus-visible) { outline: 2px solid var(--focus); outline-offset: -2px; }
	:global(.ui-select-chevron) { color: var(--text-muted); flex-shrink: 0; }
</style>
