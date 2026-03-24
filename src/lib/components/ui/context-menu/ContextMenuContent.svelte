<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<ContextMenu.Content class="ui-ctx-content {className}" {...restProps}>{@render children?.()}</ContextMenu.Content>
<style>
	:global(.ui-ctx-content) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 16px rgba(0,0,0,0.35); z-index: 200; padding: 0.25rem; min-width: 160px; }
</style>
