<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Save, Undo2 , X } from 'lucide-svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { slugify, addItem, removeItem, moveItem } from './_helpers.js';
	import type { Restriction } from '$types';

	let {
		restrictionsData = $bindable(),
		originalSlugs,
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		restrictionsData: Restriction[];
		originalSlugs: Set<string>;
		canEdit: boolean;
		isFrozen: boolean;
		isAdmin: boolean;
		saving: boolean;
		onSave: () => void;
		onReset: () => void;
	} = $props();

	let editingSection = $state<string | null>(null);
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

	function toggleEdit(section: string, idx: number) {
		if (editingSection === section && editingIndex === idx) { editingSection = null; editingIndex = null; }
		else { editingSection = section; editingIndex = idx; }
	}
	function isEditing(section: string, idx: number) { return editingSection === section && editingIndex === idx; }
	function isLockedSlug(slug: string) { return !!slug && originalSlugs.has(slug); }
	function isDuplicateSlug(slug: string, list: any[], excludeIndex: number) {
		if (!slug) return false;
		return list.some((item, i) => i !== excludeIndex && item.slug === slug);
	}
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<p class="subsection-desc">{m.ge_rest_desc()}</p>
	<div class="item-list">
		{#each restrictionsData as item, i}
			<div class="item-card" class:item-card--group={(item.children?.length ?? 0) > 0} class:item-card--open={isEditing('rs', i)}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit('rs', i)}>
						<span class="item-card__slug">{item.slug || '(new)'}</span>
						<span class="item-card__label">{item.label || 'Untitled'}</span>
						{#if item.children?.length}<span class="item-card__count">{item.children.length} children</span>{/if}
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { restrictionsData = moveItem(restrictionsData, i, i - 1); }} disabled={i === 0}>↑</button>
							<button class="item-btn" onclick={() => { restrictionsData = moveItem(restrictionsData, i, i + 1); }} disabled={i === restrictionsData.length - 1}>↓</button>
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Restriction', `Delete "${item.label}"${item.children?.length ? ' and all children' : ''}?`, () => { restrictionsData = removeItem(restrictionsData, i); }); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if isEditing('rs', i)}
					<div class="item-card__body">
						{#if isLockedSlug(item.slug)}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked">{item.slug}</code></div>
						{:else}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
						{/if}
						{#if isDuplicateSlug(item.slug, restrictionsData, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}
						<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
						<div class="field-row--compact"><label>{m.ge_description()}</label><textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea></div>
						<span class="field-hint">{m.ge_markdown_supported()}</span>
						<label class="toggle-row"><Switch.Root checked={!!item.exceptions} onCheckedChange={(v: boolean) => { item.exceptions = v ? (item.exceptions || '') : undefined; restrictionsData = [...restrictionsData]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if item.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="Describe exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">(specific variants · {(item.children || []).length})</span> <span class="children-chevron">▶</span></Collapsible.Trigger><Collapsible.Content>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; restrictionsData = [...restrictionsData]; }}>
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
										<span class="child-card__chevron">▶</span>
										<span class="child-card__arrow">└</span>
										<span class="child-card__slug-text">{child.slug || '(new)'}</span>
										<span class="child-card__label-text">{child.label || 'Untitled'}</span>
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = item.children!.filter((_: any, j: number) => j !== ci); restrictionsData = [...restrictionsData]; }}><X size={14} /></button>{/if}
									</Collapsible.Trigger><Collapsible.Content>
									<div class="child-card__body">
										<div class="child-card__fields">
											{#if isLockedSlug(child.slug)}
												<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked slug-locked--sm">{child.slug}</code></div>
											{:else}
												<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={child.slug} disabled class="slug-auto" /></div>
											{/if}
											<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={child.label} oninput={() => { if (!isLockedSlug(child.slug)) child.slug = slugify(child.label); }} disabled={!canEdit} /></div>
										</div>
										<div class="child-card__desc">
											<textarea rows="2" bind:value={child.description} placeholder="Description (Markdown supported)..." disabled={!canEdit}></textarea>
										</div>
										<label class="toggle-row toggle-row--child"><Switch.Root checked={!!child.exceptions} onCheckedChange={(v: boolean) => { child.exceptions = v ? (child.exceptions || '') : undefined; restrictionsData = [...restrictionsData]; }} disabled={!canEdit} /> Has Exceptions</label>
										{#if child.exceptions != null}
											<textarea class="exceptions-textarea" rows="2" bind:value={child.exceptions} placeholder="Exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
										{/if}
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '' }]; restrictionsData = [...restrictionsData]; }}>+ Add Child Restriction</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}<button class="btn btn--add" onclick={() => { restrictionsData = addItem(restrictionsData, { slug: '', label: '', description: '' }); editingSection = 'rs'; editingIndex = restrictionsData.length - 1; }}>+ Add Restriction</button>{/if}

	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Restrictions'}</button>
			<button class="btn btn--reset" onclick={onReset}>Reset</button>
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
