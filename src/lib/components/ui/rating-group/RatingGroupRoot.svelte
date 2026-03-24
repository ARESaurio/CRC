<script lang="ts">
	import { RatingGroup } from 'bits-ui';
	let { value = $bindable(0), max = 5, class: className = '', ...restProps }: { value?: number; max?: number; class?: string; [key: string]: any } = $props();
</script>
<RatingGroup.Root bind:value {max} class="ui-rating {className}" {...restProps}>
	{#each { length: max } as _, i}
		<RatingGroup.Item index={i + 1} class="ui-rating__star">★</RatingGroup.Item>
	{/each}
</RatingGroup.Root>
<style>
	:global(.ui-rating) { display: flex; gap: 0.15rem; }
	:global(.ui-rating__star) { font-size: 1.4rem; cursor: pointer; color: var(--border); transition: color 0.1s; background: none; border: none; padding: 0; }
	:global(.ui-rating__star:hover) { color: #f59e0b; }
	:global(.ui-rating__star[data-highlighted]) { color: #f59e0b; }
</style>
