<script lang="ts">
	// @ts-nocheck — discriminated union on type prop can't be satisfied by generic wrapper
	import { Combobox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), inputValue = $bindable(''), open = $bindable(false), type = 'single', class: className = '', children, onInputValueChange, ...restProps }: { value?: string | string[]; inputValue?: string; open?: boolean; type?: 'single' | 'multiple'; class?: string; children?: Snippet; onInputValueChange?: (value: string) => void; [key: string]: any } = $props();
	function handleInputValueChange(v: string) {
		inputValue = v;
		onInputValueChange?.(v);
	}
</script>
<div class={className}>
<Combobox.Root bind:value bind:open {type} {inputValue} onInputValueChange={handleInputValueChange} {...restProps}>{@render children?.()}</Combobox.Root>
</div>
