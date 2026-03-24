<script lang="ts">
	import { NavigationMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<NavigationMenu.Trigger class="ui-nav-menu__trigger {className}" {...restProps}>{@render children?.()}</NavigationMenu.Trigger>
<style>
	:global(.ui-nav-menu__trigger) { padding: 0.4rem 0.7rem; border-radius: var(--radius-sm); border: none; background: none; color: var(--fg); font-family: inherit; font-size: 0.9rem; cursor: pointer; }
	:global(.ui-nav-menu__trigger:hover) { background: var(--panel); }
</style>
