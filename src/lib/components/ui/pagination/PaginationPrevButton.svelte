<script lang="ts">
	import { Pagination } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Pagination.PrevButton class="ui-page-btn {className}" {...restProps}>{#if children}{@render children()}{:else}←{/if}</Pagination.PrevButton>
