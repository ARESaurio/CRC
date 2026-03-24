<script lang="ts">
	import { ToggleGroup } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), type = 'single', class: className = '', children, ...restProps }: { value?: string | string[]; type?: 'single' | 'multiple'; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<ToggleGroup.Root bind:value {type} class="ui-toggle-group {className}" {...restProps}>{@render children?.()}</ToggleGroup.Root>
<style>:global(.ui-toggle-group) { display: inline-flex; gap: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }</style>
