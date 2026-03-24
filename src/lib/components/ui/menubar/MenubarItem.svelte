<script lang="ts">
	import { Menubar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Menubar.Item class="ui-menubar__item {className}" {...restProps}>{@render children?.()}</Menubar.Item>
<style>
	:global(.ui-menubar__item) { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.88rem; cursor: pointer; color: var(--fg); }
	:global(.ui-menubar__item[data-highlighted]) { background: var(--panel); }
</style>
