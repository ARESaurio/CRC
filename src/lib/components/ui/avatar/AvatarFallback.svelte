<script lang="ts">
	import { Avatar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Avatar.Fallback class="ui-avatar__fallback {className}" {...restProps}>{@render children?.()}</Avatar.Fallback>
<style>:global(.ui-avatar__fallback) { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); background: var(--panel); }</style>
