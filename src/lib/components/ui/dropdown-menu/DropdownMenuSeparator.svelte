<script lang="ts">
	import { DropdownMenu } from 'bits-ui';

	let { class: className = '', ...restProps }: { class?: string; [key: string]: any } = $props();
</script>

<DropdownMenu.Separator class="dropdown-separator {className}" {...restProps} />

<style>
	:global(.dropdown-separator) {
		height: 1px;
		margin: 0.35rem 0;
		background: var(--border);
	}
</style>
