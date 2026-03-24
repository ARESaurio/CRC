<script lang="ts">
	import { Command } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Command.Root class="ui-command {className}" {...restProps}>{@render children?.()}</Command.Root>
<style>:global(.ui-command) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }</style>
