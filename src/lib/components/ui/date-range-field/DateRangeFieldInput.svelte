<script lang="ts">
	import { DateRangeField } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { type, class: className = '', children, ...restProps }: { type: 'start' | 'end'; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<DateRangeField.Input {type} class="ui-date-field {className}" {...restProps}>
	{#if children}{@render children()}{:else}
		{#snippet children({ segments })}
			{#each segments as seg}
				<DateRangeField.Segment segment={seg} class="ui-date-seg" />
			{/each}
		{/snippet}
	{/if}
</DateRangeField.Input>
