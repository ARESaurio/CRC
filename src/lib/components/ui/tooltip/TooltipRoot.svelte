<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { children, ...restProps }: { children?: Snippet; [key: string]: any } = $props();
</script>
<Tooltip.Root {...restProps}>{@render children?.()}</Tooltip.Root>
