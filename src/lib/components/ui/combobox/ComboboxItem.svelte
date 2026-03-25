<script lang="ts">
	import { Combobox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value, class: className = '', children, ...restProps }: { value: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Combobox.Item {value} class="ui-combobox-item {className}" {...restProps}>{@render children?.()}</Combobox.Item>
<style>
	:global(.ui-combobox-item) { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 4px; font-size: 0.88rem; cursor: pointer; color: var(--fg); }
	:global(.ui-combobox-item[hidden]) { display: flex !important; }
	:global(.ui-combobox-item[data-highlighted]) { background: var(--panel); }
	:global(.ui-combobox-item[data-selected]) { color: var(--accent); }
</style>
