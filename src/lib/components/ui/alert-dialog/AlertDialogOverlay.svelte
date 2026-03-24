<script lang="ts">
	import { AlertDialog } from 'bits-ui';
	let { class: className = '', ...restProps }: { class?: string; [key: string]: any } = $props();
</script>
<AlertDialog.Overlay class="alert-dialog-overlay {className}" {...restProps} />
<style>
	:global(.alert-dialog-overlay) { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.6); backdrop-filter: blur(2px); }
</style>
