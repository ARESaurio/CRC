<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<AlertDialog.Trigger class={className} {...restProps}>{@render children?.()}</AlertDialog.Trigger>
