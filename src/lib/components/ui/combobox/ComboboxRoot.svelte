<script lang="ts">
	// @ts-nocheck — discriminated union on type prop can't be satisfied by generic wrapper
	import { Combobox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), inputValue = $bindable(''), open = $bindable(false), type = 'single', class: className = '', children, onInputValueChange, ...restProps }: { value?: string | string[]; inputValue?: string; open?: boolean; type?: 'single' | 'multiple'; class?: string; children?: Snippet; onInputValueChange?: (value: string) => void; [key: string]: any } = $props();
	function handleInputValueChange(v: string) {
		inputValue = v;
		onInputValueChange?.(v);
	}
	let hasQuery = $derived(inputValue.trim() !== '');
</script>
<div class={className} data-combobox-has-query={hasQuery}>
<Combobox.Root bind:value bind:open {type} {inputValue} onInputValueChange={handleInputValueChange} {...restProps}>{@render children?.()}</Combobox.Root>
</div>
<style>
	:global([data-combobox-has-query="false"] .ui-combobox-content > :nth-child(n+11 of .ui-combobox-item)) { display: none !important; }
</style>
