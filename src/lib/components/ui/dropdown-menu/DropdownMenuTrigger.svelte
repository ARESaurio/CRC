<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		children,
		...restProps
	}: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>

<DropdownMenu.Trigger class={className} {...restProps}>
	{@render children?.()}
</DropdownMenu.Trigger>
