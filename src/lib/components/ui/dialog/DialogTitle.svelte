<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Title class="dialog-title {className}" {...restProps}>
	{@render children?.()}
</Dialog.Title>

<style>
	:global(.dialog-title) {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}
</style>
