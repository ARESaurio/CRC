<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		children,
		...restProps
	}: { open?: boolean; children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Root bind:open {...restProps}>
	{@render children?.()}
</Dialog.Root>
