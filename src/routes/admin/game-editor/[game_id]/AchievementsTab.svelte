<script lang="ts">
	import { Save, Undo2 , X } from 'lucide-svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
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
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Achievement', `Delete achievement "${item.title}"?`, () => { communityAchievements = removeItem(communityAchievements, i); }); }}><X size={14} /></button>
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
							<Select.Root bind:value={item.difficulty}>
								<Select.Trigger disabled={!canEdit}>{item.difficulty ? item.difficulty.charAt(0).toUpperCase() + item.difficulty.slice(1) : 'Easy'}</Select.Trigger>
								<Select.Content>
									{#each difficultyOptions as d}
										<Select.Item value={d} label={d.charAt(0).toUpperCase() + d.slice(1)} />
									{/each}
								</Select.Content>
							</Select.Root>
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
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron">▶</span></Collapsible.Trigger><Collapsible.Content>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">Child Selection Mode</label>
									<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; communityAchievements = [...communityAchievements]; }}>
										<Select.Trigger class="field-input field-input--short" disabled={!canEdit}>{{ single: 'Single-select', multi: 'Multi-select' }[item.child_select || 'single']}</Select.Trigger>
										<Select.Content>
											<Select.Item value="single" label="Single-select" />
											<Select.Item value="multi" label="Multi-select" />
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
										<span class="child-card__label-text">{child.title || 'Untitled'}</span>
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = (item.children || []).filter((_: any, j: number) => j !== ci); communityAchievements = [...communityAchievements]; }}><X size={14} /></button>{/if}
									</Collapsible.Trigger><Collapsible.Content>
									<div class="child-card__body">
										<div class="child-card__fields">
											{#if isLockedSlug(child.slug)}
												<div class="field-row--compact"><label>Slug</label><code class="slug-locked slug-locked--sm">{child.slug}</code></div>
											{:else}
												<div class="field-row--compact"><label>Slug</label><input type="text" value={child.slug} disabled class="slug-auto" /></div>
											{/if}
											<div class="field-row--compact"><label>Title</label><input type="text" bind:value={child.title} oninput={() => { if (!isLockedSlug(child.slug)) child.slug = slugify(child.title); }} disabled={!canEdit} /></div>
										</div>
										<div class="child-card__desc">
											<textarea rows="2" bind:value={child.description} placeholder="Description (Markdown supported)..." disabled={!canEdit}></textarea>
										</div>
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', title: '', description: '', icon: '🏆', difficulty: 'medium', requirements: [] }]; communityAchievements = [...communityAchievements]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
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
