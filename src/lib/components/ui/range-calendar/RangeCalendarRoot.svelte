<script lang="ts">
	import { RangeCalendar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<RangeCalendar.Root class="ui-calendar {className}" {...restProps}>
	{#if children}{@render children()}{/if}
</RangeCalendar.Root>
