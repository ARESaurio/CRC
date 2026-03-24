<script lang="ts">
	import { Accordion } from 'bits-ui';
	import type { Snippet } from 'svelte';

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

<Accordion.Header class="forum-thread__header">
	<Accordion.Trigger class="forum-thread__trigger {className}" {...restProps}>
		<span class="forum-thread__trigger-content">
			{@render children?.()}
		</span>
		<svg class="forum-thread__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</Accordion.Trigger>
</Accordion.Header>
