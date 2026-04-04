<script lang="ts">
	import { Save, RotateCcw, X, ChevronRight, ChevronUp, ChevronDown} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as m from '$lib/paraglide/messages';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { slugify, addItem, removeItem, moveItem } from '$lib/components/game-editor/_helpers.js';
	import type { AdditionalTabData } from '$types';

	let {
		tabData = $bindable(),
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		tabData: AdditionalTabData;
		canEdit: boolean;
		isFrozen: boolean;
		isAdmin: boolean;
		saving: boolean;
		onSave: () => void;
		onReset: () => void;
	} = $props();

	// Ensure items array exists
	if (!tabData.items) tabData.items = [];

	let editingIndex = $state<number | null>(null);

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

	function toggleEdit(idx: number) {
		if (editingIndex === idx) { editingIndex = null; }
		else { editingIndex = idx; }
	}
	function isEditing(idx: number) { return editingIndex === idx; }
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<h3 class="subsection-title">{tabData.title || 'Additional Tab'}</h3>
	<p class="subsection-desc">{m.ge_additional_hint()}</p>

	<!-- Parent-child item list -->
	<h3 class="subsection-title mt-1">Items</h3>
	<p class="subsection-desc">Add structured items with optional children for this tab.</p>
	<div class="item-list">
		{#each tabData.items || [] as item, i}
			<div class="item-card" class:item-card--open={isEditing(i)}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit(i)}>
						<span class="item-card__slug">{item.slug || '(new)'}</span>
						<span class="item-card__label">{item.label || 'Untitled'}</span>
						{#if item.children?.length}<span class="item-card__count">{item.children.length} children</span>{/if}
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { tabData.items = moveItem(tabData.items!, i, i - 1); }} disabled={i === 0}><ChevronUp size={14} /></button>
							<button class="item-btn" onclick={() => { tabData.items = moveItem(tabData.items!, i, i + 1); }} disabled={i === (tabData.items?.length ?? 1) - 1}><ChevronDown size={14} /></button>
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Item', `Delete "${item.label}"?`, () => { tabData.items = removeItem(tabData.items!, i); }); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if isEditing(i)}
					<div class="item-card__body">
						<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
						<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={item.label} oninput={() => { item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
						<div class="field-row--compact"><label>{m.ge_description()}</label><textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea></div>
						<span class="field-hint">{m.ge_markdown_supported()}</span>
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron"><ChevronRight size={12} /></span></Collapsible.Trigger><Collapsible.Content>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; tabData.items = [...(tabData.items || [])]; }}>
										<Select.Trigger class="field-input field-input--short" disabled={!canEdit}>{{ single: m.ge_single_select(), multi: m.ge_multi_select() }[item.child_select || 'single']}</Select.Trigger>
										<Select.Content>
											<Select.Item value="single" label={m.ge_single_select()} />
											<Select.Item value="multi" label={m.ge_multi_select()} />
										</Select.Content>
									</Select.Root>
								</div>
							{/if}
							{#each item.children || [] as child, ci}
								<Collapsible.Root class="child-card">
									<Collapsible.Trigger class="child-card__header">
										<span class="child-card__chevron"><ChevronRight size={12} /></span>
										<span class="child-card__arrow">└</span>
										<span class="child-card__slug-text">{child.slug || '(new)'}</span>
										<span class="child-card__label-text">{child.label || 'Untitled'}</span>
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = (item.children || []).filter((_: any, j: number) => j !== ci); tabData.items = [...(tabData.items || [])]; }}><X size={14} /></button>{/if}
									</Collapsible.Trigger><Collapsible.Content>
									<div class="child-card__body">
										<div class="child-card__fields">
											<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={child.slug} disabled class="slug-auto" /></div>
											<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={child.label} oninput={() => { child.slug = slugify(child.label); }} disabled={!canEdit} /></div>
										</div>
										<div class="child-card__desc">
											<textarea rows="2" bind:value={child.description} placeholder="Description (Markdown supported)..." disabled={!canEdit}></textarea>
										</div>
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '' }]; tabData.items = [...(tabData.items || [])]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}<button class="btn btn--add" onclick={() => { if (!tabData.items) tabData.items = []; tabData.items = addItem(tabData.items, { slug: '', label: '', description: '' }); editingIndex = tabData.items.length - 1; }}>+ Add Item</button>{/if}

	<!-- Freeform content area -->
	<h3 class="subsection-title mt-2">Freeform Content</h3>
	<p class="subsection-desc">Additional markdown content for this tab (displayed below items).</p>
	<textarea class="rules-textarea" rows="10" bind:value={tabData.content} disabled={!canEdit}></textarea>

	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{#if saving}Saving...{:else}<Save size={14} /> Save{/if}</button>
			<button class="btn btn--reset" onclick={onReset}><RotateCcw size={14} /> Reset</button>
		</div>
	{/if}
</section>

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
