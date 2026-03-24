<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { children, ...restProps }: { children?: Snippet; [key: string]: any } = $props();
</script>
<ContextMenu.Root {...restProps}>{@render children?.()}</ContextMenu.Root>
