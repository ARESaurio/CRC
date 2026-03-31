<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Description class="sheet-description {className}" {...restProps}>
	{@render children?.()}
</Dialog.Description>

<style>
	:global(.sheet-description) {
		font-size: 0.8rem;
		color: var(--muted);
		margin: 0;
	}
</style>
