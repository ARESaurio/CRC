<script lang="ts">
	import { Checkbox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { checked = $bindable(false), class: className = '', children, ...restProps }: { checked?: boolean; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Checkbox.Root bind:checked class="ui-checkbox {className}" {...restProps}>
	{#if children}{@render children()}{:else}
		<svg class="ui-checkbox__check" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
	{/if}
</Checkbox.Root>
<style>
	:global(.ui-checkbox) { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); cursor: pointer; transition: all 0.15s; flex-shrink: 0; color: transparent; }
	:global(.ui-checkbox:hover) { border-color: var(--accent); }
	:global(.ui-checkbox[data-state="checked"]) { background: var(--accent); border-color: var(--accent); color: #fff; }
	:global(.ui-checkbox__check) { width: 14px; height: 14px; }
</style>
