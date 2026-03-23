<script lang="ts">
	import { Save, Undo2 } , X } from 'lucide-svelte';
	import { slugify, addItem, removeItem, moveItem } from './_helpers.js';
	import type { CommunityAchievementDef } from '$types';

	let {
		communityAchievements = $bindable(),
		originalSlugs,
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		communityAchievements: CommunityAchievementDef[];
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
	function isLockedSlug(slug: string) { return !!slug && originalSlugs.has(slug); }
	function isDuplicateSlug(slug: string, list: any[], excludeIndex: number) {
		if (!slug) return false;
		return list.some((item, i) => i !== excludeIndex && item.slug === slug);
	}

	const difficultyOptions: CommunityAchievementDef['difficulty'][] = ['easy', 'medium', 'hard', 'legendary'];

	function addRequirement(ach: CommunityAchievementDef) {
		ach.requirements = [...(ach.requirements || []), ''];
		communityAchievements = [...communityAchievements];
	}
	function removeRequirement(ach: CommunityAchievementDef, ri: number) {
		ach.requirements = ach.requirements.filter((_, i) => i !== ri);
		communityAchievements = [...communityAchievements];
	}
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<p class="subsection-desc">Community achievements that runners can earn for this game. These appear on runner profiles when verified.</p>
	<div class="item-list">
		{#each communityAchievements as item, i}
			<div class="item-card" class:item-card--open={editingIndex === i}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit(i)}>
						<span class="item-card__slug">{item.icon || '🏆'} {item.slug || '(new)'}</span>
						<span class="item-card__label">{item.title || 'Untitled'}</span>
						{#if item.difficulty}
							<span class="difficulty difficulty--{item.difficulty}">{item.difficulty}</span>
						{/if}
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { communityAchievements = moveItem(communityAchievements, i, i - 1); }} disabled={i === 0}>↑</button>
							<button class="item-btn" onclick={() => { communityAchievements = moveItem(communityAchievements, i, i + 1); }} disabled={i === communityAchievements.length - 1}>↓</button>
							<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete achievement "${item.title}"?`)) communityAchievements = removeItem(communityAchievements, i); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if editingIndex === i}
					<div class="item-card__body">
						{#if isLockedSlug(item.slug)}
							<div class="field-row--compact"><label>Slug</label><code class="slug-locked">{item.slug}</code></div>
						{:else}
							<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
						{/if}
						{#if isDuplicateSlug(item.slug, communityAchievements, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}

						<div class="field-row--compact">
							<label>Title</label>
							<input type="text" bind:value={item.title} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.title); }} disabled={!canEdit} />
						</div>

						<div class="field-row--compact">
							<label>Icon</label>
							<input type="text" bind:value={item.icon} placeholder="🏆" disabled={!canEdit} style="max-width: 80px;" />
						</div>

						<div class="field-row--compact">
							<label>Difficulty</label>
							<select bind:value={item.difficulty} disabled={!canEdit}>
								{#each difficultyOptions as d}
									<option value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
								{/each}
							</select>
						</div>

						<div class="field-row--compact">
							<label>Description</label>
							<textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea>
						</div>
						<span class="field-hint">Markdown supported</span>

						<div class="field-row--compact">
							<label>Total Required</label>
							<input type="number" bind:value={item.total_required} min="0" placeholder="Leave empty if not tracked" disabled={!canEdit} style="max-width: 120px;" />
						</div>
						<span class="field-hint">Optional. Number of completions needed (e.g., for progressive achievements).</span>

						<div class="requirements-section">
							<label class="field-label">Requirements</label>
							{#each item.requirements || [] as req, ri}
								<div class="requirement-row">
									<input type="text" value={req} oninput={(e) => { item.requirements[ri] = e.currentTarget.value; communityAchievements = [...communityAchievements]; }} placeholder="Requirement..." disabled={!canEdit} />
									{#if canEdit}<button class="item-btn item-btn--danger" onclick={() => removeRequirement(item, ri)}><X size={14} /></button>{/if}
								</div>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => addRequirement(item)}>+ Add Requirement</button>{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}
		<button class="btn btn--add" onclick={() => {
			communityAchievements = addItem(communityAchievements, {
				slug: '', title: '', description: '', icon: '🏆',
				difficulty: 'medium', requirements: [], total_required: undefined
			});
			editingIndex = communityAchievements.length - 1;
		}}>+ Add Achievement</button>
	{/if}

	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Achievements'}</button>
			<button class="btn btn--reset" onclick={onReset}>Reset</button>
		</div>
	{/if}
</section>
