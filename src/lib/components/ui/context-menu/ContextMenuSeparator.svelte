<script lang="ts">
	import { ContextMenu } from 'bits-ui';
	let { class: className = '', ...restProps }: { class?: string; [key: string]: any } = $props();
</script>
<ContextMenu.Separator class="ui-ctx-sep {className}" {...restProps} />
<style>:global(.ui-ctx-sep) { height: 1px; background: var(--border); margin: 0.25rem 0; }</style>
