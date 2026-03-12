<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { addItem, removeItem, moveItem, slugify } from './_helpers.js';
	import type { DifficultyColumn, DifficultyOption } from '$types';

	let {
		difficultyColumn = $bindable(),
		difficultiesData = $bindable(),
		originalSlugs,
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		difficultyColumn: DifficultyColumn;
		difficultiesData: DifficultyOption[];
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
			<input type="checkbox" bind:checked={difficultyColumn.enabled} disabled={!canEdit} />
			<span>{m.ge_diff_enable()}</span>
		</label>
	</div>
	{#if difficultyColumn.enabled}
		<div class="field-row">
			<label class="field-label">{m.ge_column_label()}</label>
			<input type="text" class="field-input field-input--short" bind:value={difficultyColumn.label} placeholder="Difficulty / Mode / NG Cycle..." disabled={!canEdit} />
		</div>
		<h3 class="subsection-title mt-1">{m.ge_options()}</h3>
		<div class="item-list">
			{#each difficultiesData as item, i}
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
								<button class="item-btn" onclick={() => { difficultiesData = moveItem(difficultiesData, i, i - 1); }} disabled={i === 0}>↑</button>
								<button class="item-btn" onclick={() => { difficultiesData = moveItem(difficultiesData, i, i + 1); }} disabled={i === difficultiesData.length - 1}>↓</button>
								<button class="item-btn item-btn--danger" onclick={() => { difficultiesData = removeItem(difficultiesData, i); }}>✕</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
		{#if canEdit}<button class="btn btn--add" onclick={() => { difficultiesData = addItem(difficultiesData, { slug: '', label: '' }); }}>+ Add Difficulty</button>{/if}
	{/if}
	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : '💾 Save Difficulties'}</button>
			<button class="btn btn--reset" onclick={onReset}>↩ Reset</button>
		</div>
	{/if}
</section>
