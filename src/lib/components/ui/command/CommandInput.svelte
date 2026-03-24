<script lang="ts">
	import { Command } from 'bits-ui';
	let { class: className = '', placeholder = 'Search...', ...restProps }: { class?: string; placeholder?: string; [key: string]: any } = $props();
</script>
<Command.Input class="ui-command__input {className}" {placeholder} {...restProps} />
<style>
	:global(.ui-command__input) { width: 100%; padding: 0.65rem 0.75rem; background: transparent; border: none; border-bottom: 1px solid var(--border); color: var(--fg); font-family: inherit; font-size: 0.95rem; }
	:global(.ui-command__input:focus) { outline: none; }
	:global(.ui-command__input::placeholder) { color: var(--text-muted); }
</style>
