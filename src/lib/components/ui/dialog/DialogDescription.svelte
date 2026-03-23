<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Description class="dialog-description {className}" {...restProps}>
	{@render children?.()}
</Dialog.Description>

<style>
	:global(.dialog-description) {
		font-size: 0.9rem;
		color: var(--muted);
		margin: 0.25rem 0 0;
	}
</style>
