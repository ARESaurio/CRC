<script lang="ts">
	import { formatDate } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import { Search, Newspaper } from 'lucide-svelte';
	import { localizeHref } from '$lib/paraglide/runtime';

	let { data } = $props();
	const game = $derived(data.game);
	const history = $derived(data.history || []);
	const changelog = $derived(data.changelog || []);
	const gameNews = $derived(data.gameNews || []);

	const PAGE_SIZE = 20;
	let expandedVersions = $state<Record<string, boolean>>({});
	let expandedDiffs = $state<Record<string, boolean>>({});
	let filterCategory = $state('all');
	let searchInput = $state('');
	let searchQuery = $state('');
	let currentPage = $state(1);

	// Debounce search
	$effect(() => {
		const value = searchInput;
		if (!value) { searchQuery = ''; return; }
		const timer = setTimeout(() => { searchQuery = value; }, 300);
		return () => clearTimeout(timer);
	});

	// ── Section / action labels ───────────────────────────────────
	const SECTION_LABELS: Record<string, string> = {
		categories: 'Categories', challenges: 'Challenges', restrictions: 'Restrictions',
		rules: 'Rules', general: 'General', characters: 'Characters',
		difficulties: 'Difficulties', achievements: 'Achievements', additional_tabs: 'Custom Tabs',
	};

	const ACTION_LABELS: Record<string, string> = {
		game_edited: 'Game edited', game_frozen: 'Game frozen', game_unfrozen: 'Game unfrozen',
		game_rollback: 'Game rolled back', game_created: 'Game created', game_deleted: 'Game deleted',
		game_reimport: 'Re-imported from submission', game_approved: 'Game approved',
		game_finalized: 'Game finalized', run_approved: 'Run approved',
		run_rejected: 'Run rejected', run_changes_requested: 'Run changes requested',
		gm_added: 'Staff assigned', proposal_merged: 'Proposal merged',
		approval_requested: 'Approval requested',
	};

	const ACTION_ICONS: Record<string, string> = {
		game_edited: '✏️', game_frozen: '🔒', game_unfrozen: '🔓',
		game_rollback: '🔄', game_created: '🎮', game_deleted: '🗑️',
		game_reimport: '📥', game_approved: '✅', game_finalized: '🏁',
		run_approved: '📋', run_rejected: '❌', run_changes_requested: '✏️',
		gm_added: '👤', proposal_merged: '🤝', approval_requested: '🔔',
	};

	// ── Field labels for diffing ─────────────────────────────────
	const FIELD_LABELS: Record<string, string> = {
		full_runs: 'Full run', mini_challenges: 'Mini-challenge', player_made: 'Player-made',
		challenges_data: 'Challenge', restrictions_data: 'Restriction', glitches_data: 'Glitch',
		characters_data: 'Character', difficulties_data: 'Difficulty',
		general_rules: 'General rules', nmg_rules: 'NMG rules',
		character_column: 'Character column', difficulty_column: 'Difficulty column',
		glitch_doc_links: 'Glitch doc links', rules_version: 'Rules version',
	};

	// ── Sections treated as rules (have changelog entries) ───────
	const RULES_SECTIONS = ['rules', 'challenges', 'restrictions', 'categories'];

	// ── Merge timeline ──────────────────────────────────────────
	type TimelineEntry = {
		kind: 'changelog' | 'activity' | 'news';
		date: string;
		id?: string;
		version?: number;
		summary?: string;
		sections?: string[];
		oldRules?: any;
		newRules?: any;
		editor?: string;
		action?: string;
		target?: string;
		note?: string;
		by?: string;
		// News-specific
		newsSlug?: string;
		newsTitle?: string;
		newsAuthor?: string;
		newsCategories?: string[];
	};

	const mergedTimeline = $derived.by((): TimelineEntry[] => {
		const items: TimelineEntry[] = [];

		for (const entry of changelog) {
			items.push({ kind: 'changelog', ...entry });
		}

		for (const entry of history) {
			// Skip game_edited for rules sections — those are already in the changelog with diffs
			if (entry.action === 'game_edited' && RULES_SECTIONS.includes(entry.target)) continue;
			items.push({ kind: 'activity', ...entry });
		}

		for (const entry of gameNews) {
			items.push({
				kind: 'news',
				date: entry.date,
				newsSlug: entry.slug,
				newsTitle: entry.title,
				newsAuthor: entry.author ?? undefined,
				newsCategories: entry.categories,
			});
		}

		items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
		return items;
	});

	// ── Filtering ───────────────────────────────────────────────
	const filteredTimeline = $derived.by(() => {
		let items = mergedTimeline;

		if (filterCategory === 'rules') {
			items = items.filter(i => i.kind === 'changelog');
		} else if (filterCategory === 'edits') {
			items = items.filter(i => i.kind === 'activity' && (i.action?.startsWith('game_') || i.action === 'proposal_merged' || i.action === 'approval_requested'));
		} else if (filterCategory === 'runs') {
			items = items.filter(i => i.kind === 'activity' && i.action?.startsWith('run_'));
		} else if (filterCategory === 'staff') {
			items = items.filter(i => i.kind === 'activity' && ['gm_added', 'game_approved', 'game_finalized'].includes(i.action || ''));
		} else if (filterCategory === 'news') {
			items = items.filter(i => i.kind === 'news');
		}

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			items = items.filter(i => {
				const text = [i.summary, i.note, i.target, i.editor, i.by, i.action, i.newsTitle, i.newsAuthor].filter(Boolean).join(' ').toLowerCase();
				return text.includes(q);
			});
		}

		return items;
	});

	const changelogCount = $derived(mergedTimeline.filter(i => i.kind === 'changelog').length);
	const editCount = $derived(mergedTimeline.filter(i => i.kind === 'activity' && (i.action?.startsWith('game_') || i.action === 'proposal_merged' || i.action === 'approval_requested')).length);
	const runCount = $derived(mergedTimeline.filter(i => i.kind === 'activity' && i.action?.startsWith('run_')).length);
	const staffCount = $derived(mergedTimeline.filter(i => i.kind === 'activity' && ['gm_added', 'game_approved', 'game_finalized'].includes(i.action || '')).length);
	const newsCount = $derived(mergedTimeline.filter(i => i.kind === 'news').length);

	// Pagination
	const totalPages = $derived(Math.ceil(filteredTimeline.length / PAGE_SIZE) || 1);
	const pageItems = $derived(filteredTimeline.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

	// Reset page when filters change
	$effect(() => {
		filterCategory; searchQuery;
		currentPage = 1;
	});

	function toggleDiffExpand(key: string) {
		expandedDiffs = { ...expandedDiffs, [key]: !expandedDiffs[key] };
	}

	// ── Diff types ──────────────────────────────────────────────
	type DiffLine = {
		type: 'added' | 'removed' | 'modified' | 'unchanged';
		field: string;
		label: string;
		detail?: string;
		oldValue?: string;
		newValue?: string;
		fullOldValue?: string;
		fullNewValue?: string;
		isLong?: boolean;
	};

	function computeDiff(oldRules: any, newRules: any): DiffLine[] {
		const lines: DiffLine[] = [];
		const allKeys = new Set([...Object.keys(oldRules || {}), ...Object.keys(newRules || {})]);

		for (const key of allKeys) {
			if (key === 'rules_version') continue;
			const oldVal = oldRules?.[key];
			const newVal = newRules?.[key];
			const fieldLabel = FIELD_LABELS[key] || key.replace(/_/g, ' ');

			if (Array.isArray(oldVal) || Array.isArray(newVal)) {
				lines.push(...diffArrayBySlugs(oldVal || [], newVal || [], fieldLabel, key));
			} else if (typeof oldVal === 'string' || typeof newVal === 'string') {
				if (oldVal !== newVal) {
					const isLong = (oldVal || '').length > 80 || (newVal || '').length > 80;
					if (!oldVal && newVal) {
						lines.push({ type: 'added', field: key, label: fieldLabel, detail: truncate(newVal, 120), fullNewValue: newVal, isLong });
					} else if (oldVal && !newVal) {
						lines.push({ type: 'removed', field: key, label: fieldLabel, detail: truncate(oldVal, 120), fullOldValue: oldVal, isLong });
					} else {
						lines.push({ type: 'modified', field: key, label: fieldLabel, oldValue: truncate(oldVal, 120), newValue: truncate(newVal, 120), fullOldValue: oldVal, fullNewValue: newVal, isLong });
					}
				}
			} else if (typeof oldVal === 'object' && typeof newVal === 'object' && oldVal && newVal) {
				if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
					const changes: string[] = [];
					if (oldVal.enabled !== newVal.enabled) changes.push(newVal.enabled ? 'enabled' : 'disabled');
					if (oldVal.label !== newVal.label) {
						lines.push({ type: 'modified', field: key, label: fieldLabel, oldValue: oldVal.label, newValue: newVal.label });
					} else if (changes.length > 0) {
						lines.push({ type: 'modified', field: key, label: fieldLabel, detail: changes.join(', ') });
					}
				}
			}
		}
		return lines;
	}

	function diffArrayBySlugs(oldArr: any[], newArr: any[], fieldLabel: string, key: string): DiffLine[] {
		const lines: DiffLine[] = [];

		const flattenItem = (item: any, parentLabel?: string): { slug: string; label: string; description?: string; exceptions?: string }[] => {
			const items: any[] = [];
			const lbl = parentLabel ? `${parentLabel} › ${item.label || item.slug}` : (item.label || item.slug);
			items.push({ slug: item.slug, label: lbl, description: item.description, exceptions: item.exceptions });
			if (Array.isArray(item.children)) {
				for (const child of item.children) items.push(...flattenItem(child, lbl));
			}
			return items;
		};

		const flatOld = oldArr.flatMap(i => typeof i === 'string' ? [{ slug: i, label: i }] : flattenItem(i));
		const flatNew = newArr.flatMap(i => typeof i === 'string' ? [{ slug: i, label: i }] : flattenItem(i));
		const oldMap = new Map(flatOld.map(i => [i.slug, i]));
		const newMap = new Map(flatNew.map(i => [i.slug, i]));

		for (const [slug, item] of newMap) {
			if (!oldMap.has(slug)) {
				lines.push({ type: 'added', field: key, label: fieldLabel, detail: item.label || slug });
			}
		}
		for (const [slug, item] of oldMap) {
			if (!newMap.has(slug)) {
				lines.push({ type: 'removed', field: key, label: fieldLabel, detail: item.label || slug });
			}
		}
		let unchangedCount = 0;
		for (const [slug, newItem] of newMap) {
			const oldItem = oldMap.get(slug);
			if (!oldItem) continue;
			const changes: DiffLine[] = [];
			if (oldItem.label !== newItem.label) {
				changes.push({ type: 'modified', field: key, label: fieldLabel, oldValue: oldItem.label, newValue: newItem.label });
			}
			if ((oldItem.description || '') !== (newItem.description || '')) {
				changes.push({ type: 'modified', field: key, label: `${fieldLabel} description`, oldValue: truncate(oldItem.description || '(empty)', 80), newValue: truncate(newItem.description || '(empty)', 80) });
			}
			if ((oldItem.exceptions || '') !== (newItem.exceptions || '')) {
				changes.push({ type: 'modified', field: key, label: `${fieldLabel} exceptions`, oldValue: truncate(oldItem.exceptions || '(empty)', 80), newValue: truncate(newItem.exceptions || '(empty)', 80) });
			}
			if (changes.length > 0) {
				lines.push(...changes);
			} else {
				unchangedCount++;
			}
		}
		if (unchangedCount > 0) {
			lines.push({ type: 'unchanged', field: key, label: fieldLabel, detail: `${unchangedCount} ${fieldLabel.toLowerCase()}${unchangedCount > 1 ? 's' : ''} unchanged` });
		}
		return lines;
	}

	function truncate(s: string, len: number): string {
		if (!s) return '';
		return s.length > len ? s.slice(0, len) + '…' : s;
	}
</script>

<svelte:head>
	<title>{m.game_history_title({ name: game.game_name })}</title>
</svelte:head>

<div class="history-page">
	<!-- Community Milestones -->
	<section class="history-section">
		<h2>{m.game_history_milestones()}</h2>
		<p class="muted">{m.game_history_milestones_desc()}</p>

		<div class="empty-state">
			<p class="muted">{m.game_history_milestones_soon()}</p>
		</div>
	</section>

	<!-- Game Changelog (merged Rules Changelog + Activity Log) -->
	<section class="history-section">
		<h2>Game Changelog</h2>
		<p class="muted">All changes to rules, categories, game settings, and activity — with full version diffs.</p>

		<!-- Filters -->
		<div class="filters">
			<div class="filters__row">
				<ToggleGroup.Root class="filter-tabs" bind:value={filterCategory}>
					<ToggleGroup.Item value="all">All <span class="filter-count">{mergedTimeline.length}</span></ToggleGroup.Item>
					{#if changelogCount > 0}<ToggleGroup.Item value="rules">Rules <span class="filter-count">{changelogCount}</span></ToggleGroup.Item>{/if}
					{#if editCount > 0}<ToggleGroup.Item value="edits">Game <span class="filter-count">{editCount}</span></ToggleGroup.Item>{/if}
					{#if runCount > 0}<ToggleGroup.Item value="runs">Runs <span class="filter-count">{runCount}</span></ToggleGroup.Item>{/if}
					{#if staffCount > 0}<ToggleGroup.Item value="staff">Staff <span class="filter-count">{staffCount}</span></ToggleGroup.Item>{/if}
					{#if newsCount > 0}<ToggleGroup.Item value="news">News <span class="filter-count">{newsCount}</span></ToggleGroup.Item>{/if}
				</ToggleGroup.Root>
				<div class="filters__search">
					<Search size={14} />
					<input type="text" bind:value={searchInput} placeholder="Search changes..." />
				</div>
			</div>
		</div>

		{#if mergedTimeline.length === 0}
			<div class="empty-state">
				<p class="muted">No changes have been recorded yet.</p>
			</div>
		{:else if filteredTimeline.length === 0}
			<div class="empty-state">
				<p class="muted">No results matching your filters.</p>
			</div>
		{:else}
			<div class="changelog">
				{#each pageItems as entry, i (entry.kind === 'changelog' ? `cl-${entry.id}` : entry.kind === 'news' ? `news-${entry.newsSlug}` : `act-${i}`)}
					{@const entryKey = entry.kind === 'changelog' ? (entry.id || `cl-${i}`) : entry.kind === 'news' ? `news-${i}` : `act-${i}`}
					{@const diffLines = entry.kind === 'changelog' ? computeDiff(entry.oldRules, entry.newRules) : []}
					{@const hasExpandable = entry.kind === 'changelog' || !!entry.note}
					{#if entry.kind === 'news'}
						<!-- News post entry -->
						<a class="cl-card cl-card--static cl-card--news" href={localizeHref(`/news/${entry.newsSlug}`)}>
							<div class="cl-header cl-header--static">
								<div class="cl-header__left">
									<span class="cl-badge cl-badge--news"><Newspaper size={12} /> News</span>
									<span class="cl-summary">{entry.newsTitle}</span>
								</div>
								<div class="cl-header__right">
									{#if entry.newsAuthor}<span class="cl-editor">{entry.newsAuthor}</span><span class="cl-sep">·</span>{/if}
									<time class="cl-date">{formatDate(entry.date)}</time>
								</div>
							</div>
						</a>
					{:else if hasExpandable}
						<Collapsible.Root class="cl-card" open={expandedVersions[entryKey] || false} onOpenChange={(o: boolean) => { expandedVersions = { ...expandedVersions, [entryKey]: o }; }}>
							<Collapsible.Trigger class="cl-header">
								<div class="cl-header__left">
									<span class="cl-arrow">▸</span>
									{#if entry.kind === 'changelog'}
										<span class="cl-version">v{entry.version}</span>
									{:else}
										<span class="cl-badge">{ACTION_ICONS[entry.action || ''] || '📝'} {SECTION_LABELS[entry.target || ''] || ACTION_LABELS[entry.action || ''] || entry.action}</span>
									{/if}
									<span class="cl-summary">{entry.summary || entry.note || ACTION_LABELS[entry.action || ''] || entry.action}</span>
								</div>
								<div class="cl-header__right">
									<span class="cl-editor">{entry.editor || entry.by || ''}</span>
									{#if entry.editor || entry.by}<span class="cl-sep">·</span>{/if}
									<time class="cl-date">{formatDate(entry.date)}</time>
								</div>
							</Collapsible.Trigger>

							<Collapsible.Content>
								<div class="cl-body">
									{#if entry.kind === 'changelog'}
										{#if entry.sections && entry.sections.length > 0}
											<div class="cl-sections">
												<span class="cl-sections__label">Sections changed</span>
												<div class="cl-sections__tags">
													{#each entry.sections as section}
														<span class="cl-tag">{SECTION_LABELS[section] || section}</span>
													{/each}
												</div>
											</div>
										{/if}

										{#if diffLines.length > 0}
											<div class="cl-diff">
												{#each diffLines as line, li}
													{@const diffKey = `${entryKey}-${line.field}-${li}`}
													{@const isExpanded = expandedDiffs[diffKey] || false}
													<div class="cl-diff__line cl-diff__line--{line.type}" class:cl-diff__line--block={line.isLong && line.type === 'modified'}>
														<span class="cl-diff__icon">
															{#if line.type === 'added'}+{:else if line.type === 'removed'}−{:else if line.type === 'modified'}~{:else}&nbsp;{/if}
														</span>
														<div class="cl-diff__text">
															{#if line.type === 'unchanged'}
																<span class="cl-diff__muted">{line.detail}</span>
															{:else if line.oldValue && line.newValue && line.isLong}
																<!-- Long text: before/after on separate lines, expandable -->
																<span class="cl-diff__field">{line.label}</span>
																<button class="cl-diff__toggle" onclick={() => toggleDiffExpand(diffKey)}>
																	{isExpanded ? '▾ Hide changes' : '▸ Show changes'}
																</button>
																{#if isExpanded}
																	<div class="cl-diff__block">
																		<div class="cl-diff__block-row cl-diff__block-row--old">
																			<span class="cl-diff__block-label">Before</span>
																			<span class="cl-diff__block-text">{line.fullOldValue}</span>
																		</div>
																		<div class="cl-diff__block-row cl-diff__block-row--new">
																			<span class="cl-diff__block-label">After</span>
																			<span class="cl-diff__block-text">{line.fullNewValue}</span>
																		</div>
																	</div>
																{/if}
															{:else if line.oldValue && line.newValue}
																<!-- Short text: inline before → after -->
																<span class="cl-diff__field">{line.label}:</span>
																<span class="cl-diff__old">{line.oldValue}</span>
																<span class="cl-diff__arrow">→</span>
																<span class="cl-diff__new">{line.newValue}</span>
															{:else}
																<span class="cl-diff__field">{line.label}:</span>
																{#if line.detail}
																	<span class:cl-diff__strike={line.type === 'removed'}>{line.detail}</span>
																{/if}
															{/if}
														</div>
													</div>
												{/each}
											</div>
										{:else}
											<p class="muted" style="font-size: 0.85rem;">No structural differences detected in this version.</p>
										{/if}

										{#if entry.summary && entry.sections && entry.summary !== `${entry.sections[0]} updated`}
											<div class="cl-reason">
												<span class="cl-reason__label">Reason</span>
												<p class="cl-reason__text">{entry.summary}</p>
											</div>
										{/if}
									{:else}
										<!-- Activity detail -->
										{#if entry.target}
											<div class="cl-sections">
												<span class="cl-sections__label">Section</span>
												<div class="cl-sections__tags">
													<span class="cl-tag">{SECTION_LABELS[entry.target] || entry.target}</span>
												</div>
											</div>
										{/if}
										{#if entry.note}
											<div class="cl-reason">
												<span class="cl-reason__label">Details</span>
												<p class="cl-reason__text">{entry.note}</p>
											</div>
										{/if}
									{/if}
								</div>
							</Collapsible.Content>
						</Collapsible.Root>
					{:else}
						<!-- Non-expandable entry (no note or diff) -->
						<div class="cl-card cl-card--static">
							<div class="cl-header cl-header--static">
								<div class="cl-header__left">
									<span class="cl-badge">{ACTION_ICONS[entry.action || ''] || '📝'} {SECTION_LABELS[entry.target || ''] || ACTION_LABELS[entry.action || ''] || entry.action}</span>
									<span class="cl-summary">{ACTION_LABELS[entry.action || ''] || entry.action}</span>
								</div>
								<div class="cl-header__right">
									<span class="cl-editor">{entry.editor || entry.by || ''}</span>
									{#if entry.editor || entry.by}<span class="cl-sep">·</span>{/if}
									<time class="cl-date">{formatDate(entry.date)}</time>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>

			{#if totalPages > 1}
				<Pagination.Root bind:page={currentPage} count={filteredTimeline.length} perPage={PAGE_SIZE} class="cl-pagination">
					<Pagination.PrevButton>← Previous</Pagination.PrevButton>
					<span class="muted" style="font-size: 0.85rem;">Page {currentPage} of {totalPages} · {filteredTimeline.length} entries</span>
					<Pagination.NextButton>Next →</Pagination.NextButton>
				</Pagination.Root>
			{/if}

			<div class="cl-note">
				Runs submitted under an older rules version show a version badge so verifiers know which ruleset applied.
			</div>
		{/if}
	</section>
</div>

<style>
	.history-page { max-width: 800px; }

	.history-section { margin-bottom: 2.5rem; }
	.history-section h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
	.history-section > .muted { margin: 0 0 1rem; font-size: 0.9rem; }

	.empty-state {
		padding: 1.5rem; text-align: center;
		border: 1px dashed var(--border); border-radius: 8px;
	}

	/* ── Filters ──────────────────────────────────────────────── */
	.filters { margin-bottom: 1rem; }
	.filters__row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

	:global(.filter-tabs.ui-toggle-group) { display: flex; flex-wrap: wrap; gap: 0.25rem; border: none; border-radius: 0; overflow: visible; }
	:global(.filter-tabs .ui-toggle-group-item) { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.35rem 0.65rem; font-size: 0.8rem; color: var(--muted); }
	:global(.filter-tabs .ui-toggle-group-item:hover) { border-color: var(--fg); color: var(--fg); }
	:global(.filter-tabs .ui-toggle-group-item[data-state="on"]) { background: var(--accent); color: white; border-color: var(--accent); }

	.filter-count {
		display: inline-block; background: rgba(255,255,255,0.2);
		padding: 0 5px; border-radius: 8px; font-size: 0.7rem; font-weight: 700; margin-left: 3px;
	}

	.filters__search {
		display: flex; align-items: center; gap: 0.4rem;
		padding: 0.3rem 0.6rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 6px;
		flex: 1; min-width: 160px; max-width: 280px; color: var(--muted);
	}
	.filters__search input {
		border: none; background: none; color: var(--fg);
		font-size: 0.85rem; font-family: inherit; outline: none; width: 100%;
	}
	.filters__search:focus-within { border-color: var(--accent); }

	/* ── Changelog list ──────────────────────────────────────── */
	.changelog { display: flex; flex-direction: column; gap: 0.5rem; }

	/* ── Rules Changelog cards ───────────────────────────────── */
	:global(.cl-card) {
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 8px; overflow: hidden;
	}
	:global(.cl-card[data-state="open"]) { border-color: var(--accent); }

	:global(.cl-header) {
		display: flex; align-items: center; justify-content: space-between;
		width: 100%; padding: 0.65rem 0.85rem; gap: 0.5rem;
		background: none; border: none; cursor: pointer;
		font-family: inherit; font-size: inherit; color: inherit; text-align: left;
	}
	:global(.cl-header:hover) { background: rgba(255, 255, 255, 0.03); }

	:global(.cl-header__left) { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
	:global(.cl-header__right) { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--muted); flex-shrink: 0; }

	.cl-arrow { font-size: 0.75rem; color: var(--muted); width: 0.85rem; flex-shrink: 0; transition: transform 0.15s; }
	:global(.cl-header[data-state="open"]) .cl-arrow { transform: rotate(90deg); }
	.cl-version {
		font-size: 0.8rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 4px;
		background: rgba(99, 102, 241, 0.12); color: var(--accent); flex-shrink: 0;
	}
	.cl-summary { font-size: 0.9rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cl-editor { font-weight: 500; }
	.cl-sep { opacity: 0.4; }

	.cl-body {
		border-top: 1px solid var(--border); padding: 0.85rem;
		display: flex; flex-direction: column; gap: 0.75rem;
	}

	.cl-sections__label {
		font-size: 0.75rem; font-weight: 600; color: var(--muted);
		text-transform: uppercase; letter-spacing: 0.04em;
	}
	.cl-sections__tags { display: flex; gap: 0.35rem; margin-top: 0.25rem; flex-wrap: wrap; }
	.cl-tag {
		font-size: 0.8rem; padding: 0.1rem 0.5rem; border-radius: 4px;
		background: var(--panel); color: var(--muted); border: 1px solid var(--border);
	}

	/* Diff lines */
	.cl-diff {
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.82rem; line-height: 1.75;
		border: 1px solid var(--border); border-radius: 6px; overflow: hidden;
	}

	.cl-diff__line {
		display: flex; align-items: flex-start; gap: 0.5rem;
		padding: 0.2rem 0.65rem;
	}
	.cl-diff__line--added { background: rgba(34, 197, 94, 0.06); color: #22c55e; }
	.cl-diff__line--removed { background: rgba(239, 68, 68, 0.06); color: #ef4444; }
	.cl-diff__line--modified { background: rgba(245, 158, 11, 0.06); color: #f59e0b; }
	.cl-diff__line--unchanged { color: var(--muted); }

	.cl-diff__icon { opacity: 0.5; flex-shrink: 0; width: 1rem; text-align: center; }
	.cl-diff__text { min-width: 0; }
	.cl-diff__field { font-weight: 600; margin-right: 0.25rem; }
	.cl-diff__strike { text-decoration: line-through; opacity: 0.7; }
	.cl-diff__muted { opacity: 0.5; font-style: italic; }

	.cl-diff__old { text-decoration: line-through; opacity: 0.7; }
	.cl-diff__arrow { margin: 0 0.35rem; opacity: 0.5; }
	.cl-diff__new { font-weight: 600; }

	/* Expandable diff toggle */
	.cl-diff__toggle {
		display: inline-block; margin-left: 0.35rem;
		background: none; border: none; cursor: pointer;
		color: var(--accent); font-size: 0.8rem; font-family: inherit;
		padding: 0; text-decoration: none;
	}
	.cl-diff__toggle:hover { text-decoration: underline; }

	/* Block diff (before/after on separate lines) */
	.cl-diff__line--block { flex-direction: column; align-items: flex-start; }
	.cl-diff__block {
		display: flex; flex-direction: column; gap: 0.35rem;
		margin-top: 0.4rem; width: 100%; padding-left: 1.5rem;
	}
	.cl-diff__block-row {
		padding: 0.4rem 0.6rem; border-radius: 4px;
		font-size: 0.8rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
	}
	.cl-diff__block-row--old { background: rgba(239, 68, 68, 0.06); border-left: 3px solid rgba(239, 68, 68, 0.4); }
	.cl-diff__block-row--new { background: rgba(34, 197, 94, 0.06); border-left: 3px solid rgba(34, 197, 94, 0.4); }
	.cl-diff__block-label {
		display: block; font-size: 0.7rem; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.04em;
		margin-bottom: 0.15rem; opacity: 0.7;
	}
	.cl-diff__block-text { display: block; }

	/* Pagination */
	:global(.cl-pagination.ui-pagination) {
		display: flex; justify-content: center; align-items: center;
		gap: 1rem; margin-top: 1rem; padding: 0.75rem;
	}

	/* Reason block */
	.cl-reason {
		padding: 0.5rem 0.65rem; background: var(--panel);
		border-radius: 6px; border: 1px solid var(--border);
	}
	.cl-reason__label {
		font-size: 0.75rem; font-weight: 600; color: var(--muted);
		text-transform: uppercase; letter-spacing: 0.04em;
	}
	.cl-reason__text { margin: 0.25rem 0 0; font-size: 0.85rem; }

	.cl-note {
		margin-top: 0.75rem; padding: 0.6rem 0.85rem;
		background: var(--panel); border-radius: 6px;
		font-size: 0.82rem; color: var(--muted);
	}

	/* ── Activity badge (replaces version badge for non-changelog entries) ── */
	.cl-badge {
		font-size: 0.8rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 4px;
		background: rgba(255, 255, 255, 0.06); color: var(--muted); flex-shrink: 0; white-space: nowrap;
	}

	/* Static (non-expandable) cards */
	.cl-card--static {
		background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
	}
	.cl-header--static {
		display: flex; align-items: center; justify-content: space-between;
		width: 100%; padding: 0.65rem 0.85rem; gap: 0.5rem;
		font-size: inherit; color: inherit; text-align: left;
	}

	/* News entry cards */
	.cl-card--news {
		text-decoration: none;
		color: inherit;
		display: block;
		border-left: 3px solid rgba(59, 195, 110, 0.4);
		transition: border-color 0.15s, background 0.15s;
	}
	.cl-card--news:hover {
		border-color: var(--accent);
		background: rgba(59, 195, 110, 0.03);
	}
	.cl-badge--news {
		background: rgba(59, 195, 110, 0.12);
		color: var(--accent);
	}

	.muted { opacity: 0.6; }

	@media (max-width: 600px) {
		.history-page { padding: 0; }
		.filters__row { flex-direction: column; align-items: stretch; }
		.filters__search { max-width: none; }
		:global(.cl-header) { flex-direction: column; align-items: flex-start; gap: 0.35rem; }
		:global(.cl-header__right) { font-size: 0.75rem; }
		.cl-header--static { flex-direction: column; align-items: flex-start; gap: 0.35rem; }
	}
</style>
