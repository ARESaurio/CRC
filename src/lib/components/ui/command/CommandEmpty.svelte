<script lang="ts">
	import { Command } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Command.Empty class="ui-command__empty {className}" {...restProps}>{@render children?.()}</Command.Empty>
<style>:global(.ui-command__empty) { padding: 1.5rem; text-align: center; font-size: 0.88rem; color: var(--text-muted); }</style>
