<script lang="ts">
	import { Combobox } from 'bits-ui';
	import { getContext } from 'svelte';
	let { class: className = '', placeholder = '', ...restProps }: { class?: string; placeholder?: string; [key: string]: any } = $props();

	// Read the input handler from ComboboxRoot's context.
	// This fires alongside Bits UI's internal oninput (mergeProps merges both).
	const notify = getContext<((v: string) => void) | undefined>('combobox-input-handler');
	function oninput(e: Event) { notify?.((e.currentTarget as HTMLInputElement).value); }
</script>
<Combobox.Input class="ui-combobox-input {className}" {placeholder} {oninput} {...restProps} />
<style>
	:global(.ui-combobox-input) { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.9rem; }
	:global(.ui-combobox-input:focus) { outline: none; border-color: var(--accent); }
</style>
