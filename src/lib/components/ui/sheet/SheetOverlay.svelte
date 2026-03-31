<script lang="ts">
	import { Dialog } from 'bits-ui';

	let { class: className = '', ...restProps }: { class?: string; [key: string]: any } = $props();
</script>

<Dialog.Overlay class="sheet-overlay {className}" {...restProps} />

<style>
	:global(.sheet-overlay) {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.5);
		animation: sheet-fade-in 0.15s ease-out;
	}
	@keyframes sheet-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
