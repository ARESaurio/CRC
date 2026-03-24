<script lang="ts">
	import { DateRangePicker } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<DateRangePicker.Root class={className} {...restProps}>{@render children?.()}</DateRangePicker.Root>
