<!--
	TabsList — wraps bits-ui Tabs.List.
	Applies existing project tab container class based on variant prop.

	Usage: <Tabs.List variant="game"> → gets class "game-tabs"
	       <Tabs.List variant="runner"> → gets class "runner-tabs"
	       <Tabs.List variant="edit"> → gets class "edit-tabs"
	       <Tabs.List flush> → adds "tabs--flush"
-->
<script lang="ts">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		variant = 'game',
		flush = false,
		class: className = '',
		children,
		...restProps
	}: {
		variant?: 'runner' | 'game' | 'edit';
		flush?: boolean;
		class?: string;
		children?: Snippet;
		[key: string]: any;
	} = $props();

	const containerClass = $derived(
		`${variant}-tabs${flush ? ' tabs--flush' : ''}${className ? ' ' + className : ''}`
	);
</script>

<Tabs.List class={containerClass} {...restProps}>
	{@render children?.()}
</Tabs.List>
