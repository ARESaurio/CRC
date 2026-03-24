<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<AlertDialog.Action class="btn btn--accent {className}" {...restProps}>{@render children?.()}</AlertDialog.Action>
