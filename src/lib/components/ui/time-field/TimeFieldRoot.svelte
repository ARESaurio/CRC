<script lang="ts">
	import { TimeField } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<div class={className}>
<TimeField.Root {...restProps}>
	{#if children}{@render children()}{:else}
		<TimeField.Input class="ui-date-field">
			{#snippet children({ segments }: { segments: any[] })}
				{#each segments as seg}
					<TimeField.Segment part={seg.part} class="ui-date-seg" />
				{/each}
			{/snippet}
		</TimeField.Input>
	{/if}
</TimeField.Root>
</div>
