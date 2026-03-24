<script lang="ts">
	import { LinkPreview } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { children, ...restProps }: { children?: Snippet; [key: string]: any } = $props();
</script>
<LinkPreview.Root {...restProps}>{@render children?.()}</LinkPreview.Root>
