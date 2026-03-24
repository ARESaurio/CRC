<script lang="ts">
	import { PinInput } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), maxlength = 6, class: className = '', children, ...restProps }: { value?: string; maxlength?: number; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<PinInput.Root bind:value {maxlength} class="ui-pin-input {className}" {...restProps}>
	{#if children}{@render children()}{:else}
		{#each { length: maxlength } as _, i}
			<PinInput.Cell cell={{ char: '', isActive: false, hasFakeCaret: false }} class="ui-pin-cell" />
		{/each}
	{/if}
</PinInput.Root>
<style>
	:global(.ui-pin-input) { display: flex; gap: 0.35rem; }
	:global(.ui-pin-cell) { width: 40px; height: 48px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 600; color: var(--fg); }
	:global(.ui-pin-cell[data-active]) { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-2); }
</style>
