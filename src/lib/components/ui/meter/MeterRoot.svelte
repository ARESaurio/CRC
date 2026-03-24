<script lang="ts">
	import { Meter } from 'bits-ui';
	let { value = 0, max = 100, class: className = '', ...restProps }: { value?: number; max?: number; class?: string; [key: string]: any } = $props();
</script>
<Meter.Root {value} {max} class="ui-meter {className}" {...restProps} />
<style>
	:global(.ui-meter) { position: relative; width: 100%; height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; }
	:global(.ui-meter [data-meter-indicator]) { height: 100%; border-radius: 4px; background: var(--accent); transition: width 0.3s ease; }
</style>
