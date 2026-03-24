<script lang="ts">
	import { TimeField } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<TimeField.Root class={className} {...restProps}>
	{#if children}{@render children()}{:else}
		<TimeField.Input class="ui-date-field">
			{#snippet children({ segments })}
				{#each segments as seg}
					<TimeField.Segment segment={seg} class="ui-date-seg" />
				{/each}
			{/snippet}
		</TimeField.Input>
	{/if}
</TimeField.Root>
