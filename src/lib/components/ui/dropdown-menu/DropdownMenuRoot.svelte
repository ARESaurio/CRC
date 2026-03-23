<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		children,
		...restProps
	}: { open?: boolean; children?: Snippet; [key: string]: any } = $props();
</script>

<DropdownMenu.Root bind:open {...restProps}>
	{@render children?.()}
</DropdownMenu.Root>
