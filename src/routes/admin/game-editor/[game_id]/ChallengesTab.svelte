<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Save, Undo2 , X } from 'lucide-svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { slugify, addItem, removeItem, moveItem, deepClone } from './_helpers.js';
	import type { ChallengeType, GlitchCategory } from '$types';

	const COMMON_CHALLENGES = [
		{ slug: 'hitless', label: 'Hitless', description: '' },
		{ slug: 'damageless', label: 'Damageless', description: '' },
		{ slug: 'deathless', label: 'Deathless', description: '' },
		{ slug: 'flawless', label: 'Flawless', description: '' },
		{ slug: 'blindfolded', label: 'Blindfolded', description: '' },
		{ slug: '1cc', label: '1CC', description: '' },
		{ slug: 'high-score', label: 'High Score', description: '' },
		{ slug: 'minimalist', label: 'Minimalist', description: '' },
	];

	const COMMON_GLITCHES = [
		{ slug: 'unrestricted', label: 'Unrestricted', description: 'All glitches and exploits are allowed.' },
		{ slug: 'no-major-glitches', label: 'No Major Glitches', description: 'No out-of-bounds glitches or sequence-breaking exploits.' },
		{ slug: 'glitchless', label: 'Glitchless', description: 'No glitches of any kind are allowed.' },
	];

	let {
		challengesData = $bindable(),
		glitchesData = $bindable(),
		nmgRules = $bindable(),
		glitchDocLinks = $bindable(),
		originalSlugs,
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		challengesData: ChallengeType[];
		glitchesData: GlitchCategory[];
		nmgRules: string;
		glitchDocLinks: string;
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
	<h3 class="subsection-title">{m.ge_ch_standard()}</h3>
	<p class="subsection-desc">{m.ge_ch_standard_desc()}</p>
	<div class="item-list">
		{#each challengesData as item, i}
			<div class="item-card" class:item-card--open={isEditing('ch', i)}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit('ch', i)}>
						<span class="item-card__slug">{item.slug || '(new)'}</span>
						<span class="item-card__label">{item.label || 'Untitled'}</span>
						{#if item.game_specific}<span class="badge badge--game">{m.ge_ch_game_specific()}</span>{/if}
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { challengesData = moveItem(challengesData, i, i - 1); }} disabled={i === 0}>↑</button>
							<button class="item-btn" onclick={() => { challengesData = moveItem(challengesData, i, i + 1); }} disabled={i === challengesData.length - 1}>↓</button>
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Challenge', `Delete "${item.label}"?`, () => { challengesData = removeItem(challengesData, i); }); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if isEditing('ch', i)}
					<div class="item-card__body">
						{#if isLockedSlug(item.slug)}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked">{item.slug}</code></div>
						{:else}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
						{/if}
						{#if isDuplicateSlug(item.slug, challengesData, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}
						<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
						<div class="field-row--compact"><label>{m.ge_description()}</label><textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea></div>
						<span class="field-hint">{m.ge_markdown_supported()}</span>
						<label class="toggle-row"><Switch.Root bind:checked={item.game_specific} disabled={!canEdit} /> Game-specific challenge</label>
						<label class="toggle-row"><Switch.Root checked={!!item.exceptions} onCheckedChange={(v: boolean) => { item.exceptions = v ? (item.exceptions || '') : undefined; challengesData = [...challengesData]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if item.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="Describe exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron">▶</span></Collapsible.Trigger><Collapsible.Content>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; challengesData = [...challengesData]; }}>
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
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = (item.children || []).filter((_: any, j: number) => j !== ci); challengesData = [...challengesData]; }}><X size={14} /></button>{/if}
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
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '', game_specific: true }]; challengesData = [...challengesData]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}
		{@const availableChallenges = COMMON_CHALLENGES.filter(c => !challengesData.some(d => d.slug === c.slug))}
		<div class="add-row">
			<button class="btn btn--add" onclick={() => { challengesData = addItem(challengesData, { slug: '', label: '', description: '', game_specific: true }); editingSection = 'ch'; editingIndex = challengesData.length - 1; }}>+ Add Custom Challenge</button>
			<div class="preset-dropdown">
				{#if availableChallenges.length > 0}
					<Select.Root value={''} onValueChange={(v: string) => {
						if (!v) return;
						const preset = COMMON_CHALLENGES.find(c => c.slug === v);
						if (preset && !challengesData.some(c => c.slug === preset.slug)) {
							challengesData = [...challengesData, { ...deepClone(preset), game_specific: false }];
							editingSection = 'ch'; editingIndex = challengesData.length - 1;
						}
					}}>
						<Select.Trigger class="field-input field-input--short">+ Add Standard Challenge…</Select.Trigger>
						<Select.Content>
							{#each availableChallenges as c}
								<Select.Item value={c.slug} label={c.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				{:else}
					<span class="no-options">All standard challenges added</span>
				{/if}
			</div>
		</div>
	{/if}

	<h3 class="subsection-title mt-2">{m.ge_ch_glitch_cats()}</h3>
	<p class="subsection-desc">{m.ge_ch_glitch_desc()}</p>
	<div class="item-list">
		{#each glitchesData as item, i}
			<div class="item-card" class:item-card--open={isEditing('gl', i)}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit('gl', i)}>
						<span class="item-card__slug">{item.slug || '(new)'}</span>
						<span class="item-card__label">{item.label || 'Untitled'}</span>
						{#if item.game_specific}<span class="badge badge--game">{m.ge_ch_game_specific()}</span>{/if}
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { glitchesData = moveItem(glitchesData, i, i - 1); }} disabled={i === 0}>↑</button>
							<button class="item-btn" onclick={() => { glitchesData = moveItem(glitchesData, i, i + 1); }} disabled={i === glitchesData.length - 1}>↓</button>
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Glitch Category', `Delete "${item.label}"?`, () => { glitchesData = removeItem(glitchesData, i); }); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if isEditing('gl', i)}
					<div class="item-card__body">
						{#if isLockedSlug(item.slug)}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked">{item.slug}</code></div>
						{:else}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
						{/if}
						{#if isDuplicateSlug(item.slug, glitchesData, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}
						<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
						<div class="field-row--compact"><label>{m.ge_description()}</label><textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea></div>
						<span class="field-hint">{m.ge_markdown_supported()}</span>
						<label class="toggle-row"><Switch.Root bind:checked={item.game_specific} disabled={!canEdit} /> Game-specific glitch category</label>
						<label class="toggle-row"><Switch.Root checked={!!item.exceptions} onCheckedChange={(v: boolean) => { item.exceptions = v ? (item.exceptions || '') : undefined; glitchesData = [...glitchesData]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if item.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="Describe exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
						{#if item.slug === 'no-major-glitches'}
							<div class="nmg-rules-inline">
								<div class="field-row">
									<label class="field-label">{m.ge_ch_nmg()}</label>
									<textarea class="field-input" rows="3" bind:value={nmgRules} placeholder="What qualifies as a 'major glitch' for this game?" disabled={!canEdit}></textarea>
									<span class="field-hint">{m.ge_ch_nmg_desc()}</span>
								</div>
							</div>
						{/if}
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron">▶</span></Collapsible.Trigger><Collapsible.Content>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; glitchesData = [...glitchesData]; }}>
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
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = (item.children || []).filter((_: any, j: number) => j !== ci); glitchesData = [...glitchesData]; }}><X size={14} /></button>{/if}
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
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '', game_specific: true }]; glitchesData = [...glitchesData]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}
		{@const availableGlitches = COMMON_GLITCHES.filter(c => !glitchesData.some(d => d.slug === c.slug))}
		<div class="add-row">
			<button class="btn btn--add" onclick={() => { glitchesData = addItem(glitchesData, { slug: '', label: '', description: '', game_specific: true }); editingSection = 'gl'; editingIndex = glitchesData.length - 1; }}>+ Add Custom Glitch Category</button>
			<div class="preset-dropdown">
				{#if availableGlitches.length > 0}
					<Select.Root value={''} onValueChange={(v: string) => {
						if (!v) return;
						const preset = COMMON_GLITCHES.find(c => c.slug === v);
						if (preset && !glitchesData.some(c => c.slug === preset.slug)) {
							glitchesData = [...glitchesData, { ...deepClone(preset), game_specific: false }];
							editingSection = 'gl'; editingIndex = glitchesData.length - 1;
						}
					}}>
						<Select.Trigger class="field-input field-input--short">+ Add Standard Glitch Category…</Select.Trigger>
						<Select.Content>
							{#each availableGlitches as c}
								<Select.Item value={c.slug} label={c.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				{:else}
					<span class="no-options">All standard glitch categories added</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Glitch Doc Links -->
	<div class="editor-section" style="margin-top: 1.5rem;">
		<h3 class="subsection-title">{m.ge_ch_glitch_details()}</h3>
		<div class="field-row">
			<label class="field-label">{m.ge_ch_glitch_docs()}</label>
			<textarea class="field-input" rows="2" bind:value={glitchDocLinks} placeholder="Links to glitch guides, wikis, or documentation..." disabled={!canEdit}></textarea>
		</div>
	</div>

	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Challenges & Glitches'}</button>
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
