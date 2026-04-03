<script lang="ts">
	import { Lock } from 'lucide-svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages.js';

	let {
		message = '',
		backHref = '/',
		backLabel = ''
	}: {
		message?: string;
		backHref?: string;
		backLabel?: string;
	} = $props();

	let resolvedLabel = $derived(backLabel || m.error_go_home());
</script>

<div class="center">
	<h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2>
	{#if message}<p class="muted">{message}</p>{/if}
	<a href={localizeHref(backHref)} class="btn">{resolvedLabel}</a>
</div>
