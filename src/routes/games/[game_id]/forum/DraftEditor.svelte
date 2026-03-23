<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { groupLabel, type SectionId } from './consensus';

	let {
		section,
		initialData,
		existingTitle,
		existingNotes,
		onSave,
		onClose
	}: {
		section: SectionId;
		initialData: any;
		existingTitle: string;
		existingNotes: string;
		onSave: (data: any, title: string, notes: string) => void;
		onClose: () => void;
	} = $props();

	let data = $state(JSON.parse(JSON.stringify(initialData || {})));
	let title = $state(existingTitle);
	let notes = $state(existingNotes);
	let saving = $state(false);
	let showPreview = $state(false);

	// ── Section config ───────────────────────────────────────────────────
	const SECTION_ARRAYS: Record<SectionId, { key: string; label: string; hasChildren?: boolean }[]> = {
		overview: [],
		categories: [
			{ key: 'full_runs', label: 'Full Run Categories' },
			{ key: 'mini_challenges', label: 'Mini Challenges', hasChildren: true },
			{ key: 'player_made', label: 'Player-Made Challenges' }
		],
		rules: [],
		challenges: [
			{ key: 'challenges_data', label: 'Challenge Types' },
			{ key: 'glitches_data', label: 'Glitch Categories' }
		],
		restrictions: [
			{ key: 'restrictions_data', label: 'Restrictions' }
		],
		characters: [
			{ key: 'characters_data', label: 'Characters' }
		],
		difficulties: [
			{ key: 'difficulties_data', label: 'Difficulties' }
		],
		achievements: [
			{ key: 'community_achievements', label: 'Community Achievements' }
		]
	};

	const arrayConfigs = $derived(SECTION_ARRAYS[section]);
	const isTextOnly = $derived(section === 'rules' || section === 'overview');

	// ── Item helpers ─────────────────────────────────────────────────────

	function slugify(text: string): string {
		return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
	}

	function addItem(key: string) {
		if (!data[key]) data[key] = [];
		data[key] = [...data[key], { slug: '', label: '', description: '' }];
	}

	function removeItem(key: string, index: number) {
		data[key] = data[key].filter((_: any, i: number) => i !== index);
	}

	function moveItem(key: string, index: number, direction: -1 | 1) {
		const arr = [...data[key]];
		const target = index + direction;
		if (target < 0 || target >= arr.length) return;
		[arr[index], arr[target]] = [arr[target], arr[index]];
		data[key] = arr;
	}

	function autoSlug(key: string, index: number) {
		const item = data[key][index];
		if (item && !item.slug && item.label) {
			data[key][index] = { ...item, slug: slugify(item.label) };
			data[key] = [...data[key]]; // trigger reactivity
		}
	}

	// ── Save ─────────────────────────────────────────────────────────────

	async function handleSave() {
		saving = true;
		await onSave(data, title.trim(), notes.trim());
		saving = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="editor-backdrop" onclick={onClose}></div>
<div class="editor-modal">
	<div class="editor-modal__header">
		<h2>
			{#if section === 'rules'}✏️ Edit Rules Draft
			{:else}✏️ Edit {section.charAt(0).toUpperCase() + section.slice(1)} Draft
			{/if}
		</h2>
		<button class="editor-modal__close" onclick={onClose}>&times;</button>
	</div>

	<div class="editor-modal__body">
		<!-- Title & Notes -->
		<div class="field-group">
			<label class="field-label">Draft Title <span class="field-hint">(brief summary of your proposal)</span></label>
			<input class="field-input" type="text" bind:value={title} placeholder="e.g. Reworked hitless categories" maxlength="200" />
		</div>
		<div class="field-group">
			<label class="field-label">Notes <span class="field-hint">(explain your reasoning)</span></label>
			<textarea class="field-textarea" bind:value={notes} rows="2" placeholder="Why these changes?" maxlength="1000"></textarea>
		</div>

		<hr class="divider" />

		<!-- ── Text-only sections: markdown textarea ──────────────────────── -->
		{#if isTextOnly}
			{@const textKey = section === 'overview' ? 'content' : 'general_rules'}
			{@const textPlaceholder = section === 'overview' ? 'Describe the game, link community resources, etc.' : 'Write rules in markdown...'}
			<div class="field-group">
				<div class="rules-toolbar">
					<button class="btn btn--small" class:btn--active={!showPreview} onclick={() => { showPreview = false; }}>✏️ Edit</button>
					<button class="btn btn--small" class:btn--active={showPreview} onclick={() => { showPreview = true; }}>👁️ Preview</button>
				</div>
				{#if showPreview}
					<div class="rules-preview markdown-body">
						{#if data[textKey]?.trim()}
							{@html renderMarkdown(data[textKey])}
						{:else}
							<p class="muted">No content to preview.</p>
						{/if}
					</div>
				{:else}
					{#if section === 'overview'}
						<textarea class="field-textarea field-textarea--tall" bind:value={data.content} rows="12" placeholder={textPlaceholder}></textarea>
					{:else}
						<textarea class="field-textarea field-textarea--tall" bind:value={data.general_rules} rows="20" placeholder={textPlaceholder}></textarea>
					{/if}
				{/if}
			</div>

		<!-- ── Array-based sections: item list editor ───────────────────── -->
		{:else}
			{#each arrayConfigs as cfg}
				<div class="array-section">
					<div class="array-section__header">
						<h3>{cfg.label}</h3>
						<button class="btn btn--small btn--accent" onclick={() => addItem(cfg.key)}>+ Add</button>
					</div>

					{#if !data[cfg.key]?.length}
						<p class="muted small">No items yet. Click "Add" to create one.</p>
					{/if}

					{#each (data[cfg.key] || []) as item, i}
						<div class="item-editor">
							<div class="item-editor__row">
								<div class="item-editor__field item-editor__field--label">
									<label class="field-label-sm">Label</label>
									<input class="field-input" type="text" bind:value={item.label} placeholder="e.g. Hitless" onblur={() => autoSlug(cfg.key, i)} />
								</div>
								<div class="item-editor__field item-editor__field--slug">
									<label class="field-label-sm">Slug</label>
									<input class="field-input" type="text" bind:value={item.slug} placeholder="auto-generated" />
								</div>
								<div class="item-editor__actions">
									<button class="btn-icon" onclick={() => moveItem(cfg.key, i, -1)} disabled={i === 0} title="Move up">↑</button>
									<button class="btn-icon" onclick={() => moveItem(cfg.key, i, 1)} disabled={i === (data[cfg.key]?.length || 0) - 1} title="Move down">↓</button>
									<button class="btn-icon btn-icon--danger" onclick={() => removeItem(cfg.key, i)} title="Remove">✕</button>
								</div>
							</div>
							<div class="item-editor__field item-editor__field--desc">
								<label class="field-label-sm">Description</label>
								<textarea class="field-textarea" bind:value={item.description} rows="2" placeholder="Describe this item..."></textarea>
							</div>
							{#if item.exceptions !== undefined || cfg.key === 'full_runs' || cfg.key === 'player_made'}
								<div class="item-editor__field">
									<label class="field-label-sm">Exceptions <span class="field-hint">(optional)</span></label>
									<textarea class="field-textarea" bind:value={item.exceptions} rows="1" placeholder="Any exceptions to this category..."></textarea>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}

			<!-- Extra text fields for challenges section -->
			{#if section === 'challenges'}
				<hr class="divider" />
				<div class="field-group">
					<label class="field-label">NMG Rules</label>
					<textarea class="field-textarea" bind:value={data.nmg_rules} rows="4" placeholder="No Major Glitches rules..."></textarea>
				</div>
				<div class="field-group">
					<label class="field-label">Glitch Doc Links</label>
					<textarea class="field-textarea" bind:value={data.glitch_doc_links} rows="3" placeholder="Links to glitch documentation..."></textarea>
				</div>
			{/if}

			<!-- Character/Difficulty column toggle -->
			{#if section === 'characters' && data.character_column}
				<hr class="divider" />
				<label class="toggle-row">
					<input type="checkbox" bind:checked={data.character_column.enabled} />
					Enable character column in leaderboards
				</label>
				<div class="field-group">
					<label class="field-label-sm">Column Label</label>
					<input class="field-input" type="text" bind:value={data.character_column.label} placeholder="Character" />
				</div>
			{/if}
			{#if section === 'difficulties' && data.difficulty_column}
				<hr class="divider" />
				<label class="toggle-row">
					<input type="checkbox" bind:checked={data.difficulty_column.enabled} />
					Enable difficulty column in leaderboards
				</label>
				<div class="field-group">
					<label class="field-label-sm">Column Label</label>
					<input class="field-input" type="text" bind:value={data.difficulty_column.label} placeholder="Difficulty" />
				</div>
			{/if}
		{/if}
	</div>

	<div class="editor-modal__footer">
		<button class="btn btn--save" onclick={handleSave} disabled={saving}>{saving ? 'Saving...' : '💾 Save Draft'}</button>
		<button class="btn btn--reset" onclick={onClose}>Cancel</button>
	</div>
</div>

<style>
	.editor-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 100; }
	.editor-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 101; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; width: 94%; max-width: 720px; max-height: 85vh; display: flex; flex-direction: column; }
	.editor-modal__header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
	.editor-modal__header h2 { margin: 0; font-size: 1.15rem; }
	.editor-modal__close { background: none; border: none; color: var(--muted); font-size: 1.6rem; cursor: pointer; padding: 0; line-height: 1; }
	.editor-modal__body { padding: 1.25rem; overflow-y: auto; flex: 1; }
	.editor-modal__footer { display: flex; gap: 0.5rem; padding: 1rem 1.25rem; border-top: 1px solid var(--border); flex-shrink: 0; }

	/* Fields */
	.field-group { margin-bottom: 0.75rem; }
	.field-label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem; }
	.field-label-sm { display: block; font-weight: 500; font-size: 0.78rem; color: var(--muted); margin-bottom: 0.15rem; }
	.field-hint { font-weight: 400; color: var(--muted); font-size: 0.78rem; }
	.field-input { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.88rem; box-sizing: border-box; }
	.field-input:focus { outline: none; border-color: var(--accent); }
	.field-textarea { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.88rem; resize: vertical; box-sizing: border-box; }
	.field-textarea:focus { outline: none; border-color: var(--accent); }
	.field-textarea--tall { min-height: 300px; }
	.divider { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }

	/* Rules toolbar */
	.rules-toolbar { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; }
	.rules-preview { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; min-height: 200px; max-height: 400px; overflow-y: auto; }

	/* Array sections */
	.array-section { margin-bottom: 1.25rem; }
	.array-section__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
	.array-section__header h3 { margin: 0; font-size: 0.95rem; }

	/* Item editor */
	.item-editor { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.5rem; }
	.item-editor__row { display: flex; gap: 0.5rem; align-items: flex-end; margin-bottom: 0.5rem; }
	.item-editor__field { flex: 1; min-width: 0; }
	.item-editor__field--label { flex: 2; }
	.item-editor__field--slug { flex: 1.5; }
	.item-editor__field--desc { margin-bottom: 0.35rem; }
	.item-editor__actions { display: flex; gap: 0.25rem; align-items: center; padding-bottom: 0.1rem; }

	.btn-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; cursor: pointer; font-size: 0.85rem; color: var(--fg); }
	.btn-icon:hover { background: rgba(255,255,255,0.06); }
	.btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
	.btn-icon--danger:hover { color: #dc3545; border-color: #dc3545; }

	.toggle-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; margin-bottom: 0.75rem; cursor: pointer; }

	.muted { color: var(--muted); }
	.small { font-size: 0.85rem; }

	@media (max-width: 600px) {
		.item-editor__row { flex-direction: column; align-items: stretch; }
		.item-editor__actions { justify-content: flex-end; }
	}
</style>
