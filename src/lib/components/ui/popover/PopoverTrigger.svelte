<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<Popover.Trigger class={className} {...restProps}>
	{@render children?.()}
</Popover.Trigger>
