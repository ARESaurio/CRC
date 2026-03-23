<!--
	TabsTrigger — wraps bits-ui Tabs.Trigger.
	Applies existing tab trigger class based on variant.

	bits-ui adds data-state="active" | "inactive" automatically.
	We map data-state="active" to the project's active styles via CSS below.

	Usage: <Tabs.Trigger variant="game" value="overview">Overview</Tabs.Trigger>
-->
<script lang="ts">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		value,
		variant = 'game',
		class: className = '',
		children,
		...restProps
	}: {
		value: string;
		variant?: 'runner' | 'game' | 'edit';
		class?: string;
		children?: Snippet;
		[key: string]: any;
	} = $props();

	const TRIGGER_CLASSES: Record<string, string> = {
		runner: 'tab',
		game: 'game-tab',
		edit: 'edit-tab'
	};

	const triggerClass = $derived(
		`${TRIGGER_CLASSES[variant] || 'tab'}${className ? ' ' + className : ''}`
	);
</script>

<Tabs.Trigger {value} class={triggerClass} {...restProps}>
	{@render children?.()}
</Tabs.Trigger>
