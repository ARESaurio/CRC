<script lang="ts">
	import { Progress } from 'bits-ui';
	let { value = 0, max = 100, class: className = '', ...restProps }: { value?: number; max?: number; class?: string; [key: string]: any } = $props();
</script>
<Progress.Root {value} {max} class="ui-progress {className}" {...restProps} />
<style>
	:global(.ui-progress) { position: relative; width: 100%; height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; }
	:global(.ui-progress [data-progress-indicator]) { height: 100%; border-radius: 4px; background: var(--accent); transition: width 0.3s ease; }
</style>
