<script lang="ts">
	import { Label } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Label.Root class="ui-label {className}" {...restProps}>{@render children?.()}</Label.Root>
<style>:global(.ui-label) { font-size: 0.88rem; font-weight: 600; color: var(--fg); }</style>
