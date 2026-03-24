<script lang="ts">
	import { LinkPreview } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', sideOffset = 8, children, ...restProps }: { class?: string; sideOffset?: number; children?: Snippet; [key: string]: any } = $props();
</script>
<LinkPreview.Content class="ui-link-preview {className}" {sideOffset} {...restProps}>{@render children?.()}</LinkPreview.Content>
<style>
	:global(.ui-link-preview) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem; box-shadow: 0 4px 16px rgba(0,0,0,0.3); z-index: 200; max-width: 320px; }
</style>
