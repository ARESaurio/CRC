<script lang="ts">
	import { Toolbar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Toolbar.Button class="ui-toolbar__btn {className}" {...restProps}>{@render children?.()}</Toolbar.Button>
<style>
	:global(.ui-toolbar__btn) { padding: 0.3rem 0.5rem; background: none; border: none; border-radius: 4px; color: var(--fg); font-family: inherit; font-size: 0.85rem; cursor: pointer; transition: background 0.15s; }
	:global(.ui-toolbar__btn:hover) { background: var(--panel); }
</style>
