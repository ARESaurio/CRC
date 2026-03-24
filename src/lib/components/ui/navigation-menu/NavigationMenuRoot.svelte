<script lang="ts">
	import { NavigationMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<NavigationMenu.Root class="ui-nav-menu {className}" {...restProps}>{@render children?.()}</NavigationMenu.Root>
<style>:global(.ui-nav-menu) { display: flex; align-items: center; }</style>
