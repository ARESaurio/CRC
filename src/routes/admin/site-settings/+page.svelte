<script lang="ts">
	import { Lock, Save, Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Eye, RotateCcw, Settings, ChevronRight, BookOpen, Swords, ScrollText} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { supabase } from '$lib/supabase';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	let { data } = $props();

	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let rulesOpen = $state(true);
	let challengesOpen = $state(false);
	let glossaryOpen = $state(false);

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => void) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => void) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) confirmCallback();
		confirmCallback = null;
	}

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 3000);
	}

	async function getSession() {
		const { data: sess } = await supabase.auth.getSession();
		return sess.session;
	}

	async function saveSetting(key: string, value: any) {
		const sess = await getSession();
		if (!sess) { showToast('error', 'Not authenticated'); return false; }
		const { error } = await supabase
			.from('site_settings')
			.upsert({ key, value, updated_by: sess.user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
		if (error) { showToast('error', error.message); return false; }
		return true;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// DEFAULT RULES TEMPLATE
	// ═══════════════════════════════════════════════════════════════════════
	const rulesExisting = data.settings.find((s: any) => s.key === 'default_rules_template');
	let rulesTemplate = $state<string>(rulesExisting?.value || '');
	let rulesSaving = $state(false);
	let rulesPreview = $state(false);

	async function saveRules() {
		rulesSaving = true;
		if (await saveSetting('default_rules_template', rulesTemplate)) showToast('success', 'Default rules saved!');
		rulesSaving = false;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// CHALLENGES
	// ═══════════════════════════════════════════════════════════════════════
	interface ChallengeEntry { slug: string; label: string; description: string; aliases: string[]; }

	const challengesExisting = data.settings.find((s: any) => s.key === 'challenges_config');
	let challenges = $state<ChallengeEntry[]>(parseChallenges(challengesExisting?.value));
	let challengesSaving = $state(false);
	let challengeAliasInput = $state<Record<string, string>>({});

	function parseChallenges(raw: any): ChallengeEntry[] {
		if (!raw || typeof raw !== 'object') return [];
		return Object.entries(raw)
			.filter(([, v]: [string, any]) => v && v.label)
			.map(([slug, v]: [string, any]) => ({
				slug,
				label: v.label || slug,
				description: v.description || '',
				aliases: v.aliases || []
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}

	function challengesToConfig(entries: ChallengeEntry[]): Record<string, any> {
		const config: Record<string, any> = {};
		for (const e of entries) {
			const obj: any = { label: e.label };
			if (e.description.trim()) obj.description = e.description;
			if (e.aliases.length > 0) obj.aliases = e.aliases;
			config[e.slug] = obj;
		}
		return config;
	}

	function addChallenge() {
		const slug = `new-challenge-${Date.now()}`;
		challenges = [...challenges, { slug, label: '', description: '', aliases: [] }];
	}

	function removeChallenge(i: number) {
		openConfirm('Delete Challenge', `Delete "${challenges[i].label || challenges[i].slug}"?`, () => {
			challenges = challenges.filter((_, j) => j !== i);
		});
	}

	function addChallengeAlias(i: number) {
		const input = challengeAliasInput[i] || '';
		if (!input.trim()) return;
		challenges[i].aliases = [...challenges[i].aliases, input.trim()];
		challenges = [...challenges];
		challengeAliasInput[i] = '';
	}

	function removeChallengeAlias(i: number, ai: number) {
		challenges[i].aliases = challenges[i].aliases.filter((_, j) => j !== ai);
		challenges = [...challenges];
	}

	async function saveChallenges() {
		challengesSaving = true;
		const config = challengesToConfig(challenges);
		if (await saveSetting('challenges_config', config)) showToast('success', 'Challenges saved!');
		challengesSaving = false;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// GLOSSARY
	// ═══════════════════════════════════════════════════════════════════════
	interface GlossaryTerm { slug: string; label: string; description: string; }
	interface GlossarySection { key: string; label: string; terms: GlossaryTerm[]; }

	const glossaryExisting = data.settings.find((s: any) => s.key === 'glossary_config');
	let glossarySections = $state<GlossarySection[]>(parseGlossary(glossaryExisting?.value));
	let glossarySaving = $state(false);

	function parseGlossary(raw: any): GlossarySection[] {
		if (!raw || typeof raw !== 'object') return [];
		return Object.entries(raw).map(([key, section]: [string, any]) => ({
			key,
			label: section.label || key,
			terms: Object.entries(section.terms || {}).map(([slug, term]: [string, any]) => ({
				slug,
				label: term.label || slug,
				description: term.description || ''
			}))
		}));
	}

	function glossaryToConfig(sections: GlossarySection[]): Record<string, any> {
		const config: Record<string, any> = {};
		for (const s of sections) {
			const terms: Record<string, any> = {};
			for (const t of s.terms) {
				terms[t.slug] = { label: t.label, description: t.description };
			}
			config[s.key] = { label: s.label, terms };
		}
		return config;
	}

	function addGlossarySection() {
		const key = `section-${Date.now()}`;
		glossarySections = [...glossarySections, { key, label: '', terms: [] }];
	}

	function removeGlossarySection(i: number) {
		openConfirm('Delete Section', `Delete section "${glossarySections[i].label || glossarySections[i].key}" and all its terms?`, () => {
			glossarySections = glossarySections.filter((_, j) => j !== i);
		});
	}

	function addGlossaryTerm(si: number) {
		const slug = `term-${Date.now()}`;
		glossarySections[si].terms = [...glossarySections[si].terms, { slug, label: '', description: '' }];
		glossarySections = [...glossarySections];
	}

	function removeGlossaryTerm(si: number, ti: number) {
		glossarySections[si].terms = glossarySections[si].terms.filter((_, j) => j !== ti);
		glossarySections = [...glossarySections];
	}

	async function saveGlossary() {
		glossarySaving = true;
		const config = glossaryToConfig(glossarySections);
		if (await saveSetting('glossary_config', config)) showToast('success', 'Glossary saved!');
		glossarySaving = false;
	}
</script>

<svelte:head><title>Site Settings | Admin</title></svelte:head>

<div class="settings-page">
	<div class="settings-header">
		<h2><Settings size={20} style="display:inline-block;vertical-align:-0.125em;" /> Site Settings</h2>
		<p class="muted">Super admin only. These settings apply site-wide.</p>
	</div>

	{#if toast}
		<div class="toast toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- ═══════════════════════ DEFAULT RULES ═══════════════════════ -->
	<Collapsible.Root bind:open={rulesOpen} class="accordion-section">
		<Collapsible.Trigger class="accordion-header">
			<span class="accordion-header__icon">{#if rulesOpen}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}</span>
			<span><BookOpen size={14} /> Default Rules Template</span>
		</Collapsible.Trigger>
		<Collapsible.Content class="accordion-body">
				<p class="muted mb-1">Shown on all Community Review game pages as the "Active Rules" baseline. Supports markdown.</p>

				<div class="editor-toolbar">
					<ToggleGroup.Root class="preview-toggle" value={rulesPreview ? 'preview' : 'edit'} onValueChange={(v: string) => { rulesPreview = v === 'preview'; }}>
						<ToggleGroup.Item value="edit"><Pencil size={14} /> Edit</ToggleGroup.Item>
						<ToggleGroup.Item value="preview"><Eye size={14} /> Preview</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>

				{#if rulesPreview}
					<div class="preview-pane">
						{#if rulesTemplate.trim()}
							<div class="md">{@html renderMarkdown(rulesTemplate)}</div>
						{:else}
							<p class="muted">No content to preview.</p>
						{/if}
					</div>
				{:else}
					<textarea class="rules-editor" bind:value={rulesTemplate} rows="16" placeholder="Write default rules in markdown..."></textarea>
				{/if}

				<div class="save-row">
					<button class="btn btn--save" onclick={saveRules} disabled={rulesSaving}>{#if rulesSaving}Saving...{:else}<Save size={14} /> Save Default Rules{/if}</button>
				</div>
		</Collapsible.Content>
	</Collapsible.Root>

	<!-- ═══════════════════════ CHALLENGES ═══════════════════════ -->
	<Collapsible.Root bind:open={challengesOpen} class="accordion-section">
		<Collapsible.Trigger class="accordion-header">
			<span class="accordion-header__icon">{#if challengesOpen}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}</span>
			<span><Swords size={14} /> Challenge Types ({challenges.length})</span>
		</Collapsible.Trigger>
		<Collapsible.Content class="accordion-body">
				<div class="section-top">
					<p class="muted mb-1">Definitions used across CRC. Shown on the glossary page and referenced in game rules.</p>
					<Button.Root variant="accent" size="sm" onclick={addChallenge}>+ Add Challenge</Button.Root>
				</div>

				<div class="entry-list">
					{#each challenges as c, i}
						<div class="entry-card">
							<div class="entry-card__row">
								<div class="entry-card__field">
									<label class="field-label">Slug</label>
									<input class="field-input field-input--sm" bind:value={c.slug} placeholder="e.g. hitless" />
								</div>
								<div class="entry-card__field entry-card__field--grow">
									<label class="field-label">Label</label>
									<input class="field-input" bind:value={c.label} placeholder="e.g. Hitless" />
								</div>
								<button class="btn btn--small btn--reject entry-card__delete" onclick={() => removeChallenge(i)}><X size={14} /></button>
							</div>
							<div class="entry-card__field">
								<label class="field-label">Description (markdown)</label>
								<textarea class="field-input" bind:value={c.description} rows="3" placeholder="Rules for this challenge type..."></textarea>
							</div>
							<div class="entry-card__field">
								<label class="field-label">Aliases</label>
								<div class="tag-editor">
									{#each c.aliases as alias, ai}
										<span class="tag-pill">{alias} <button class="tag-pill__x" onclick={() => removeChallengeAlias(i, ai)}><X size={14} /></button></span>
									{/each}
									<input class="tag-editor__input" bind:value={challengeAliasInput[i]} placeholder="Add alias + Enter"
										onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChallengeAlias(i); } }} />
								</div>
							</div>
						</div>
					{/each}
				</div>

				{#if challenges.length === 0}
					<p class="muted" style="text-align:center; padding: 2rem;">No challenges defined. Click "Add Challenge" to start.</p>
				{/if}

				<div class="save-row">
					<button class="btn btn--save" onclick={saveChallenges} disabled={challengesSaving}>{#if challengesSaving}Saving...{:else}<Save size={14} /> Save Challenges{/if}</button>
				</div>
		</Collapsible.Content>
	</Collapsible.Root>

	<!-- ═══════════════════════ GLOSSARY ═══════════════════════ -->
	<Collapsible.Root bind:open={glossaryOpen} class="accordion-section">
		<Collapsible.Trigger class="accordion-header">
			<span class="accordion-header__icon">{#if glossaryOpen}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}</span>
			<span><ScrollText size={14} /> Glossary ({glossarySections.reduce((n, s) => n + s.terms.length, 0)} terms)</span>
		</Collapsible.Trigger>
		<Collapsible.Content class="accordion-body">
				<div class="section-top">
					<p class="muted mb-1">Grouped terminology shown on the glossary page.</p>
					<Button.Root variant="accent" size="sm" onclick={addGlossarySection}>+ Add Section</Button.Root>
				</div>

				{#each glossarySections as section, si}
					<div class="glossary-section">
						<div class="glossary-section__header">
							<div class="entry-card__row">
								<div class="entry-card__field">
									<label class="field-label">Section Key</label>
									<input class="field-input field-input--sm" bind:value={section.key} placeholder="e.g. gameplay" />
								</div>
								<div class="entry-card__field entry-card__field--grow">
									<label class="field-label">Section Label</label>
									<input class="field-input" bind:value={section.label} placeholder="e.g. Gameplay Interactions" />
								</div>
								<button class="btn btn--small btn--reject" onclick={() => removeGlossarySection(si)}><X size={10} /> Section</button>
							</div>
						</div>

						<div class="glossary-terms">
							{#each section.terms as term, ti}
								<div class="term-card">
									<div class="entry-card__row">
										<div class="entry-card__field">
											<label class="field-label">Slug</label>
											<input class="field-input field-input--sm" bind:value={term.slug} placeholder="e.g. hit" />
										</div>
										<div class="entry-card__field entry-card__field--grow">
											<label class="field-label">Label</label>
											<input class="field-input" bind:value={term.label} placeholder="e.g. Hit" />
										</div>
										<button class="btn btn--small btn--reject term-card__delete" onclick={() => removeGlossaryTerm(si, ti)}><X size={14} /></button>
									</div>
									<div class="entry-card__field">
										<label class="field-label">Description</label>
										<textarea class="field-input" bind:value={term.description} rows="2" placeholder="Definition of this term..."></textarea>
									</div>
								</div>
							{/each}
							<Button.Root variant="outline" size="sm" onclick={() => addGlossaryTerm(si)}>+ Add Term</Button.Root>
						</div>
					</div>
				{/each}

				{#if glossarySections.length === 0}
					<p class="muted" style="text-align:center; padding: 2rem;">No glossary sections. Click "Add Section" to start.</p>
				{/if}

				<div class="save-row">
					<button class="btn btn--save" onclick={saveGlossary} disabled={glossarySaving}>{#if glossarySaving}Saving...{:else}<Save size={14} /> Save Glossary{/if}</button>
				</div>
		</Collapsible.Content>
	</Collapsible.Root>
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="btn btn--danger" onclick={handleConfirmAction}>Delete</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.settings-page { max-width: 900px; margin: 0 auto; padding: 0 1rem; }
	.settings-header { margin-bottom: 1rem; }
	.settings-header h2 { margin: 0 0 0.25rem; font-size: 1.5rem; }

	.toast { padding: 0.6rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.toast--success { background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); color: #28a745; }
	.toast--error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); color: #dc3545; }

	/* Accordion (Collapsible) */
	:global(.accordion-section) { margin-bottom: 0.75rem; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	:global(.accordion-section .accordion-header) {
		display: flex; align-items: center; gap: 0.5rem; width: 100%;
		padding: 0.85rem 1.25rem; background: var(--surface); border: none;
		color: var(--fg); font-size: 1rem; font-weight: 600; cursor: pointer;
		font-family: inherit; text-align: left; transition: background 0.15s;
	}
	:global(.accordion-section .accordion-header:hover) { background: rgba(255,255,255,0.03); }
	:global(.accordion-section .accordion-header[data-state="open"]) { border-bottom: 1px solid var(--border); }
	.accordion-header__icon { font-size: 0.7rem; width: 1rem; text-align: center; color: var(--muted); transition: transform 0.15s; }
	:global(.accordion-body) { padding: 1.25rem; background: var(--surface); }

	.section-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }

	/* Editor */
	.editor-toolbar { display: flex; gap: 0.35rem; margin-bottom: 0.5rem; }
	:global(.preview-toggle) { display: flex; gap: 0.25rem; border: none; overflow: visible; }
	:global(.preview-toggle [data-toggle-group-item]) { padding: 0.35rem 0.65rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; font-size: 0.82rem; cursor: pointer; color: var(--muted); font-family: inherit; }
	:global(.preview-toggle [data-toggle-group-item][data-state="on"]) { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn--accent { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn--outline { background: transparent; border: 1px solid var(--border); color: var(--fg); }
	.btn--outline:hover { background: rgba(255,255,255,0.05); }
	.btn--reject { background: #dc3545; color: white; border-color: #dc3545; }

	.rules-editor {
		width: 100%; min-height: 300px; padding: 0.75rem; background: var(--bg);
		border: 1px solid var(--border); border-radius: 6px; color: var(--fg);
		font-family: 'Consolas', 'Monaco', monospace; font-size: 0.85rem;
		line-height: 1.6; resize: vertical; box-sizing: border-box;
	}
	.rules-editor:focus { outline: none; border-color: var(--accent); }

	.preview-pane { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; min-height: 150px; }

	.save-row { margin-top: 1rem; display: flex; align-items: center; gap: 1rem; }

	/* Shared field styles */
	.field-label { display: block; font-weight: 600; font-size: 0.78rem; color: var(--muted); margin-bottom: 0.2rem; text-transform: uppercase; letter-spacing: 0.03em; }
	.field-input { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--fg); font-size: 0.85rem; font-family: inherit; box-sizing: border-box; }
	.field-input:focus { outline: none; border-color: var(--accent); }
	.field-input--sm { max-width: 180px; }
	textarea.field-input { resize: vertical; font-family: inherit; }

	/* Entry cards (challenges) */
	.entry-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.entry-card { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.entry-card__row { display: flex; gap: 0.5rem; align-items: flex-end; margin-bottom: 0.5rem; }
	.entry-card__field { display: flex; flex-direction: column; }
	.entry-card__field--grow { flex: 1; }
	.entry-card__field + .entry-card__field { margin-top: 0.5rem; }
	.entry-card__delete { align-self: flex-end; margin-bottom: 0.1rem; }

	/* Tag editor (aliases) */
	.tag-editor { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.35rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; min-height: 34px; align-items: center; }
	.tag-editor__input { border: none; background: none; color: var(--fg); font-size: 0.85rem; padding: 0.2rem; flex: 1; min-width: 100px; outline: none; font-family: inherit; }
	.tag-pill { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.15rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem; }
	.tag-pill__x { background: none; border: none; color: var(--muted); cursor: pointer; padding: 0 0.15rem; font-size: 0.85rem; line-height: 1; }
	.tag-pill__x:hover { color: #dc3545; }

	/* Glossary sections */
	.glossary-section { margin-bottom: 1.25rem; padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.glossary-section__header { margin-bottom: 0.75rem; }
	.glossary-terms { padding-left: 1rem; border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: 0.5rem; }
	.term-card { padding: 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
	.term-card__delete { align-self: flex-end; margin-bottom: 0.1rem; }

	.mb-1 { margin-bottom: 0.5rem; }
	.muted { color: var(--muted); }
</style>
