<script lang="ts">
	import { Menubar } from 'bits-ui';
	let { class: className = '', ...restProps }: { class?: string; [key: string]: any } = $props();
</script>
<Menubar.Separator class="ui-menubar__sep {className}" {...restProps} />
<style>:global(.ui-menubar__sep) { height: 1px; background: var(--border); margin: 0.25rem 0; }</style>
