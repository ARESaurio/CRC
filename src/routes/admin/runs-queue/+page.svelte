<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	onMount(() => goto('/admin/runs', { replaceState: true }));
</script>
<div class="page-width" style="text-align:center;padding:4rem 0;">
	<p class="muted">Redirecting to Runs…</p>
</div>
