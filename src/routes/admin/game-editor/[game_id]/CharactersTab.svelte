<script lang="ts">
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
			<input type="checkbox" bind:checked={characterColumn.enabled} disabled={!canEdit} />
			<span>{m.ge_char_enable()}</span>
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
								<button class="item-btn item-btn--danger" onclick={() => { charactersData = removeItem(charactersData, i); }}>✕</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
		{#if canEdit}<button class="btn btn--add" onclick={() => { charactersData = addItem(charactersData, { slug: '', label: '' }); }}>+ Add Character</button>{/if}
	{/if}
	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : '💾 Save Characters'}</button>
			<button class="btn btn--reset" onclick={onReset}>↩ Reset</button>
		</div>
	{/if}
</section>
