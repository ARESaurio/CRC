<script lang="ts">
	import { Menubar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Menubar.Trigger class="ui-menubar__trigger {className}" {...restProps}>{@render children?.()}</Menubar.Trigger>
<style>
	:global(.ui-menubar__trigger) { padding: 0.35rem 0.65rem; border-radius: 4px; border: none; background: none; color: var(--fg); font-family: inherit; font-size: 0.88rem; cursor: pointer; }
	:global(.ui-menubar__trigger:hover), :global(.ui-menubar__trigger[data-state="open"]) { background: var(--panel); }
</style>
