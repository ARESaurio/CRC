<script lang="ts">
	import { Accordion } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		value,
		class: className = '',
		children,
		...restProps
	}: {
		value: string;
		class?: string;
		children?: Snippet;
		[key: string]: any;
	} = $props();
</script>

<Accordion.Item {value} class="forum-thread {className}" {...restProps}>
	{@render children?.()}
</Accordion.Item>
