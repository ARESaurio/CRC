<script lang="ts">
	import { Command } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value, class: className = '', children, ...restProps }: { value: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Command.Item {value} class="ui-command__item {className}" {...restProps}>{@render children?.()}</Command.Item>
<style>
	:global(.ui-command__item) { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.6rem; border-radius: 4px; font-size: 0.9rem; cursor: pointer; color: var(--fg); }
	:global(.ui-command__item[data-highlighted]) { background: var(--panel); }
</style>
