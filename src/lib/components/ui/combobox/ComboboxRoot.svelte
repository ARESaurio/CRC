<script lang="ts">
	import { Combobox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), type = 'single', class: className = '', children, ...restProps }: { value?: string | string[]; type?: 'single' | 'multiple'; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Combobox.Root bind:value {type} class={className} {...restProps}>{@render children?.()}</Combobox.Root>
