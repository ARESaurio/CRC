<script lang="ts">
	// @ts-nocheck — discriminated union on type prop can't be satisfied by generic wrapper
	import { Combobox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), inputValue = $bindable(''), open = $bindable(false), type = 'single', class: className = '', children, ...restProps }: { value?: string | string[]; inputValue?: string; open?: boolean; type?: 'single' | 'multiple'; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<div class={className}>
<Combobox.Root bind:value bind:inputValue bind:open {type} {...restProps}>{@render children?.()}</Combobox.Root>
</div>
