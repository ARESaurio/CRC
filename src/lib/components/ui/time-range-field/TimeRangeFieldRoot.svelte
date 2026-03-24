<script lang="ts">
	import { TimeRangeField } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<TimeRangeField.Root class={className} {...restProps}>{@render children?.()}</TimeRangeField.Root>
