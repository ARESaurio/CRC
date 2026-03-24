<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<ContextMenu.Item class="ui-ctx-item {className}" {...restProps}>{@render children?.()}</ContextMenu.Item>
<style>
	:global(.ui-ctx-item) { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.88rem; cursor: pointer; color: var(--fg); }
	:global(.ui-ctx-item[data-highlighted]) { background: var(--panel); }
</style>
