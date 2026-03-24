<script lang="ts">
	import { AspectRatio } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { ratio = 16 / 9, class: className = '', children, ...restProps }: { ratio?: number; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<AspectRatio.Root {ratio} class={className} {...restProps}>{@render children?.()}</AspectRatio.Root>
