<script lang="ts">
	import { Separator } from 'bits-ui';
	let { class: className = '', orientation = 'horizontal', ...restProps }: { class?: string; orientation?: 'horizontal' | 'vertical'; [key: string]: any } = $props();
</script>
<Separator.Root class="ui-separator ui-separator--{orientation} {className}" {orientation} {...restProps} />
<style>
	:global(.ui-separator--horizontal) { height: 1px; width: 100%; background: var(--border); }
	:global(.ui-separator--vertical) { width: 1px; height: 100%; background: var(--border); }
</style>
