<script lang="ts">
	import { X, Save, RotateCcw, ChevronRight, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-svelte';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as m from '$lib/paraglide/messages';
	import { addItem, removeItem, moveItem, slugify } from './_helpers.js';
	import type { CharacterColumn, CharacterOption } from '$types';

	let {
		characterColumn = $bindable(),
		charactersData = $bindable(),
		originalSlugs,
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		characterColumn: CharacterColumn;
		charactersData: CharacterOption[];
		originalSlugs: Set<string>;
		canEdit: boolean;
		isFrozen: boolean;
		isAdmin: boolean;
		saving: boolean;
		onSave: () => void;
		onReset: () => void;
	} = $props();

	let editingIndex = $state<number | null>(null);

	function toggleEdit(idx: number) {
		editingIndex = editingIndex === idx ? null : idx;
	}
	function isEditing(idx: number) { return editingIndex === idx; }
	function isLockedSlug(slug: string) { return !!slug && originalSlugs.has(slug); }
	function isDuplicateSlug(slug: string, list: any[], excludeIndex: number) {
		if (!slug) return false;
		return list.some((item: any, i: number) => i !== excludeIndex && item.slug === slug);
	}
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<div class="field-row">
		<label class="toggle-row">
			<Switch.Root bind:checked={characterColumn.enabled} disabled={!canEdit} />
			<span class="toggle-label">{m.ge_char_enable()}</span>
		</label>
	</div>
	{#if characterColumn.enabled}
		<div class="field-row">
			<label class="field-label">{m.ge_column_label()}</label>
			<input type="text" class="field-input field-input--short" bind:value={characterColumn.label} placeholder="Character / Weapon / Class..." disabled={!canEdit} />
		</div>
		<h3 class="subsection-title mt-1">{m.ge_options()}</h3>
		<div class="item-list">
			{#each charactersData as item, i}
				<div class="item-card" class:item-card--open={isEditing(i)}>
					<div class="item-card__header">
						<button class="item-card__toggle" onclick={() => toggleEdit(i)}>
							<span class="item-card__slug">{item.slug || '(new)'}</span>
							<span class="item-card__label">{item.label || 'Untitled'}</span>
						</button>
						{#if canEdit}
							<div class="item-card__actions">
								<button class="item-btn" onclick={() => { charactersData = moveItem(charactersData, i, i - 1); }} disabled={i === 0}><ChevronUp size={14} /></button>
								<button class="item-btn" onclick={() => { charactersData = moveItem(charactersData, i, i + 1); }} disabled={i === charactersData.length - 1}><ChevronDown size={14} /></button>
								<button class="item-btn item-btn--danger" onclick={() => { charactersData = removeItem(charactersData, i); }}><X size={14} /></button>
							</div>
						{/if}
					</div>
					{#if isEditing(i)}
						<div class="item-card__body">
							{#if isLockedSlug(item.slug)}
								<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked">{item.slug}</code></div>
							{:else}
								<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
							{/if}
							{#if isDuplicateSlug(item.slug, charactersData, i)}<div class="slug-warning"><AlertTriangle size={14} /> This slug already exists in this list</div>{/if}
							<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
							<Collapsible.Root class="children-section">
								<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron"><ChevronRight size={12} /></span></Collapsible.Trigger><Collapsible.Content>
								{#if (item.children || []).length > 0}
									<div class="child-select-row">
										<label class="field-label">{m.ge_child_select_mode()}</label>
										<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; charactersData = [...charactersData]; }}>
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
											{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = (item.children || []).filter((_: any, j: number) => j !== ci); charactersData = [...charactersData]; }}><X size={14} /></button>{/if}
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
										</div>
									</Collapsible.Content></Collapsible.Root>
								{/each}
								{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '' }]; charactersData = [...charactersData]; }}>+ Add Child</button>{/if}
							</Collapsible.Content></Collapsible.Root>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if canEdit}<button class="btn btn--add" onclick={() => { charactersData = addItem(charactersData, { slug: '', label: '' }); editingIndex = charactersData.length; }}>+ Add Character</button>{/if}
	{/if}
	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{#if saving}Saving...{:else}<Save size={14} /> Save Characters{/if}</button>
			<button class="btn btn--reset" onclick={onReset}><RotateCcw size={14} /> Reset</button>
		</div>
	{/if}
</section>
