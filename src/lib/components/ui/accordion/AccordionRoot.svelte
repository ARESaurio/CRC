<script lang="ts">
	import { Accordion } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable([]),
		type = 'multiple',
		class: className = '',
		children,
		...restProps
	}: {
		value?: string | string[];
		type?: 'single' | 'multiple';
		class?: string;
		children?: Snippet;
		[key: string]: any;
	} = $props();
</script>

<Accordion.Root bind:value {type} class="forum-accordion {className}" {...restProps}>
	{@render children?.()}
</Accordion.Root>
