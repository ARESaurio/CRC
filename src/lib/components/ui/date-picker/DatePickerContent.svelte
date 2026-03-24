<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import type { Snippet } from 'svelte';
	let { class: className = '', children, ...restProps }: { class?: string; children?: Snippet; [key: string]: any } = $props();
</script>
<DatePicker.Content class="ui-datepicker-content {className}" {...restProps}>{@render children?.()}</DatePicker.Content>
<style>:global(.ui-datepicker-content) { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 16px rgba(0,0,0,0.35); z-index: 200; padding: 0.5rem; }</style>
