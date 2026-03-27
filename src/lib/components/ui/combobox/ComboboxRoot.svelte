<script lang="ts">
	// @ts-nocheck — discriminated union on type prop can't be satisfied by generic wrapper
	import { Combobox } from 'bits-ui';
	import { untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), inputValue = $bindable(''), open = $bindable(false), type = 'single', class: className = '', children, onInputValueChange, ...restProps }: { value?: string | string[]; inputValue?: string; open?: boolean; type?: 'single' | 'multiple'; class?: string; children?: Snippet; onInputValueChange?: (value: string) => void; [key: string]: any } = $props();

	// Use bind:inputValue on the inner Bits UI Combobox.Root so typing always
	// updates inputValue reliably (Bits UI v2 doesn't always fire onInputValueChange).
	// Then notify the consumer via $effect so their filter state stays in sync.
	$effect(() => {
		const v = inputValue;
		untrack(() => onInputValueChange?.(v));
	});

	let hasQuery = $derived(inputValue.trim() !== '');
</script>
<div class={className} data-combobox-has-query={hasQuery}>
<Combobox.Root bind:value bind:open {type} bind:inputValue {...restProps}>{@render children?.()}</Combobox.Root>
</div>
<style>
	:global([data-combobox-has-query="false"] .ui-combobox-content > :nth-child(n+11 of .ui-combobox-item)) { display: none !important; }
</style>
