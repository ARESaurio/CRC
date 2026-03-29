<script lang="ts">
	import { formatDate } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Search } from 'lucide-svelte';

	let { data } = $props();
	const game = $derived(data.game);
	const history = $derived(data.history || []);
	const changelog = $derived(data.changelog || []);

	let expandedVersions = $state<Record<string, boolean>>({});
	let filterCategory = $state('all');
	let searchInput = $state('');
	let searchQuery = $state('');

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
		kind: 'changelog' | 'activity';
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
		}

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			items = items.filter(i => {
				const text = [i.summary, i.note, i.target, i.editor, i.by, i.action].filter(Boolean).join(' ').toLowerCase();
				return text.includes(q);
			});
		}

		return items;
	});

	const changelogCount = $derived(mergedTimeline.filter(i => i.kind === 'changelog').length);
	const editCount = $derived(mergedTimeline.filter(i => i.kind === 'activity' && (i.action?.startsWith('game_') || i.action === 'proposal_merged' || i.action === 'approval_requested')).length);
	const runCount = $derived(mergedTimeline.filter(i => i.kind === 'activity' && i.action?.startsWith('run_')).length);
	const staffCount = $derived(mergedTimeline.filter(i => i.kind === 'activity' && ['gm_added', 'game_approved', 'game_finalized'].includes(i.action || '')).length);

	// ── Diff types ──────────────────────────────────────────────
	type DiffLine = {
		type: 'added' | 'removed' | 'modified' | 'unchanged';
		field: string;
		label: string;
		detail?: string;
		oldValue?: string;
		newValue?: string;
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
					if (!oldVal && newVal) {
						lines.push({ type: 'added', field: key, label: fieldLabel, detail: truncate(newVal, 120) });
					} else if (oldVal && !newVal) {
						lines.push({ type: 'removed', field: key, label: fieldLabel, detail: truncate(oldVal, 120) });
					} else {
						lines.push({ type: 'modified', field: key, label: fieldLabel, oldValue: truncate(oldVal, 120), newValue: truncate(newVal, 120) });
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
				{#each filteredTimeline as entry, i (entry.kind === 'changelog' ? `cl-${entry.id}` : `act-${i}`)}
					{#if entry.kind === 'changelog'}
						<!-- Rules changelog entry — expandable diff card -->
						{@const diffLines = computeDiff(entry.oldRules, entry.newRules)}
						<Collapsible.Root class="cl-card" open={expandedVersions[entry.id || ''] || false} onOpenChange={(o: boolean) => { expandedVersions = { ...expandedVersions, [entry.id || '']: o }; }}>
							<Collapsible.Trigger class="cl-header">
								<div class="cl-header__left">
									<span class="cl-arrow">▸</span>
									<span class="cl-version">v{entry.version}</span>
									<span class="cl-summary">{entry.summary}</span>
								</div>
								<div class="cl-header__right">
									<span class="cl-editor">{entry.editor}</span>
									<span class="cl-sep">·</span>
									<time class="cl-date">{formatDate(entry.date)}</time>
								</div>
							</Collapsible.Trigger>

							<Collapsible.Content>
								<div class="cl-body">
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
											{#each diffLines as line}
												<div class="cl-diff__line cl-diff__line--{line.type}">
													<span class="cl-diff__icon">
														{#if line.type === 'added'}+{:else if line.type === 'removed'}−{:else if line.type === 'modified'}~{:else}&nbsp;{/if}
													</span>
													<span class="cl-diff__text">
														{#if line.type === 'unchanged'}
															<span class="cl-diff__muted">{line.detail}</span>
														{:else if line.oldValue && line.newValue}
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
													</span>
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
								</div>
							</Collapsible.Content>
						</Collapsible.Root>
					{:else}
						<!-- Activity log entry — compact inline card -->
						<div class="activity-card">
							<span class="activity-card__icon">{ACTION_ICONS[entry.action || ''] || '📝'}</span>
							<div class="activity-card__content">
								<div class="activity-card__action">
									<span class="activity-card__verb">{ACTION_LABELS[entry.action || ''] || entry.action}</span>
									{#if entry.target}
										<span class="activity-card__target">— {SECTION_LABELS[entry.target] || entry.target}</span>
									{/if}
								</div>
								{#if entry.note}
									<p class="activity-card__note">{entry.note}</p>
								{/if}
							</div>
							<div class="activity-card__meta">
								{#if entry.by}<span class="activity-card__by">{entry.by}</span><span class="cl-sep">·</span>{/if}
								<time>{formatDate(entry.date)}</time>
							</div>
						</div>
					{/if}
				{/each}
			</div>

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

	/* ── Activity cards ──────────────────────────────────────── */
	.activity-card {
		display: flex; align-items: flex-start; gap: 0.65rem;
		padding: 0.6rem 0.85rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 8px;
	}
	.activity-card__icon { font-size: 1rem; flex-shrink: 0; margin-top: 0.1rem; }
	.activity-card__content { flex: 1; min-width: 0; }
	.activity-card__verb { font-weight: 600; font-size: 0.9rem; }
	.activity-card__target { font-size: 0.9rem; color: var(--muted); }
	.activity-card__note { font-size: 0.85rem; color: var(--muted); margin: 0.15rem 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.activity-card__meta {
		display: flex; align-items: center; gap: 0.35rem;
		font-size: 0.8rem; color: var(--muted); flex-shrink: 0; white-space: nowrap;
	}
	.activity-card__by { font-weight: 500; }

	.muted { opacity: 0.6; }

	@media (max-width: 600px) {
		.history-page { padding: 0; }
		.filters__row { flex-direction: column; align-items: stretch; }
		.filters__search { max-width: none; }
		:global(.cl-header) { flex-direction: column; align-items: flex-start; gap: 0.35rem; }
		:global(.cl-header__right) { font-size: 0.75rem; }
		.activity-card { flex-direction: column; gap: 0.35rem; }
		.activity-card__meta { font-size: 0.75rem; }
	}
</style>
