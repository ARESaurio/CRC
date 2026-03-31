<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Title class="sheet-title {className}" {...restProps}>
	{@render children?.()}
</Dialog.Title>

<style>
	:global(.sheet-title) {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
</style>
