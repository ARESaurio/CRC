<script lang="ts">
	import { Toggle } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { pressed = $bindable(false), class: className = '', children, ...restProps }: { pressed?: boolean; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Toggle.Root bind:pressed class="ui-toggle {className}" {...restProps}>{@render children?.()}</Toggle.Root>
<style>
	:global(.ui-toggle) { display: inline-flex; align-items: center; justify-content: center; padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg); color: var(--text-muted); font-family: inherit; font-size: 0.88rem; cursor: pointer; transition: all 0.15s; }
	:global(.ui-toggle:hover) { background: var(--panel); }
	:global(.ui-toggle[data-state="on"]) { background: rgba(var(--accent-rgb), 0.12); border-color: var(--accent); color: var(--accent); }
</style>
