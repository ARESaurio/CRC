<script lang="ts">
	import { Command } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Command.List class="ui-command__list {className}" {...restProps}>{@render children?.()}</Command.List>
<style>:global(.ui-command__list) { max-height: 300px; overflow-y: auto; padding: 0.25rem; }</style>
