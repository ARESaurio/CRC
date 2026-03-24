<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { open = $bindable(false), children, ...restProps }: { open?: boolean; children?: Snippet; [key: string]: any } = $props();
</script>
<AlertDialog.Root bind:open {...restProps}>{@render children?.()}</AlertDialog.Root>
