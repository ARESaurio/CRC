<script lang="ts">
	import { RadioGroup } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { value = $bindable(''), class: className = '', children, ...restProps }: { value?: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<RadioGroup.Root bind:value class="ui-radio-group {className}" {...restProps}>{@render children?.()}</RadioGroup.Root>
<style>:global(.ui-radio-group) { display: flex; flex-direction: column; gap: 0.5rem; }</style>
