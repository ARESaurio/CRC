<script lang="ts">
	import { DateRangeField } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<DateRangeField.Root class={className} {...restProps}>{@render children?.()}</DateRangeField.Root>
