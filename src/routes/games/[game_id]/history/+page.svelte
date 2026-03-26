<script lang="ts">
	import { formatDate } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';

	let { data } = $props();
	const game = $derived(data.game);
	const history = $derived(data.history || []);
	const changelog = $derived(data.changelog || []);
	const achievements = $derived(game.community_achievements || []);

	let expandedVersions = $state<Record<string, boolean>>({});

	// ── Section labels ───────────────────────────────────────────────
	const SECTION_LABELS: Record<string, string> = {
		categories: 'Categories',
		challenges: 'Challenges',
		restrictions: 'Restrictions',
		rules: 'Rules',
		general: 'General',
		characters: 'Characters',
		difficulties: 'Difficulties',
		achievements: 'Achievements',
		additional_tabs: 'Custom Tabs',
	};

	// ── Action labels for timeline ───────────────────────────────
	const ACTION_LABELS: Record<string, string> = {
		game_edited: 'Edited',
		game_frozen: 'Frozen',
		game_unfrozen: 'Unfrozen',
		game_rollback: 'Rolled back',
		game_created: 'Created',
		game_deleted: 'Deleted',
		run_verified: 'Run verified',
		run_rejected: 'Run rejected',
		run_submitted: 'Run submitted',
	};

	// ── Field labels for diffing ─────────────────────────────────────
	const FIELD_LABELS: Record<string, string> = {
		full_runs: 'Full run',
		mini_challenges: 'Mini-challenge',
		player_made: 'Player-made',
		challenges_data: 'Challenge',
		restrictions_data: 'Restriction',
		glitches_data: 'Glitch',
		characters_data: 'Character',
		difficulties_data: 'Difficulty',
		general_rules: 'General rules',
		nmg_rules: 'NMG rules',
		character_column: 'Character column',
		difficulty_column: 'Difficulty column',
		glitch_doc_links: 'Glitch doc links',
		rules_version: 'Rules version',
	};

	type DiffLine = {
		type: 'added' | 'removed' | 'modified' | 'unchanged';
		field: string;
		label: string;
		detail?: string;
	};

	// ── Diff engine ──────────────────────────────────────────────────
	function computeDiff(oldRules: any, newRules: any): DiffLine[] {
		const lines: DiffLine[] = [];
		const allKeys = new Set([...Object.keys(oldRules || {}), ...Object.keys(newRules || {})]);

		for (const key of allKeys) {
			if (key === 'rules_version') continue;
			const oldVal = oldRules?.[key];
			const newVal = newRules?.[key];
			const fieldLabel = FIELD_LABELS[key] || key.replace(/_/g, ' ');

			if (Array.isArray(oldVal) || Array.isArray(newVal)) {
				const diffs = diffArrayBySlugs(oldVal || [], newVal || [], fieldLabel, key);
				lines.push(...diffs);
			} else if (typeof oldVal === 'string' || typeof newVal === 'string') {
				if (oldVal !== newVal) {
					if (!oldVal && newVal) {
						lines.push({ type: 'added', field: key, label: fieldLabel, detail: truncate(newVal, 80) });
					} else if (oldVal && !newVal) {
						lines.push({ type: 'removed', field: key, label: fieldLabel, detail: truncate(oldVal, 80) });
					} else {
						lines.push({ type: 'modified', field: key, label: fieldLabel, detail: 'text changed' });
					}
				}
			} else if (typeof oldVal === 'object' && typeof newVal === 'object' && oldVal && newVal) {
				// Object comparison (e.g. character_column, difficulty_column)
				if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
					const changes: string[] = [];
					if (oldVal.enabled !== newVal.enabled) changes.push(newVal.enabled ? 'enabled' : 'disabled');
					if (oldVal.label !== newVal.label) changes.push(`label → "${newVal.label}"`);
					if (changes.length > 0) {
						lines.push({ type: 'modified', field: key, label: fieldLabel, detail: changes.join(', ') });
					}
				}
			}
		}
		return lines;
	}

	function diffArrayBySlugs(oldArr: any[], newArr: any[], fieldLabel: string, key: string): DiffLine[] {
		const lines: DiffLine[] = [];

		// Flatten mini_challenges to include children
		const flattenItem = (item: any, parentLabel?: string): { slug: string; label: string; description?: string; exceptions?: string }[] => {
			const items: any[] = [];
			const lbl = parentLabel ? `${parentLabel} › ${item.label || item.slug}` : (item.label || item.slug);
			items.push({ slug: item.slug, label: lbl, description: item.description, exceptions: item.exceptions });
			if (Array.isArray(item.children)) {
				for (const child of item.children) {
					items.push(...flattenItem(child, lbl));
				}
			}
			return items;
		};

		const flatOld = oldArr.flatMap(i => typeof i === 'string' ? [{ slug: i, label: i }] : flattenItem(i));
		const flatNew = newArr.flatMap(i => typeof i === 'string' ? [{ slug: i, label: i }] : flattenItem(i));

		const oldMap = new Map(flatOld.map(i => [i.slug, i]));
		const newMap = new Map(flatNew.map(i => [i.slug, i]));

		// Added
		for (const [slug, item] of newMap) {
			if (!oldMap.has(slug)) {
				lines.push({ type: 'added', field: key, label: fieldLabel, detail: item.label || slug });
			}
		}

		// Removed
		for (const [slug, item] of oldMap) {
			if (!newMap.has(slug)) {
				lines.push({ type: 'removed', field: key, label: fieldLabel, detail: item.label || slug });
			}
		}

		// Modified (same slug, different content)
		for (const [slug, newItem] of newMap) {
			const oldItem = oldMap.get(slug);
			if (!oldItem) continue;
			const changes: string[] = [];
			if (oldItem.label !== newItem.label) changes.push(`renamed to "${newItem.label}"`);
			if ((oldItem.description || '') !== (newItem.description || '')) changes.push('description changed');
			if ((oldItem.exceptions || '') !== (newItem.exceptions || '')) changes.push('exceptions changed');
			if (changes.length > 0) {
				lines.push({ type: 'modified', field: key, label: fieldLabel, detail: `${oldItem.label || slug}: ${changes.join(', ')}` });
			}
		}

		// Unchanged count
		let unchangedCount = 0;
		for (const [slug] of newMap) {
			const oldItem = oldMap.get(slug);
			if (oldItem) {
				const newItem = newMap.get(slug)!;
				const same = oldItem.label === newItem.label &&
					(oldItem.description || '') === (newItem.description || '') &&
					(oldItem.exceptions || '') === (newItem.exceptions || '');
				if (same) unchangedCount++;
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

	function fmtDate(d: string): string {
		return formatDate(d);
	}
</script>

<svelte:head>
	<title>{m.game_history_title({ name: game.game_name })}</title>
</svelte:head>

<div class="history-page">
	<!-- Rules Changelog -->
	<section class="history-section">
		<h2>Rules changelog</h2>
		<p class="muted">Version history of rules, categories, challenges, and restrictions. Each entry shows what changed and why.</p>

		{#if changelog.length === 0}
			<div class="empty-state">
				<p class="muted">No rules changes have been recorded yet.</p>
			</div>
		{:else}
			<div class="changelog">
				{#each changelog as entry (entry.id)}
					{@const diffLines = computeDiff(entry.oldRules, entry.newRules)}
					<Collapsible.Root class="cl-card" open={expandedVersions[entry.id] || false} onOpenChange={(o: boolean) => { expandedVersions = { ...expandedVersions, [entry.id]: o }; }}>
						<Collapsible.Trigger class="cl-header">
							<div class="cl-header__left">
								<span class="cl-arrow">▸</span>
								<span class="cl-version">v{entry.version}</span>
								<span class="cl-summary">{entry.summary}</span>
							</div>
							<div class="cl-header__right">
								<span class="cl-editor">{entry.editor}</span>
								<span class="cl-sep">·</span>
								<time class="cl-date">{fmtDate(entry.date)}</time>
							</div>
						</Collapsible.Trigger>

						<Collapsible.Content>
							<div class="cl-body">
								{#if entry.sections.length > 0}
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

								{#if entry.summary && entry.summary !== `${entry.sections[0]} updated`}
									<div class="cl-reason">
										<span class="cl-reason__label">Reason</span>
										<p class="cl-reason__text">{entry.summary}</p>
									</div>
								{/if}
							</div>
						</Collapsible.Content>
					</Collapsible.Root>
				{/each}
			</div>

			<div class="cl-note">
				Runs submitted under an older rules version show a version badge so verifiers know which ruleset applied.
			</div>
		{/if}
	</section>

	<!-- Activity Log -->
	<section class="history-section">
		<h2>{m.game_history_changes()}</h2>
		<p class="muted">{m.game_history_changes_desc()}</p>

		{#if history.length === 0}
			<div class="empty-state">
				<p class="muted">{m.game_history_no_changes()}</p>
			</div>
		{:else}
			<div class="timeline">
				{#each history as entry}
					<div class="timeline__item">
						<div class="timeline__dot"></div>
						<div class="timeline__content">
							<div class="timeline__action">
								<span class="timeline__verb">{ACTION_LABELS[entry.action] || entry.action}</span>
								{#if entry.target}
									<span class="timeline__target">— {SECTION_LABELS[entry.target] || entry.target}</span>
								{/if}
							</div>
							{#if entry.note}
								<p class="timeline__note">{entry.note}</p>
							{/if}
							<div class="timeline__meta muted">
								<time>{formatDate(entry.date)}</time>
								{#if entry.by?.discord}
									<span>· {entry.by.discord}</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Community Achievements -->
	<section class="history-section">
		<h2>{m.game_history_achievements()}</h2>
		<p class="muted">{m.game_history_achievements_desc()}</p>

		{#if achievements.length === 0}
			<div class="empty-state">
				<p class="muted">{m.game_history_no_achievements()}</p>
			</div>
		{:else}
			<div class="ach-grid">
				{#each achievements as ach}
					<div class="ach-card">
						<div class="ach-card__icon">{ach.icon || '🏆'}</div>
						<div class="ach-card__info">
							<div class="ach-card__title">{ach.title}</div>
							{#if ach.description}
								<div class="ach-card__desc muted">{ach.description}</div>
							{/if}
							{#if ach.difficulty}
								<span class="ach-card__diff ach-card__diff--{ach.difficulty}">{ach.difficulty}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Community Milestones -->
	<section class="history-section">
		<h2>{m.game_history_milestones()}</h2>
		<p class="muted">{m.game_history_milestones_desc()}</p>

		<div class="empty-state">
			<p class="muted">{m.game_history_milestones_soon()}</p>
		</div>
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

	/* ── Rules Changelog ──────────────────────────────────────── */
	.changelog { display: flex; flex-direction: column; gap: 0.5rem; }

	:global(.cl-card) {
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 8px; overflow: hidden;
	}
	:global(.cl-card[data-state="open"]) { border-color: var(--accent); }

	:global(.cl-header) {
		display: flex; align-items: center; justify-content: space-between;
		width: 100%; padding: 0.65rem 0.85rem; gap: 0.5rem;
		background: none; border: none; cursor: pointer;
		font-family: inherit; font-size: inherit; color: inherit;
		text-align: left;
	}
	:global(.cl-header:hover) { background: rgba(255, 255, 255, 0.03); }

	:global(.cl-header__left) { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
	:global(.cl-header__right) { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--muted); flex-shrink: 0; }

	.cl-arrow { font-size: 0.75rem; color: var(--muted); width: 0.85rem; flex-shrink: 0; transition: transform 0.15s; }
	:global(.cl-header[data-state="open"]) .cl-arrow { transform: rotate(90deg); }
	.cl-version {
		font-size: 0.8rem; font-weight: 600;
		padding: 0.1rem 0.45rem; border-radius: 4px;
		background: rgba(99, 102, 241, 0.12); color: var(--accent);
		flex-shrink: 0;
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

	/* Reason block */
	.cl-reason {
		padding: 0.5rem 0.65rem;
		background: var(--panel); border-radius: 6px; border: 1px solid var(--border);
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

	/* ── Timeline ─────────────────────────────────────────────── */
	.timeline { position: relative; padding-left: 1.5rem; }
	.timeline::before {
		content: ''; position: absolute; left: 5px; top: 4px; bottom: 4px;
		width: 2px; background: var(--border);
	}
	.timeline__item { position: relative; padding-bottom: 1.25rem; }
	.timeline__item:last-child { padding-bottom: 0; }
	.timeline__dot {
		position: absolute; left: -1.5rem; top: 6px;
		width: 10px; height: 10px; border-radius: 50%;
		background: var(--accent); border: 2px solid var(--bg);
	}
	.timeline__content { padding-left: 0.25rem; }
	.timeline__verb { font-weight: 600; font-size: 0.9rem; }
	.timeline__target { font-size: 0.9rem; color: var(--muted); }
	.timeline__note { font-size: 0.85rem; color: var(--muted); margin: 0.25rem 0 0; }
	.timeline__meta { font-size: 0.8rem; margin-top: 0.25rem; }

	/* ── Achievements ─────────────────────────────────────────── */
	.ach-grid { display: flex; flex-direction: column; gap: 0.5rem; }
	.ach-card {
		display: flex; align-items: flex-start; gap: 0.75rem;
		padding: 0.75rem 1rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 8px;
	}
	.ach-card__icon { font-size: 1.5rem; flex-shrink: 0; }
	.ach-card__info { min-width: 0; }
	.ach-card__title { font-weight: 600; font-size: 0.95rem; }
	.ach-card__desc { font-size: 0.85rem; margin-top: 0.15rem; }
	.ach-card__diff {
		display: inline-block; margin-top: 0.3rem; padding: 0.1rem 0.4rem;
		border-radius: 4px; font-size: 0.7rem; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.03em;
	}
	.ach-card__diff--easy { background: rgba(34, 197, 94, 0.12); color: #22c55e; }
	.ach-card__diff--medium { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
	.ach-card__diff--hard { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
	.ach-card__diff--legendary { background: rgba(168, 85, 247, 0.12); color: #a855f7; }

	.muted { opacity: 0.6; }

	@media (max-width: 600px) {
		.history-page { padding: 0; }
		:global(.cl-header) { flex-direction: column; align-items: flex-start; gap: 0.35rem; }
		:global(.cl-header__right) { font-size: 0.75rem; }
	}
</style>
