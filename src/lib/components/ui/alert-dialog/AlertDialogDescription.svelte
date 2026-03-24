<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<AlertDialog.Description class="alert-dialog-desc {className}" {...restProps}>{@render children?.()}</AlertDialog.Description>
<style>:global(.alert-dialog-desc) { font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; margin: 0 0 1rem; }</style>
