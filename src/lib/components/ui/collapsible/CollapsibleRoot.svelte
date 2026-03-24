<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { open = $bindable(false), class: className = '', children, ...restProps }: { open?: boolean; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Collapsible.Root bind:open class={className} {...restProps}>{@render children?.()}</Collapsible.Root>
