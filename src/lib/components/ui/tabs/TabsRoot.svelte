<script lang="ts">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(''),
		class: className = '',
		children,
		...restProps
	}: { value?: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Tabs.Root bind:value class={className} {...restProps}>
	{@render children?.()}
</Tabs.Root>
