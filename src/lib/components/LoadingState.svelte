<script lang="ts">
	let {
		message = '',
		compact = false
	}: {
		message?: string;
		compact?: boolean;
	} = $props();
</script>

<div class={compact ? 'center-sm' : 'center'}>
	<div class="spinner"></div>
	{#if message}<p class="muted">{message}</p>{/if}
</div>
