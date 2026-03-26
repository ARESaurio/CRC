<script lang="ts">
	import { X, Save, RotateCcw } from 'lucide-svelte';
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

	function isLockedSlug(slug: string) { return !!slug && originalSlugs.has(slug); }
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
				<div class="item-card item-card--compact">
					<div class="item-card__header">
						<div class="item-card__inline">
							{#if isLockedSlug(item.slug)}
								<code class="slug-locked slug-locked--sm">{item.slug}</code>
							{:else}
								<input type="text" class="inline-input inline-input--slug slug-auto" value={item.slug} disabled />
							{/if}
							<input type="text" class="inline-input" bind:value={item.label} placeholder="Display Name" oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} />
						</div>
						{#if canEdit}
							<div class="item-card__actions">
								<button class="item-btn" onclick={() => { charactersData = moveItem(charactersData, i, i - 1); }} disabled={i === 0}>↑</button>
								<button class="item-btn" onclick={() => { charactersData = moveItem(charactersData, i, i + 1); }} disabled={i === charactersData.length - 1}>↓</button>
								<button class="item-btn item-btn--danger" onclick={() => { charactersData = removeItem(charactersData, i); }}><X size={14} /></button>
							</div>
						{/if}
					</div>
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron">▶</span></Collapsible.Trigger><Collapsible.Content>
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
								<div class="child-inline">
									<span class="child-inline__arrow">└</span>
									{#if isLockedSlug(child.slug)}
										<code class="slug-locked slug-locked--sm">{child.slug}</code>
									{:else}
										<input type="text" class="inline-input inline-input--slug slug-auto" value={child.slug} disabled />
									{/if}
									<input type="text" class="inline-input" bind:value={child.label} placeholder="Child name" oninput={() => { if (!isLockedSlug(child.slug)) child.slug = slugify(child.label); }} disabled={!canEdit} />
									{#if canEdit}<button class="item-btn item-btn--danger" onclick={() => { item.children = (item.children || []).filter((_: any, j: number) => j !== ci); charactersData = [...charactersData]; }}><X size={14} /></button>{/if}
								</div>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '' }]; charactersData = [...charactersData]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
			{/each}
		</div>
		{#if canEdit}<button class="btn btn--add" onclick={() => { charactersData = addItem(charactersData, { slug: '', label: '' }); }}>+ Add Character</button>{/if}
	{/if}
	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{#if saving}Saving...{:else}<Save size={14} /> Save Characters{/if}</button>
			<button class="btn btn--reset" onclick={onReset}><RotateCcw size={14} /> Reset</button>
		</div>
	{/if}
</section>

<style>
	.child-inline { display: flex; align-items: center; gap: 0.35rem; margin-left: 1rem; padding: 0.25rem 0; border-left: 2px solid var(--accent); padding-left: 0.5rem; margin-bottom: 0.2rem; }
	.child-inline__arrow { color: var(--muted); font-size: 0.75rem; }
</style>