<script lang="ts">
	import { Calendar } from 'lucide-svelte';
	import { DatePicker } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<DatePicker.Trigger class="btn btn--small btn--outline {className}" {...restProps}>{#if children}{@render children()}{:else}<Calendar size={14} />{/if}</DatePicker.Trigger>
