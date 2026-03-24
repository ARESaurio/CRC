<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<DatePicker.Root class={className} {...restProps}>{@render children?.()}</DatePicker.Root>
