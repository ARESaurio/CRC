<script lang="ts">
	import { ArrowLeft, ArrowRight} from 'lucide-svelte';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { replaceState } from '$app/navigation';

	type Tab = {
		value: string;
		label: string;
		count: number;
	};

	let {
		tabs,
		value = $bindable(),
		totalItems = 0,
		pageSize = $bindable(10),
		currentPage = $bindable(1),
		urlParam = 'tab',
	}: {
		tabs: Tab[];
		value: string;
		totalItems?: number;
		pageSize?: number;
		currentPage?: number;
		urlParam?: string;
	} = $props();

	const PAGE_SIZES = [10, 25, 50, 100];

	let totalPages = $derived(Math.max(1, Math.ceil(totalItems / pageSize)));

	// Clamp currentPage when totalPages changes
	$effect(() => {
		if (currentPage > totalPages) currentPage = totalPages;
	});

	// Sync tab to URL
	$effect(() => {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set(urlParam, value);
		replaceState(url.toString(), {});
	});

	// Read initial tab from URL on mount
	function getInitialTab(): string | null {
		if (typeof window === 'undefined') return null;
		return new URLSearchParams(window.location.search).get(urlParam);
	}

	// Set initial tab from URL if valid
	const urlTab = getInitialTab();
	if (urlTab && tabs.some(t => t.value === urlTab)) {
		value = urlTab;
	}

	function onTabChange(newValue: string) {
		value = newValue;
		currentPage = 1; // Reset to first page on tab change
	}

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) currentPage = page;
	}

	/** Visible page numbers (max 5 around current) */
	let visiblePages = $derived.by(() => {
		const pages: number[] = [];
		let start = Math.max(1, currentPage - 2);
		let end = Math.min(totalPages, start + 4);
		start = Math.max(1, end - 4);
		for (let i = start; i <= end; i++) pages.push(i);
		return pages;
	});
</script>

<div class="status-filter-tabs">
	<div class="status-filter-tabs__row">
		<ToggleGroup.Root class="filter-tabs" value={value} onValueChange={onTabChange}>
			{#each tabs as tab (tab.value)}
				<ToggleGroup.Item value={tab.value}>
					{tab.label}
					<span class="filter-tab__count">{tab.count}</span>
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</div>

	{#if totalItems > 0}
		<div class="status-filter-tabs__pagination">
			<div class="pagination__size">
				<span class="pagination__label">Show</span>
				{#each PAGE_SIZES as size}
					<button
						class="pagination__size-btn"
						class:pagination__size-btn--active={pageSize === size}
						onclick={() => { pageSize = size; currentPage = 1; }}
					>{size}</button>
				{/each}
			</div>

			{#if totalPages > 1}
				<div class="pagination__nav">
					<button class="pagination__btn" disabled={currentPage <= 1} onclick={() => goToPage(currentPage - 1)}></button>
					{#each visiblePages as p}
						<button
							class="pagination__btn"
							class:pagination__btn--active={currentPage === p}
							onclick={() => goToPage(p)}
						>{p}</button>
					{/each}
					<button class="pagination__btn" disabled={currentPage >= totalPages} onclick={() => goToPage(currentPage + 1)}><ArrowRight size={14} /></button>
				</div>
			{/if}

			<span class="pagination__info">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
		</div>
	{/if}
</div>

<style>
	.status-filter-tabs__row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
	.status-filter-tabs__pagination { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.pagination__size { display: flex; align-items: center; gap: 0.25rem; }
	.pagination__label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-right: 0.25rem; }
	.pagination__size-btn { padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; background: none; color: var(--muted); font-size: 0.8rem; cursor: pointer; font-family: inherit; }
	.pagination__size-btn:hover { border-color: var(--fg); color: var(--fg); }
	.pagination__size-btn--active { background: var(--accent); color: white; border-color: var(--accent); }
	.pagination__nav { display: flex; gap: 0.2rem; }
	.pagination__btn { padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; background: none; color: var(--fg); font-size: 0.8rem; cursor: pointer; font-family: inherit; min-width: 28px; text-align: center; }
	.pagination__btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
	.pagination__btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.pagination__btn--active { background: var(--accent); color: white; border-color: var(--accent); }
	.pagination__info { font-size: 0.8rem; color: var(--muted); margin-left: auto; }
</style>
