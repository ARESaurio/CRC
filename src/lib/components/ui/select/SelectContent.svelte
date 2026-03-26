<script lang="ts">
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', sideOffset = 6, children, ...restProps }: { class?: string; sideOffset?: number; children?: Snippet; [key: string]: any } = $props();
</script>
<Select.Content class="ui-select-content {className}" {sideOffset} forceMount {...restProps}>{@render children?.()}</Select.Content>
<style>
	:global(.ui-select-content) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 50; max-height: 240px; overflow-y: auto; padding: 0.25rem; }
	:global(.ui-select-content[data-state="closed"]) { display: none; }
</style>
