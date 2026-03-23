<script lang="ts">
	import { Dialog } from 'bits-ui';

	let { class: className = '', ...restProps }: { class?: string; [key: string]: any } = $props();
</script>

<Dialog.Overlay class="dialog-overlay {className}" {...restProps} />

<style>
	:global(.dialog-overlay) {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(2px);
		animation: dialog-fade-in 0.15s ease-out;
	}
	@keyframes dialog-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
