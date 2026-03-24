<script lang="ts">
	import { Pagination } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { page, class: className = '', children, ...restProps }: { page: { value: number }; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Pagination.Page {page} class="ui-page-btn {className}" {...restProps}>{#if children}{@render children()}{:else}{page.value}{/if}</Pagination.Page>
<style>
	:global(.ui-page-btn) { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 0.4rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--fg); font-size: 0.85rem; cursor: pointer; transition: all 0.15s; }
	:global(.ui-page-btn:hover) { background: var(--panel); }
	:global(.ui-page-btn[data-selected]) { background: var(--accent); border-color: var(--accent); color: #fff; }
	:global(.ui-page-btn:disabled) { opacity: 0.4; cursor: default; }
</style>
