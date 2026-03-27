<script lang="ts">
	// @ts-nocheck — discriminated union on type prop can't be satisfied by generic wrapper
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), open = $bindable(false), type = 'single', class: className = '', children, onValueChange, ...restProps }: { value?: string | string[]; open?: boolean; type?: 'single' | 'multiple'; class?: string; children?: Snippet; onValueChange?: (v: any) => void; [key: string]: any } = $props();
	function handleValueChange(v: string | string[]) {
		if (type === 'single') open = false;
		onValueChange?.(v);
	}
</script>
<div class={className}>
<Select.Root bind:value bind:open {type} onValueChange={handleValueChange} {...restProps}>{@render children?.()}</Select.Root>
</div>
