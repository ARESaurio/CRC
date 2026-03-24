<script lang="ts">
	let { class: className = '', ...restProps }: { class?: string; [key: string]: any } = $props();
</script>
<div role="separator" class="ui-toolbar__sep {className}" {...restProps}></div>
<style>:global(.ui-toolbar__sep) { width: 1px; height: 1.25rem; background: var(--border); margin: 0 0.15rem; }</style>
