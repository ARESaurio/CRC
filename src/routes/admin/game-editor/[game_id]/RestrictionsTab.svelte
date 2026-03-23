<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Save, Undo2 , X } from 'lucide-svelte';
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
							<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"${item.children?.length ? ' and all children' : ''}?`)) restrictionsData = removeItem(restrictionsData, i); }}><X size={14} /></button>
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
						<label class="toggle-row"><input type="checkbox" checked={!!item.exceptions} onchange={(e) => { item.exceptions = e.currentTarget.checked ? (item.exceptions || '') : undefined; restrictionsData = [...restrictionsData]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if item.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="Describe exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
						<details class="children-section">
							<summary class="children-title">Children <span class="muted">(specific variants · {(item.children || []).length})</span> <span class="children-chevron">▶</span></summary>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<select class="field-input field-input--short" value={item.child_select || 'single'} onchange={(e) => { item.child_select = e.currentTarget.value as 'single' | 'multi'; restrictionsData = [...restrictionsData]; }} disabled={!canEdit}>
										<option value="single">{m.ge_single_select()}</option>
										<option value="multi">{m.ge_multi_select()}</option>
									</select>
								</div>
							{/if}
							{#each item.children || [] as child, ci}
								<details class="child-card">
									<summary class="child-card__header">
										<span class="child-card__chevron">▶</span>
										<span class="child-card__arrow">└</span>
										<span class="child-card__slug-text">{child.slug || '(new)'}</span>
										<span class="child-card__label-text">{child.label || 'Untitled'}</span>
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = item.children!.filter((_: any, j: number) => j !== ci); restrictionsData = [...restrictionsData]; }}><X size={14} /></button>{/if}
									</summary>
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
										<label class="toggle-row toggle-row--child"><input type="checkbox" checked={!!child.exceptions} onchange={(e) => { child.exceptions = e.currentTarget.checked ? (child.exceptions || '') : undefined; restrictionsData = [...restrictionsData]; }} disabled={!canEdit} /> Has Exceptions</label>
										{#if child.exceptions != null}
											<textarea class="exceptions-textarea" rows="2" bind:value={child.exceptions} placeholder="Exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
										{/if}
									</div>
								</details>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '' }]; restrictionsData = [...restrictionsData]; }}>+ Add Child Restriction</button>{/if}
						</details>
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
