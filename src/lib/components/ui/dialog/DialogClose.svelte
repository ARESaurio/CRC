<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Close class="dialog-close {className}" {...restProps}>
	{@render children?.()}
</Dialog.Close>

<style>
	:global(.dialog-close) {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: none;
		border: none;
		border-radius: 4px;
		color: var(--muted);
		cursor: pointer;
		font-size: 1.25rem;
		line-height: 1;
		transition: background 0.2s, color 0.2s;
	}
	:global(.dialog-close:hover) {
		background: var(--bg);
		color: var(--fg);
	}
</style>
