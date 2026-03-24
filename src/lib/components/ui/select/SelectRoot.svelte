<script lang="ts">
	// @ts-nocheck — discriminated union on type prop can't be satisfied by generic wrapper
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), type = 'single', class: className = '', children, ...restProps }: { value?: string | string[]; type?: 'single' | 'multiple'; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<div class={className}>
<Select.Root bind:value {type} {...restProps}>{@render children?.()}</Select.Root>
</div>
