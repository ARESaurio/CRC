<script lang="ts">
	import { NavigationMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<NavigationMenu.Item class={className} {...restProps}>{@render children?.()}</NavigationMenu.Item>
