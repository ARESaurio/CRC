<script lang="ts">
	import { Avatar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<Avatar.Root class="ui-avatar {className}" {...restProps}>{@render children?.()}</Avatar.Root>
<style>
	:global(.ui-avatar) { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--surface); border: 1px solid var(--border); flex-shrink: 0; }
</style>
