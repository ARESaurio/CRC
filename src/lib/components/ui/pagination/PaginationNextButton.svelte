<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import { Pagination } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Pagination.NextButton class="ui-page-btn {className}" {...restProps}>{#if children}{@render children()}{:else}<ArrowRight size={14} />{/if}</Pagination.NextButton>
