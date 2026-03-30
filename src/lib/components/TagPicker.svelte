<!--
  TagPicker.svelte — Typeahead multi-select with chip display
  Uses Combobox from bits-ui for the dropdown, keeps chip display from _tags.scss

  Usage:
    <TagPicker
      label="Platform"
      placeholder="Type a platform..."
      items={platforms}
      bind:selected={selectedPlatforms}
    />
-->
<script lang="ts">
	import type { TagItem } from '$lib/utils/filters';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

	interface Props {
		label?: string;
		placeholder?: string;
		items: TagItem[];
		selected?: Set<string>;
		ariaLabel?: string;
	}

	let {
		label = '',
		placeholder = 'Type to search...',
		items = [],
		selected = $bindable(new Set<string>()),
		ariaLabel = placeholder
	}: Props = $props();

	let inputValue = $state('');
	let filterText = $state('');

	const lo = (s: string) => s.trim().toLowerCase();

	let filtered = $derived.by(() => {
		const available = items.filter((item) => !selected.has(lo(item.id)));
		const q = lo(filterText);
		if (!q) return available.slice(0, 30);
		return available
			.filter((item) => {
				if (lo(item.label).includes(q) || lo(item.id).includes(q)) return true;
				return item.aliases?.some((a) => lo(a).includes(q)) ?? false;
			})
			.slice(0, 30);
	});

	let selectedItems = $derived(
		Array.from(selected).map((id) => {
			const item = items.find((i) => lo(i.id) === id);
			return { id, label: item?.label ?? id };
		})
	);

	function remove(id: string) {
		selected.delete(id);
		selected = new Set(selected);
	}
</script>

<div class="tag-picker">
	{#if label}
		<div class="tag-picker__label muted">{label}</div>
	{/if}

	{#if selectedItems.length > 0}
		<div class="tag-picked">
			{#each selectedItems as chip (chip.id)}
				<button
					type="button"
					class="tag-chip is-active"
					onclick={() => remove(chip.id)}
					aria-label="Remove {chip.label}"
				>
					{chip.label} ×
				</button>
			{/each}
		</div>
	{/if}

	<div class="tag-picker__input-wrap">
		<Combobox.Root
			class="tag-picker__combobox"
			bind:inputValue
			onInputValueChange={(v: string) => { filterText = v; }}
			onValueChange={(v: string) => {
				if (v) {
					selected.add(lo(v));
					selected = new Set(selected);
					inputValue = '';
					filterText = '';
				}
			}}
			onOpenChange={(o: boolean) => { if (!o) filterText = ''; }}
		>
			<Combobox.Input {placeholder} aria-label={ariaLabel} />
			<Combobox.Content>
				{#each filtered as item (item.id)}
					<Combobox.Item value={item.id} label={item.label} forceMount>{item.label}</Combobox.Item>
				{/each}
				{#if filtered.length === 0}
					<div class="tag-picker__empty muted">
						{items.filter(i => !selected.has(lo(i.id))).length === 0 ? 'All options selected.' : 'No matches.'}
					</div>
				{/if}
			</Combobox.Content>
		</Combobox.Root>
	</div>
</div>

<style>
	.tag-picker {
		position: relative;
	}

	.tag-picker__label {
		font-size: 0.85rem;
		margin-bottom: 0.35rem;
		font-weight: 500;
	}

	.tag-picker__input-wrap {
		position: relative;
	}

	/* Override the global .filter max-width inside tag pickers */
	.tag-picker__input-wrap :global(.ui-combobox-input) {
		max-width: 100%;
	}

	.tag-picker__empty {
		padding: 0.75rem;
		font-size: 0.85rem;
		text-align: center;
	}
</style>
