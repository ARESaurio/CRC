<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { extractItems, type SectionId } from '../../consensus';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';

	let {
		section,
		drafts,
		game,
		onClose
	}: {
		section: SectionId;
		drafts: any[];
		game: any;
		onClose: () => void;
	} = $props();

	// Build comparison data: for each slug, show each draft's version
	const comparison = $derived.by(() => {
		// Collect all unique slugs across all drafts + current game
		const slugMap = new Map<string, {
			label: string;
			group: string;
			versions: { source: string; sourceId: string; data: any }[];
		}>();

		// Current game data
		const currentData = getCurrentData();
		const currentItems = extractItems(currentData, section);
		for (const item of currentItems) {
			if (!slugMap.has(item.slug)) {
				slugMap.set(item.slug, { label: item.label, group: item.group, versions: [] });
			}
			slugMap.get(item.slug)!.versions.push({
				source: '📋 Current (Live)',
				sourceId: '__current__',
				data: item.data
			});
		}

		// Each draft
		for (const draft of drafts) {
			const items = extractItems(draft.data, section);
			for (const item of items) {
				if (!slugMap.has(item.slug)) {
					slugMap.set(item.slug, { label: item.label, group: item.group, versions: [] });
				}
				slugMap.get(item.slug)!.versions.push({
					source: draft.display_name || 'Unknown',
					sourceId: draft.id,
					data: item.data
				});
			}

			// Mark items that exist in current but are MISSING from this draft
			for (const item of currentItems) {
				const draftItems = items.map(i => i.slug);
				if (!draftItems.includes(item.slug)) {
					const entry = slugMap.get(item.slug);
					if (entry && !entry.versions.some(v => v.sourceId === draft.id)) {
						entry.versions.push({
							source: draft.display_name || 'Unknown',
							sourceId: draft.id,
							data: null  // removed in this draft
						});
					}
				}
			}
		}

		return [...slugMap.entries()].map(([slug, data]) => ({ slug, ...data }));
	});

	let expandedSlug = $state<string | null>(null);

	function getCurrentData(): any {
		switch (section) {
			case 'categories':
				return { full_runs: game.full_runs || [], mini_challenges: game.mini_challenges || [], player_made: game.player_made || [] };
			case 'challenges':
				return { challenges_data: game.challenges_data || [], glitches_data: game.glitches_data || [] };
			case 'restrictions':
				return { restrictions_data: game.restrictions_data || [] };
			case 'characters':
				return { characters_data: game.characters_data || [] };
			case 'difficulties':
				return { difficulties_data: game.difficulties_data || [] };
			case 'achievements':
				return { community_achievements: game.community_achievements || [] };
			default:
				return {};
		}
	}

	/** Compare two values, return true if they differ */
	function differs(a: any, b: any): boolean {
		return JSON.stringify(a) !== JSON.stringify(b);
	}

	/** Get a summary of what changed */
	function getChangeSummary(item: typeof comparison[0]): string {
		const current = item.versions.find(v => v.sourceId === '__current__');
		const others = item.versions.filter(v => v.sourceId !== '__current__');
		if (!current) return 'New item (not in current game)';
		const removed = others.filter(v => v.data === null);
		const changed = others.filter(v => v.data !== null && differs(v.data, current.data));
		const same = others.filter(v => v.data !== null && !differs(v.data, current.data));
		const parts: string[] = [];
		if (changed.length) parts.push(`${changed.length} modified`);
		if (removed.length) parts.push(`${removed.length} removed`);
		if (same.length) parts.push(`${same.length} unchanged`);
		return parts.join(' · ') || 'No changes';
	}

	/** Render a field value for display */
	function displayValue(val: any): string {
		if (val === null || val === undefined || val === '') return '—';
		if (typeof val === 'boolean') return val ? 'Yes' : 'No';
		if (typeof val === 'object') return JSON.stringify(val, null, 2);
		return String(val);
	}

	/** Get comparable fields from an item */
	function getFields(data: any): [string, any][] {
		if (!data) return [];
		return Object.entries(data).filter(([key]) =>
			!['slug'].includes(key) && data[key] !== undefined
		);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<Dialog.Root open={true} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
	<Dialog.Overlay />
	<Dialog.Content class="compare-dialog">
		<Dialog.Header>
			<Dialog.Title>🔍 Compare Drafts — {section.charAt(0).toUpperCase() + section.slice(1)}</Dialog.Title>
			<Dialog.Close>&times;</Dialog.Close>
		</Dialog.Header>

		<div class="compare-modal__body">
		{#if section === 'rules' || section === 'overview'}
			{@const textKey = section === 'overview' ? 'content' : 'general_rules'}
			{@const currentText = section === 'overview' ? game.content : game.general_rules}
			<!-- Text-only: side-by-side comparison -->
			<div class="rules-compare">
				<div class="rules-compare__col">
					<h3>📋 Current (Live)</h3>
					<div class="rules-compare__content markdown-body">
						{#if currentText?.trim()}
							{@html renderMarkdown(currentText)}
						{:else}
							<p class="muted">No content defined.</p>
						{/if}
					</div>
				</div>
				{#each drafts as draft}
					<div class="rules-compare__col">
						<h3>{draft.display_name}'s Draft</h3>
						<div class="rules-compare__content markdown-body">
							{#if draft.data?.[textKey]?.trim()}
								{@html renderMarkdown(draft.data[textKey])}
							{:else}
								<p class="muted">No content.</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Item-based: per-item comparison -->
			{#if comparison.length === 0}
				<p class="muted">No items to compare.</p>
			{:else}
				<div class="item-compare-list">
					{#each comparison as item}
						{@const allSame = item.versions.length > 1 && item.versions.every(v => v.data !== null && !differs(v.data, item.versions[0].data))}

						<Collapsible.Root open={expandedSlug === item.slug} onOpenChange={(o: boolean) => { expandedSlug = o ? item.slug : null; }} class="compare-item{allSame ? ' compare-item--same' : ''}">
							<Collapsible.Trigger class="compare-item__header">
								<span class="compare-item__status">
									{#if allSame}✓{:else}⚡{/if}
								</span>
								<span class="compare-item__label">{item.label}</span>
								<span class="compare-item__slug">({item.slug})</span>
								<span class="compare-item__summary">{getChangeSummary(item)}</span>
								<span class="compare-item__toggle">{expandedSlug === item.slug ? '▾' : '▸'}</span>
							</Collapsible.Trigger>

							<Collapsible.Content class="compare-item__body">
									<div class="compare-columns">
										{#each item.versions as version}
											<div class="compare-col" class:compare-col--removed={version.data === null}>
												<h4 class="compare-col__source">
													{version.source}
													{#if version.sourceId === '__current__'}
														<span class="badge badge--current">live</span>
													{/if}
												</h4>
												{#if version.data === null}
													<p class="muted">Removed in this draft</p>
												{:else}
													<dl class="field-list">
														{#each getFields(version.data) as [key, val]}
															{@const currentVersion = item.versions.find(v => v.sourceId === '__current__')}
															{@const isDiff = currentVersion && currentVersion.data && differs(val, currentVersion.data[key])}
															<div class="field-row" class:field-row--changed={isDiff && version.sourceId !== '__current__'}>
																<dt>{key}</dt>
																<dd>{displayValue(val)}</dd>
															</div>
														{/each}
													</dl>
												{/if}
											</div>
										{/each}
									</div>
									</Collapsible.Content>
						</Collapsible.Root>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</Dialog.Content>
</Dialog.Root>

<style>
	:global(.compare-dialog) { max-width: 900px; width: 96%; max-height: 88vh; display: flex; flex-direction: column; }
	.compare-modal__body { padding: 1.25rem; overflow-y: auto; flex: 1; }

	/* Rules side-by-side */
	.rules-compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
	.rules-compare__col h3 { font-size: 0.9rem; margin: 0 0 0.5rem; color: var(--muted); }
	.rules-compare__content { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; max-height: 400px; overflow-y: auto; font-size: 0.88rem; }

	/* Item comparison list */
	.item-compare-list { display: flex; flex-direction: column; gap: 0.35rem; }
	:global(.compare-item) { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
	:global(.compare-item--same) { opacity: 0.65; }
	:global(.compare-item__header) { display: flex; align-items: center; gap: 0.4rem; width: 100%; padding: 0.5rem 0.75rem; background: var(--bg); border: none; color: var(--fg); cursor: pointer; font-family: inherit; font-size: 0.88rem; text-align: left; }
	:global(.compare-item__header:hover) { background: rgba(255,255,255,0.04); }
	.compare-item__status { font-size: 0.8rem; flex-shrink: 0; }
	.compare-item__label { font-weight: 600; }
	.compare-item__slug { color: var(--muted); font-size: 0.78rem; }
	.compare-item__summary { margin-left: auto; font-size: 0.75rem; color: var(--muted); }
	.compare-item__toggle { font-size: 0.75rem; color: var(--muted); flex-shrink: 0; }

	/* Expanded columns */
	:global(.compare-item__body) { padding: 0.75rem; border-top: 1px solid var(--border); }
	.compare-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
	.compare-col { padding: 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
	.compare-col--removed { opacity: 0.5; }
	.compare-col__source { font-size: 0.82rem; margin: 0 0 0.4rem; color: var(--muted); }
	.badge { font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 3px; vertical-align: middle; }
	.badge--current { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }

	/* Field list */
	.field-list { margin: 0; padding: 0; }
	.field-row { display: flex; gap: 0.5rem; padding: 0.2rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.82rem; }
	.field-row:last-child { border-bottom: none; }
	.field-row--changed { background: rgba(245, 158, 11, 0.08); border-radius: 3px; padding: 0.2rem 0.3rem; }
	.field-row dt { font-weight: 600; color: var(--muted); min-width: 90px; flex-shrink: 0; font-size: 0.78rem; }
	.field-row dd { margin: 0; word-break: break-word; white-space: pre-wrap; }

	.muted { color: var(--muted); }

	@media (max-width: 600px) {
		.compare-columns { grid-template-columns: 1fr; }
		.rules-compare { grid-template-columns: 1fr; }
	}
</style>
