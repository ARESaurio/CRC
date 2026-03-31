<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Close class="sheet-close {className}" {...restProps}>
	{@render children?.()}
</Dialog.Close>

<style>
	:global(.sheet-close) {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		font-size: 1.5rem;
		line-height: 1;
		transition: color 0.2s;
	}
	:global(.sheet-close:hover) {
		color: var(--fg);
	}
</style>
