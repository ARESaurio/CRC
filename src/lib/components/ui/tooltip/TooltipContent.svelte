<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', sideOffset = 6, children, ...restProps }: { class?: string; sideOffset?: number; children?: Snippet; [key: string]: any } = $props();
</script>
<Tooltip.Content class="ui-tooltip {className}" {sideOffset} {...restProps}>{@render children?.()}</Tooltip.Content>
<style>
	:global(.ui-tooltip) { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.35rem 0.6rem; font-size: 0.82rem; color: var(--fg); box-shadow: 0 2px 8px rgba(0,0,0,0.25); z-index: 300; max-width: 240px; animation: tooltip-in 0.1s ease-out; }
	@keyframes tooltip-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
</style>
