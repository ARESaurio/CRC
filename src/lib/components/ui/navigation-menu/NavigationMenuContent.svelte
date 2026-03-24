<script lang="ts">
	import { NavigationMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<NavigationMenu.Content class="ui-nav-menu__content {className}" {...restProps}>{@render children?.()}</NavigationMenu.Content>
<style>:global(.ui-nav-menu__content) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 16px rgba(0,0,0,0.3); padding: 1rem; }</style>
