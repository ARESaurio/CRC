<script lang="ts">
	import { Menubar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Menubar.Root class="ui-menubar {className}" {...restProps}>{@render children?.()}</Menubar.Root>
<style>:global(.ui-menubar) { display: flex; align-items: center; gap: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.2rem; }</style>
