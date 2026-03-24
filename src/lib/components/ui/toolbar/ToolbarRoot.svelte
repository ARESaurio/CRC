<script lang="ts">
	import { Toolbar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Toolbar.Root class="ui-toolbar {className}" {...restProps}>{@render children?.()}</Toolbar.Root>
<style>:global(.ui-toolbar) { display: flex; align-items: center; gap: 0.25rem; padding: 0.35rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }</style>
