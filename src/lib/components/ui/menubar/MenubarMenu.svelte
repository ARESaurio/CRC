<script lang="ts">
	import { Menubar } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { children, ...restProps }: { children?: Snippet; [key: string]: any } = $props();
</script>
<Menubar.Menu {...restProps}>{@render children?.()}</Menubar.Menu>
