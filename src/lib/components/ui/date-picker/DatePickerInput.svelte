<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<DatePicker.Input class="ui-date-field {className}" {...restProps}>
	{#if children}{@render children()}{:else}
		{#snippet children({ segments }: { segments: any[] })}
			{#each segments as seg}
				<DatePicker.Segment part={seg.part} class="ui-date-seg" />
			{/each}
		{/snippet}
	{/if}
</DatePicker.Input>
