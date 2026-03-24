<script lang="ts">
	import { Pagination } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { page = $bindable(1), count, perPage = 10, class: className = '', children, ...restProps }: { page?: number; count: number; perPage?: number; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Pagination.Root bind:page {count} {perPage} class="ui-pagination {className}" {...restProps}>{@render children?.()}</Pagination.Root>
<style>:global(.ui-pagination) { display: flex; align-items: center; gap: 0.25rem; }</style>
