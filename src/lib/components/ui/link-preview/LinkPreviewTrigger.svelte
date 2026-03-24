<script lang="ts">
	import { LinkPreview } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', href = '', children, ...restProps }: { class?: string; href?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<LinkPreview.Trigger {href} class="ui-link-preview-trigger {className}" {...restProps}>{@render children?.()}</LinkPreview.Trigger>
<style>:global(.ui-link-preview-trigger) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }</style>
