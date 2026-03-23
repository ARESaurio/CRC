<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children
	}: { class?: string; children?: Snippet } = $props();
</script>

<div class="dialog-header {className}">
	{@render children?.()}
</div>

<style>
	:global(.dialog-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}
</style>
