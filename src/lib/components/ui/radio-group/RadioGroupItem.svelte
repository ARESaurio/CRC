<script lang="ts">
	import { RadioGroup } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value, class: className = '', children, ...restProps }: { value: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<div class="ui-radio-item">
	<RadioGroup.Item {value} class="ui-radio-dot {className}" {...restProps} />
	{#if children}<label class="ui-radio-label">{@render children()}</label>{/if}
</div>
<style>
	:global(.ui-radio-item) { display: flex; align-items: center; gap: 0.5rem; }
	:global(.ui-radio-dot) { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border); background: var(--bg); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: border-color 0.15s; flex-shrink: 0; }
	:global(.ui-radio-dot:hover) { border-color: var(--accent); }
	:global(.ui-radio-dot[data-state="checked"]) { border-color: var(--accent); }
	:global(.ui-radio-dot[data-state="checked"])::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
	:global(.ui-radio-label) { font-size: 0.9rem; cursor: pointer; }
</style>
