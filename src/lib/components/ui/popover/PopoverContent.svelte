<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		sideOffset = 6,
		align = 'end' as const,
		...restProps
	}: { class?: string; children?: Snippet; sideOffset?: number; align?: 'start' | 'center' | 'end'; [key: string]: any } = $props();
</script>

<Popover.Content class="popover-content {className}" {sideOffset} {align} {...restProps}>
	{@render children?.()}
</Popover.Content>

<style>
	:global(.popover-content) {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 8px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 50;
	}
	:global(.popover-content:focus-visible) {
		outline: none;
	}
</style>
