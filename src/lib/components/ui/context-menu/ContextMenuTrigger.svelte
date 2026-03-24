<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<ContextMenu.Trigger class={className} {...restProps}>{@render children?.()}</ContextMenu.Trigger>
