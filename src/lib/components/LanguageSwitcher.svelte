<script lang="ts">
	import { page } from '$app/stores';
	import { getLocale, locales, localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Globe } from 'lucide-svelte';

	const labels: Record<string, string> = { en: 'EN', es: 'ES' };
	const fullLabels: Record<string, () => string> = {
		en: () => m.language_english(),
		es: () => m.language_spanish()
	};

	let { open = $bindable(false) } = $props();
	const currentLocale = $derived(getLocale());
	const otherLocales = $derived(locales.filter(l => l !== currentLocale));
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger class="lang-toggle" aria-label={m.language_switch()}>
		<Globe size={14} /> {labels[currentLocale] || currentLocale.toUpperCase()}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content>
		{#each otherLocales as locale}
			<DropdownMenu.Item>
				<a
					href={localizeHref($page.url.pathname, { locale })}
					class="lang-option"
					onclick={() => { open = false; }}
					data-sveltekit-reload
				>
					{fullLabels[locale]?.() || locale}
				</a>
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<style>
	:global(.lang-toggle) {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 4px);
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
		color: var(--fg);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	:global(.lang-toggle:hover) { border-color: var(--accent); color: var(--accent); }
	.lang-option {
		display: block;
		padding: 0.2rem 0.25rem;
		color: var(--fg);
		text-decoration: none;
		font-size: 0.85rem;
	}
	.lang-option:hover { color: var(--accent); }
</style>
