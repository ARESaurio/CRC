<script lang="ts">
	import { Combobox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', sideOffset = 6, children, ...restProps }: { class?: string; sideOffset?: number; children?: Snippet; [key: string]: any } = $props();
</script>
<Combobox.Content class="ui-combobox-content {className}" {sideOffset} {...restProps}>{@render children?.()}</Combobox.Content>
<style>
	:global(.ui-combobox-content) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 100; max-height: 240px; overflow-y: auto; padding: 0.25rem; }
</style>
