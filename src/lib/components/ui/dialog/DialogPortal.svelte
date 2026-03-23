<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let { children, ...restProps }: { children?: Snippet; [key: string]: any } = $props();
</script>

<Dialog.Portal {...restProps}>
	{@render children?.()}
</Dialog.Portal>
