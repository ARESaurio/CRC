<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { SECTIONS, type SectionId } from './consensus';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Pencil, Eye, X, ChevronRight, ChevronUp, ChevronDown} from 'lucide-svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Separator from '$lib/components/ui/separator/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	let {
		section,
		initialData,
		onSubmit,
		onClose,
		submitting = false,
	}: {
		section: SectionId;
		initialData: any;
		onSubmit: (data: any, title: string, notes: string) => void;
		onClose: () => void;
		submitting?: boolean;
	} = $props();

	let data = $state(JSON.parse(JSON.stringify(initialData || {})));
	let title = $state('');
	let notes = $state('');
	let showPreview = $state(false);

	const sectionMeta = $derived(SECTIONS.find(s => s.id === section));
	const isTextOnly = $derived(section === 'rules' || section === 'overview');

	// ── Array configs per section ─────────────────────────────────────
	const SECTION_ARRAYS: Record<string, { key: string; label: string; hasChildren?: boolean }[]> = {
		categories: [
			{ key: 'full_runs', label: 'Full Run Categories', hasChildren: true },
			{ key: 'mini_challenges', label: 'Mini Challenges', hasChildren: true },
			{ key: 'player_made', label: 'Player-Made Challenges', hasChildren: true },
		],
		challenges: [
			{ key: 'challenges_data', label: 'Challenge Types', hasChildren: true },
			{ key: 'glitches_data', label: 'Glitch Categories', hasChildren: true },
		],
		restrictions: [
			{ key: 'restrictions_data', label: 'Restrictions', hasChildren: true },
		],
		characters: [
			{ key: 'characters_data', label: 'Characters' },
		],
		difficulties: [
			{ key: 'difficulties_data', label: 'Difficulties' },
		],
		achievements: [
			{ key: 'community_achievements', label: 'Community Achievements' },
		],
	};

	const arrayConfigs = $derived(SECTION_ARRAYS[section] || []);

	// ── Item helpers ──────────────────────────────────────────────────
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
			data[key] = [...data[key]];
		}
	}

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

	function handleSubmit() {
		onSubmit(data, title.trim(), notes.trim());
	}
</script>

<Dialog.Root open={true} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
	<Dialog.Overlay />
	<Dialog.Content class="pe-modal">
		<Dialog.Header class="pe-header">
			<Dialog.Title>{sectionMeta?.icon} Propose Change — {sectionMeta?.label}</Dialog.Title>
			<Dialog.Close>&times;</Dialog.Close>
		</Dialog.Header>

		<div class="pe-body">
			<!-- Title & Notes -->
			<div class="fg">
				<label class="fl">Title</label>
				<input class="fi" type="text" bind:value={title} placeholder="Brief description of your change" maxlength="200" />
			</div>
			<div class="fg">
				<label class="fl">Notes <span class="fh-inline">(explain your reasoning)</span></label>
				<textarea class="fi" bind:value={notes} rows="2" placeholder="Why this change?" maxlength="2000"></textarea>
			</div>

			<Separator.Root class="pe-divider" />

			<!-- ── Text-only sections ──────────────────────────────────────── -->
			{#if isTextOnly}
				{@const textKey = section === 'overview' ? 'content' : 'general_rules'}
				<div class="fg">
					<div class="pe-toolbar">
						<ToggleGroup.Root class="pe-toggle-group" value={showPreview ? 'preview' : 'edit'} onValueChange={(v: string) => { showPreview = v === 'preview'; }}>
							<ToggleGroup.Item value="edit">Edit</ToggleGroup.Item>
							<ToggleGroup.Item value="preview">Preview</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					{#if showPreview}
						<div class="pe-preview markdown-body">{@html renderMarkdown(data[textKey] || '')}</div>
					{:else}
						<textarea class="fi fi--tall" bind:value={data[textKey]} rows="12" placeholder={section === 'overview' ? 'Describe the game...' : 'Write rules in markdown...'}></textarea>
					{/if}
				</div>

			<!-- ── Structured sections ─────────────────────────────────────── -->
			{:else}
				{#each arrayConfigs as cfg}
					<div class="pe-array-section">
						<div class="pe-array-header">
							<h4>{cfg.label}</h4>
							<Button.Root variant="outline" size="sm" onclick={() => addItem(cfg.key)}>+ Add</Button.Root>
						</div>

						{#each (data[cfg.key] || []) as item, i}
							<div class="pe-item">
								<div class="pe-item__row">
									<div class="pe-item__field pe-item__field--label">
										<label class="fl-sm">Label</label>
										<input class="fi" type="text" bind:value={item.label} placeholder="Item name" onblur={() => autoSlug(cfg.key, i)} />
									</div>
									<div class="pe-item__field pe-item__field--slug">
										<label class="fl-sm">Slug</label>
										<input class="fi slug-auto" type="text" value={item.slug} disabled />
									</div>
									<div class="pe-item__actions">
										<button class="pe-btn-icon" onclick={() => moveItem(cfg.key, i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
										<button class="pe-btn-icon" onclick={() => moveItem(cfg.key, i, 1)} disabled={i === (data[cfg.key]?.length || 0) - 1}><ChevronDown size={14} /></button>
										<button class="pe-btn-icon pe-btn-icon--danger" onclick={() => removeItem(cfg.key, i)}><X size={10} /></button>
									</div>
								</div>
								<div class="pe-item__field">
									<label class="fl-sm">Description</label>
									<textarea class="fi" bind:value={item.description} rows="2" placeholder="Describe this item..."></textarea>
								</div>
								{#if item.exceptions !== undefined || cfg.key === 'full_runs' || cfg.key === 'player_made'}
									<div class="pe-item__field">
										<label class="fl-sm">Exceptions <span class="fh-inline">(optional)</span></label>
										<textarea class="fi" bind:value={item.exceptions} rows="1" placeholder="Any exceptions..."></textarea>
									</div>
								{/if}

								<!-- Children -->
								{#if cfg.hasChildren}
									<Collapsible.Root class="pe-children">
										<Collapsible.Trigger class="pe-children-toggle">
											Sub-items ({(item.children || []).length}) <span class="pe-chevron"><ChevronRight size={12} /></span>
										</Collapsible.Trigger>
										<Collapsible.Content>
											{#each (item.children || []) as child, ci}
												<div class="pe-child">
													<div class="pe-item__row">
														<div class="pe-item__field pe-item__field--label">
															<label class="fl-sm">Label</label>
															<input class="fi" type="text" bind:value={child.label} placeholder="Sub-item" onblur={() => autoSlugChild(cfg.key, i, ci)} />
														</div>
														<div class="pe-item__field pe-item__field--slug">
															<label class="fl-sm">Slug</label>
															<input class="fi slug-auto" type="text" value={child.slug} disabled />
														</div>
														<div class="pe-item__actions">
															<button class="pe-btn-icon" onclick={() => moveChild(cfg.key, i, ci, -1)} disabled={ci === 0}><ChevronUp size={14} /></button>
															<button class="pe-btn-icon" onclick={() => moveChild(cfg.key, i, ci, 1)} disabled={ci === (item.children?.length || 0) - 1}><ChevronDown size={14} /></button>
															<button class="pe-btn-icon pe-btn-icon--danger" onclick={() => removeChild(cfg.key, i, ci)}><X size={10} /></button>
														</div>
													</div>
													<div class="pe-item__field">
														<label class="fl-sm">Description</label>
														<textarea class="fi" bind:value={child.description} rows="1" placeholder="Describe..."></textarea>
													</div>
												</div>
											{/each}
											<button class="pe-add-child" onclick={() => addChild(cfg.key, i)}>+ Add Sub-Item</button>
										</Collapsible.Content>
									</Collapsible.Root>
								{/if}
							</div>
						{/each}

						{#if !(data[cfg.key]?.length)}
							<p class="muted pe-empty">No items yet. Click + Add to start.</p>
						{/if}
					</div>
				{/each}

				<!-- Extra fields for challenges section -->
				{#if section === 'challenges'}
					<Separator.Root class="pe-divider" />
					<div class="fg">
						<label class="fl">NMG Rules</label>
						<textarea class="fi" bind:value={data.nmg_rules} rows="3" placeholder="No Major Glitches rules..."></textarea>
					</div>
					<div class="fg">
						<label class="fl">Glitch Doc Links</label>
						<textarea class="fi" bind:value={data.glitch_doc_links} rows="2" placeholder="Links to documentation..."></textarea>
					</div>
				{/if}

				<!-- Character/Difficulty column toggles -->
				{#if section === 'characters' && data.character_column}
					<Separator.Root class="pe-divider" />
					<label class="pe-toggle">
						<Switch.Root bind:checked={data.character_column.enabled} />
						Enable character column in leaderboards
					</label>
					<div class="fg">
						<label class="fl-sm">Column Label</label>
						<input class="fi" type="text" bind:value={data.character_column.label} placeholder="Character" />
					</div>
				{/if}
				{#if section === 'difficulties' && data.difficulty_column}
					<Separator.Root class="pe-divider" />
					<label class="pe-toggle">
						<Switch.Root bind:checked={data.difficulty_column.enabled} />
						Enable difficulty column in leaderboards
					</label>
					<div class="fg">
						<label class="fl-sm">Column Label</label>
						<input class="fi" type="text" bind:value={data.difficulty_column.label} placeholder="Difficulty" />
					</div>
				{/if}
			{/if}
		</div>

		<Dialog.Footer class="pe-footer">
			<Button.Root variant="accent" onclick={handleSubmit} disabled={submitting || !title.trim()}>
				{submitting ? 'Submitting...' : 'Submit Proposal'}
			</Button.Root>
			<Button.Root variant="outline" onclick={onClose}>Cancel</Button.Root>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.pe-modal) { width: 100%; max-width: 720px; max-height: 90vh; display: flex; flex-direction: column; }
	:global(.pe-header) { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
	.pe-body { padding: 1.25rem; overflow-y: auto; flex: 1; }
	:global(.pe-footer) { display: flex; gap: 0.5rem; padding: 1rem 1.25rem; border-top: 1px solid var(--border); }
	:global(.pe-divider) { margin: 1rem 0; }

	/* Form fields */
	.fg { margin-bottom: 0.85rem; }
	.fl { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem; }
	.fl-sm { display: block; font-weight: 500; font-size: 0.78rem; color: var(--muted); margin-bottom: 0.15rem; }
	.fh-inline { font-weight: 400; color: var(--muted); font-size: 0.78rem; }
	.fi { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.88rem; box-sizing: border-box; }
	.fi:focus { outline: none; border-color: var(--accent); }
	.fi--tall { min-height: 250px; resize: vertical; }
	textarea.fi { resize: vertical; }
	.slug-auto { font-family: monospace; font-size: 0.78rem; color: var(--muted); background: var(--surface); opacity: 0.7; cursor: not-allowed; }

	/* Text toolbar */
	.pe-toolbar { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; }
	:global(.pe-toggle-group) { display: flex; gap: 0.25rem; border: none; overflow: visible; }
	:global(.pe-toggle-group [data-toggle-group-item]) { padding: 0.3rem 0.6rem; background: none; border: 1px solid var(--border); border-radius: 5px; font-size: 0.82rem; cursor: pointer; color: var(--muted); font-family: inherit; }
	:global(.pe-toggle-group [data-toggle-group-item][data-state="on"]) { border-color: var(--accent); color: var(--accent); background: rgba(99, 102, 241, 0.06); }
	.pe-preview { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; min-height: 200px; max-height: 400px; overflow-y: auto; }

	/* Array sections */
	.pe-array-section { margin-bottom: 1.25rem; }
	.pe-array-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
	.pe-array-header h4 { margin: 0; font-size: 0.95rem; }
	.pe-empty { font-size: 0.85rem; padding: 0.5rem 0; }

	/* Item editor */
	.pe-item { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.5rem; }
	.pe-item__row { display: flex; gap: 0.5rem; align-items: flex-end; margin-bottom: 0.5rem; }
	.pe-item__field { flex: 1; min-width: 0; margin-bottom: 0.35rem; }
	.pe-item__field--label { flex: 2; }
	.pe-item__field--slug { flex: 1.5; }
	.pe-item__actions { display: flex; gap: 0.25rem; align-items: center; padding-bottom: 0.1rem; }
	.pe-btn-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; cursor: pointer; font-size: 0.85rem; color: var(--fg); font-family: inherit; }
	.pe-btn-icon:hover { background: rgba(255,255,255,0.06); }
	.pe-btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }
	.pe-btn-icon--danger:hover { color: #dc3545; border-color: #dc3545; }

	/* Children */
	:global(.pe-children) { margin-top: 0.5rem; }
	:global(.pe-children-toggle) { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 500; color: var(--muted); cursor: pointer; background: none; border: none; padding: 0.25rem 0; font-family: inherit; }
	:global(.pe-children-toggle:hover) { color: var(--fg); }
	:global(.pe-children-toggle .pe-chevron) { font-size: 0.65rem; transition: transform 0.15s; }
	:global(.pe-children-toggle[data-state="open"] .pe-chevron) { transform: rotate(90deg); }
	.pe-child { margin-left: 1rem; padding: 0.5rem 0.6rem; border-left: 2px solid var(--accent); background: rgba(255,255,255,0.015); border-radius: 0 4px 4px 0; margin-bottom: 0.35rem; }
	.pe-add-child { margin-left: 1rem; margin-top: 0.35rem; background: none; border: 1px dashed var(--border); border-radius: 5px; padding: 0.3rem 0.6rem; font-size: 0.78rem; color: var(--muted); cursor: pointer; font-family: inherit; }
	.pe-add-child:hover { border-color: var(--accent); color: var(--accent); }

	/* Toggle */
	.pe-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; margin-bottom: 0.75rem; cursor: pointer; }

	.muted { color: var(--muted); }

	@media (max-width: 600px) {
		.pe-item__row { flex-direction: column; align-items: stretch; }
		.pe-item__actions { justify-content: flex-end; }
	}
</style>
