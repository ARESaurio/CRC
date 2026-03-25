<script lang="ts">
	import { Menubar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', sideOffset = 6, children, ...restProps }: { class?: string; sideOffset?: number; children?: Snippet; [key: string]: any } = $props();
</script>
<Menubar.Content class="ui-menubar__content {className}" {sideOffset} {...restProps}>{@render children?.()}</Menubar.Content>
<style>:global(.ui-menubar__content) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 50; padding: 0.25rem; min-width: 160px; }</style>
