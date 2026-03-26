<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	type Tab = {
		value: string;
		label: string;
		count: number;
	};

	let {
		tabs,
		value = $bindable(),
	}: {
		tabs: Tab[];
		value: string;
	} = $props();
</script>

<ToggleGroup.Root class="filter-tabs" bind:value>
	{#each tabs as tab (tab.value)}
		<ToggleGroup.Item value={tab.value}>
			{tab.label}
			<span class="filter-tab__count">{tab.count}</span>
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
