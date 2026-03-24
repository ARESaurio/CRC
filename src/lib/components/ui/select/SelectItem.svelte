<script lang="ts">
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value, label, class: className = '', children, ...restProps }: { value: string; label?: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Select.Item {value} {label} class="ui-select-item {className}" {...restProps}>
	{#if children}{@render children()}{:else}{label || value}{/if}
</Select.Item>
<style>
	:global(.ui-select-item) { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.88rem; cursor: pointer; color: var(--fg); }
	:global(.ui-select-item[data-highlighted]) { background: var(--panel); }
	:global(.ui-select-item[data-selected]) { color: var(--accent); }
</style>
