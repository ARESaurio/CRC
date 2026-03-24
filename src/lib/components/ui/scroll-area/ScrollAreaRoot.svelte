<script lang="ts">
	import { ScrollArea } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<ScrollArea.Root class="ui-scroll-area {className}" {...restProps}>
	<ScrollArea.Viewport class="ui-scroll-area__viewport">{@render children?.()}</ScrollArea.Viewport>
	<ScrollArea.Scrollbar orientation="vertical" class="ui-scroll-area__bar">
		<ScrollArea.Thumb class="ui-scroll-area__thumb" />
	</ScrollArea.Scrollbar>
</ScrollArea.Root>
<style>
	:global(.ui-scroll-area) { position: relative; overflow: hidden; }
	:global(.ui-scroll-area__viewport) { width: 100%; height: 100%; }
	:global(.ui-scroll-area__bar) { display: flex; touch-action: none; padding: 1px; width: 8px; transition: background 0.15s; }
	:global(.ui-scroll-area__bar:hover) { background: rgba(255,255,255,0.04); }
	:global(.ui-scroll-area__thumb) { position: relative; flex: 1; border-radius: 4px; background: rgba(255,255,255,0.15); }
	:global(.ui-scroll-area__thumb:hover) { background: rgba(255,255,255,0.25); }
</style>
