<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		sideOffset = 6,
		...restProps
	}: { class?: string; children?: Snippet; sideOffset?: number; [key: string]: any } = $props();
</script>

<DropdownMenu.Content class="dropdown-content {className}" {sideOffset} {...restProps}>
	{@render children?.()}
</DropdownMenu.Content>

<style>
	:global(.dropdown-content) {
		min-width: 140px;
		padding: 0.35rem 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 8px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 100;
	}
</style>
