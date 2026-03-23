<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Content class="dialog-content {className}" {...restProps}>
	{@render children?.()}
</Dialog.Content>

<style>
	:global(.dialog-content) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 2001;
		max-width: 480px;
		width: calc(100% - 2rem);
		max-height: 90vh;
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		animation: dialog-pop-in 0.2s ease-out;
	}
	:global(.dialog-content:focus-visible) {
		outline: none;
	}
	@keyframes dialog-pop-in {
		from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
		to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
	}
</style>
