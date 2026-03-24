<script lang="ts">
	import { NavigationMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<NavigationMenu.List class="ui-nav-menu__list {className}" {...restProps}>{@render children?.()}</NavigationMenu.List>
<style>:global(.ui-nav-menu__list) { display: flex; align-items: center; gap: 0.25rem; list-style: none; padding: 0; margin: 0; }</style>
