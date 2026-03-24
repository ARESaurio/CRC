<script lang="ts">
	import { Accordion } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';

	let {
		class: className = '',
		children,
		...restProps
	}: {
		class?: string;
		children?: Snippet;
		[key: string]: any;
	} = $props();
</script>

<Accordion.Content forceMount={true} {...restProps}>
	{#snippet child({ props, open })}
		{#if open}
			<div {...props} class="forum-thread__content {className}" transition:slide={{ duration: 200 }}>
				{@render children?.()}
			</div>
		{/if}
	{/snippet}
</Accordion.Content>
