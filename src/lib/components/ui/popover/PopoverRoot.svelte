<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		children,
		...restProps
	}: { open?: boolean; children?: Snippet; [key: string]: any } = $props();
</script>

<Popover.Root bind:open {...restProps}>
	{@render children?.()}
</Popover.Root>
