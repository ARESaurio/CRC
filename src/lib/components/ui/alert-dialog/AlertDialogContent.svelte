<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<AlertDialog.Content class="alert-dialog-content {className}" {...restProps}>{@render children?.()}</AlertDialog.Content>
<style>
	:global(.alert-dialog-content) {
		position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2001;
		max-width: 440px; width: calc(100% - 2rem); background: var(--surface); border: 1px solid var(--border);
		border-radius: var(--radius-lg); padding: 1.5rem; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
		animation: alert-pop 0.2s ease-out;
	}
	:global(.alert-dialog-content:focus-visible) { outline: none; }
	@keyframes alert-pop { from { opacity: 0; transform: translate(-50%,-50%) scale(0.95); } to { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
</style>
