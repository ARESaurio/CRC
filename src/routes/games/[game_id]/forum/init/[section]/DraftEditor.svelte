<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { groupLabel, type SectionId } from '../../consensus';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as Separator from '$lib/components/ui/separator/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';

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
			{ key: 'full_runs', label: 'Full Run Categories', hasChildren: true },
			{ key: 'mini_challenges', label: 'Mini Challenges', hasChildren: true },
			{ key: 'player_made', label: 'Player-Made Challenges', hasChildren: true }
		],
		rules: [],
		challenges: [
			{ key: 'challenges_data', label: 'Challenge Types', hasChildren: true },
			{ key: 'glitches_data', label: 'Glitch Categories', hasChildren: true }
		],
		restrictions: [
			{ key: 'restrictions_data', label: 'Restrictions', hasChildren: true }
		],
		characters: [
			{ key: 'characters_data', label: 'Characters', hasChildren: true }
		],
		difficulties: [
			{ key: 'difficulties_data', label: 'Difficulties', hasChildren: true }
		],
		achievements: [
			{ key: 'community_achievements', label: 'Community Achievements', hasChildren: true }
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

	// ── Child helpers ─────────────────────────────────────────────────
	function addChild(key: string, parentIndex: number) {
		const item = data[key][parentIndex];
		if (!item.children) item.children = [];
		item.children = [...item.children, { slug: '', label: '', description: '' }];
		data[key] = [...data[key]];
	}

	function removeChild(key: string, parentIndex: number, childIndex: number) {
		const item = data[key][parentIndex];
		item.children = item.children.filter((_: any, i: number) => i !== childIndex);
		data[key] = [...data[key]];
	}

	function moveChild(key: string, parentIndex: number, childIndex: number, direction: -1 | 1) {
		const item = data[key][parentIndex];
		const arr = [...item.children];
		const target = childIndex + direction;
		if (target < 0 || target >= arr.length) return;
		[arr[childIndex], arr[target]] = [arr[target], arr[childIndex]];
		item.children = arr;
		data[key] = [...data[key]];
	}

	function autoSlugChild(key: string, parentIndex: number, childIndex: number) {
		const child = data[key][parentIndex].children[childIndex];
		if (child && !child.slug && child.label) {
			data[key][parentIndex].children[childIndex] = { ...child, slug: slugify(child.label) };
			data[key] = [...data[key]];
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
<Dialog.Root open={true} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
	<Dialog.Overlay />
	<Dialog.Content class="editor-dialog">
		<Dialog.Header>
			<Dialog.Title>
				{#if section === 'rules'}✏️ Edit Rules Draft
				{:else}✏️ Edit {section.charAt(0).toUpperCase() + section.slice(1)} Draft
				{/if}
			</Dialog.Title>
			<Dialog.Close>&times;</Dialog.Close>
		</Dialog.Header>

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

		<Separator.Root class="divider" />

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
						<Button.Root variant="accent" size="sm" onclick={() => addItem(cfg.key)}>+ Add</Button.Root>
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
							{#if cfg.hasChildren}
								<Collapsible.Root class="children-section">
									<Collapsible.Trigger class="children-toggle">
										Children <span class="children-count">({(item.children || []).length})</span> <span class="children-chevron">▶</span>
									</Collapsible.Trigger>
									<Collapsible.Content>
										{#each (item.children || []) as child, ci}
											<div class="child-editor">
												<div class="child-editor__row">
													<div class="item-editor__field item-editor__field--label">
														<label class="field-label-sm">Label</label>
														<input class="field-input" type="text" bind:value={child.label} placeholder="Sub-item label" onblur={() => autoSlugChild(cfg.key, i, ci)} />
													</div>
													<div class="item-editor__field item-editor__field--slug">
														<label class="field-label-sm">Slug</label>
														<input class="field-input" type="text" bind:value={child.slug} placeholder="auto-generated" />
													</div>
													<div class="item-editor__actions">
														<button class="btn-icon" onclick={() => moveChild(cfg.key, i, ci, -1)} disabled={ci === 0} title="Move up">↑</button>
														<button class="btn-icon" onclick={() => moveChild(cfg.key, i, ci, 1)} disabled={ci === (item.children?.length || 0) - 1} title="Move down">↓</button>
														<button class="btn-icon btn-icon--danger" onclick={() => removeChild(cfg.key, i, ci)} title="Remove child">✕</button>
													</div>
												</div>
												<div class="item-editor__field item-editor__field--desc">
													<label class="field-label-sm">Description</label>
													<textarea class="field-textarea" bind:value={child.description} rows="1" placeholder="Describe this sub-item..."></textarea>
												</div>
											</div>
										{/each}
										<button class="btn-add-child" onclick={() => addChild(cfg.key, i)}>+ Add Sub-Item</button>
									</Collapsible.Content>
								</Collapsible.Root>
							{/if}
						</div>
					{/each}
				</div>
			{/each}

			<!-- Extra text fields for challenges section -->
			{#if section === 'challenges'}
				<Separator.Root class="divider" />
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
				<Separator.Root class="divider" />
				<label class="toggle-row">
					<Switch.Root bind:checked={data.character_column.enabled} />
					Enable character column in leaderboards
				</label>
				<div class="field-group">
					<label class="field-label-sm">Column Label</label>
					<input class="field-input" type="text" bind:value={data.character_column.label} placeholder="Character" />
				</div>
			{/if}
			{#if section === 'difficulties' && data.difficulty_column}
				<Separator.Root class="divider" />
				<label class="toggle-row">
					<Switch.Root bind:checked={data.difficulty_column.enabled} />
					Enable difficulty column in leaderboards
				</label>
				<div class="field-group">
					<label class="field-label-sm">Column Label</label>
					<input class="field-input" type="text" bind:value={data.difficulty_column.label} placeholder="Difficulty" />
				</div>
			{/if}
		{/if}
	</div>

		<Dialog.Footer>
			<button class="btn btn--save" onclick={handleSave} disabled={saving}>{saving ? 'Saving...' : '💾 Save Draft'}</button>
			<button class="btn btn--reset" onclick={onClose}>Cancel</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.editor-dialog) { max-width: 720px; width: 94%; max-height: 85vh; display: flex; flex-direction: column; }
	.editor-modal__body { padding: 1.25rem; overflow-y: auto; flex: 1; }

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
	:global(.divider) { margin: 1rem 0; }

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

	/* Children */
	.children-section { margin-top: 0.5rem; }
	:global(.children-toggle) { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 500; color: var(--muted); cursor: pointer; background: none; border: none; padding: 0.25rem 0; font-family: inherit; }
	:global(.children-toggle:hover) { color: var(--fg); }
	.children-count { font-weight: 400; }
	:global(.children-toggle .children-chevron) { font-size: 0.65rem; transition: transform 0.15s; }
	:global(.children-toggle[data-state="open"] .children-chevron) { transform: rotate(90deg); }
	.child-editor { margin-left: 1rem; padding: 0.5rem 0.6rem; border-left: 2px solid var(--accent); background: rgba(255,255,255,0.015); border-radius: 0 4px 4px 0; margin-bottom: 0.35rem; }
	.child-editor__row { display: flex; gap: 0.5rem; align-items: flex-end; margin-bottom: 0.35rem; }
	.btn-add-child { margin-left: 1rem; margin-top: 0.35rem; background: none; border: 1px dashed var(--border); border-radius: 5px; padding: 0.3rem 0.6rem; font-size: 0.78rem; color: var(--muted); cursor: pointer; font-family: inherit; }
	.btn-add-child:hover { border-color: var(--accent); color: var(--accent); }

	@media (max-width: 600px) {
		.item-editor__row { flex-direction: column; align-items: stretch; }
		.item-editor__actions { justify-content: flex-end; }
		.child-editor__row { flex-direction: column; align-items: stretch; }
	}
</style>
