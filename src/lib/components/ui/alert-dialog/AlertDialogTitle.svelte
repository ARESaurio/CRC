<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<AlertDialog.Title class="alert-dialog-title {className}" {...restProps}>{@render children?.()}</AlertDialog.Title>
<style>:global(.alert-dialog-title) { margin: 0 0 0.5rem; font-size: 1.1rem; font-weight: 600; }</style>
