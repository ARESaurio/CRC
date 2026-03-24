<script lang="ts">
	import { Command } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { heading, class: className = '', children, ...restProps }: { heading?: string; class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Command.Group {heading} class="ui-command__group {className}" {...restProps}>{@render children?.()}</Command.Group>
<style>
	:global(.ui-command__group [data-command-group-heading]) { padding: 0.35rem 0.6rem; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
</style>
