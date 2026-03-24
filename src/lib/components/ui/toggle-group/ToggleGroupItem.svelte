<script lang="ts">
	import { ToggleGroup } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value, class: className = '', children, ...restProps }: { value: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<ToggleGroup.Item {value} class="ui-toggle-group-item {className}" {...restProps}>{@render children?.()}</ToggleGroup.Item>
<style>
	:global(.ui-toggle-group-item) { padding: 0.4rem 0.75rem; background: var(--bg); border: none; border-right: 1px solid var(--border); color: var(--text-muted); font-family: inherit; font-size: 0.85rem; cursor: pointer; transition: all 0.15s; }
	:global(.ui-toggle-group-item:last-child) { border-right: none; }
	:global(.ui-toggle-group-item:hover) { background: var(--panel); }
	:global(.ui-toggle-group-item[data-state="on"]) { background: rgba(var(--accent-rgb), 0.12); color: var(--accent); }
</style>
