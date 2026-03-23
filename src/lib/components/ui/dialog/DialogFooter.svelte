<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children
	}: { class?: string; children?: Snippet } = $props();
</script>

<div class="dialog-footer {className}">
	{@render children?.()}
</div>

<style>
	:global(.dialog-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
	}
</style>
