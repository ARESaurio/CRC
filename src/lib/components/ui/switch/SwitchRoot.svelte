<script lang="ts">
	import { Switch } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { checked = $bindable(false), class: className = '', children, ...restProps }: { checked?: boolean; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Switch.Root bind:checked class="ui-switch {className}" {...restProps}>
	<Switch.Thumb class="ui-switch__thumb" />
	{#if children}{@render children()}{/if}
</Switch.Root>
<style>
	:global(.ui-switch) { display: inline-flex; align-items: center; width: 40px; height: 22px; padding: 2px; border-radius: 999px; background: var(--border); border: none; cursor: pointer; transition: background 0.2s; position: relative; }
	:global(.ui-switch[data-state="checked"]) { background: var(--accent); }
	:global(.ui-switch__thumb) { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
	:global(.ui-switch[data-state="checked"] .ui-switch__thumb) { transform: translateX(18px); }
</style>
