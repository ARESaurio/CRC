<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		side = 'right',
		class: className = '',
		children,
		...restProps
	}: { side?: 'left' | 'right'; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Content class="sheet-content sheet-content--{side} {className}" {...restProps}>
	{@render children?.()}
</Dialog.Content>

<style>
	:global(.sheet-content) {
		position: fixed;
		top: 0;
		bottom: 0;
		z-index: 1001;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		max-width: 85vw;
		outline: none;
	}
	:global(.sheet-content--left) {
		left: 0;
		border-right: 1px solid var(--border);
		animation: sheet-slide-left 0.2s ease-out;
	}
	:global(.sheet-content--right) {
		right: 0;
		border-left: 1px solid var(--border);
		animation: sheet-slide-right 0.2s ease-out;
	}
	:global(.sheet-content:focus-visible) {
		outline: none;
	}
	@keyframes sheet-slide-left {
		from { transform: translateX(-100%); }
		to { transform: translateX(0); }
	}
	@keyframes sheet-slide-right {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}
</style>
