<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		href,
		children,
		...restProps
	}: { class?: string; href?: string; children?: Snippet; [key: string]: any } = $props();
</script>

{#if href}
	<a {href} class="dropdown-item {className}" role="menuitem">
		{@render children?.()}
	</a>
{:else}
	<DropdownMenu.Item class="dropdown-item {className}" {...restProps}>
		{@render children?.()}
	</DropdownMenu.Item>
{/if}

<style>
	:global(.dropdown-item) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 1rem;
		color: var(--fg);
		text-decoration: none;
		border: none;
		border-radius: 0;
		background: none;
		font-size: 0.9rem;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.1s;
	}
	:global(.dropdown-item:hover),
	:global(.dropdown-item[data-highlighted]) {
		background: var(--panel, rgba(255, 255, 255, 0.05));
		color: var(--accent);
		text-decoration: none;
	}
</style>
