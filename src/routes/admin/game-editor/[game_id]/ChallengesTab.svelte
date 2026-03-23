<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Save, Undo2 , X } from 'lucide-svelte';
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
							<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"?`)) challengesData = removeItem(challengesData, i); }}><X size={14} /></button>
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
						<label class="toggle-row"><input type="checkbox" bind:checked={item.game_specific} disabled={!canEdit} /> Game-specific challenge</label>
						<label class="toggle-row"><input type="checkbox" checked={!!item.exceptions} onchange={(e) => { item.exceptions = e.currentTarget.checked ? (item.exceptions || '') : undefined; challengesData = [...challengesData]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if item.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="Describe exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}
		<div class="add-row">
			<button class="btn btn--add" onclick={() => { challengesData = addItem(challengesData, { slug: '', label: '', description: '', game_specific: true }); editingSection = 'ch'; editingIndex = challengesData.length - 1; }}>+ Add Custom Challenge</button>
			<div class="preset-dropdown">
				<select class="field-input field-input--short" onchange={(e) => {
					const sel = (e.target as HTMLSelectElement).value;
					if (!sel) return;
					const preset = COMMON_CHALLENGES.find(c => c.slug === sel);
					if (preset && !challengesData.some(c => c.slug === preset.slug)) {
						challengesData = [...challengesData, { ...deepClone(preset), game_specific: false }];
						editingSection = 'ch'; editingIndex = challengesData.length - 1;
					}
					(e.target as HTMLSelectElement).value = '';
				}}>
					<option value="">+ Add common challenge…</option>
					{#each COMMON_CHALLENGES.filter(c => !challengesData.some(d => d.slug === c.slug)) as c}
						<option value={c.slug}>{c.label}</option>
					{/each}
				</select>
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
							<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"?`)) glitchesData = removeItem(glitchesData, i); }}><X size={14} /></button>
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
						<label class="toggle-row"><input type="checkbox" bind:checked={item.game_specific} disabled={!canEdit} /> Game-specific glitch category</label>
						<label class="toggle-row"><input type="checkbox" checked={!!item.exceptions} onchange={(e) => { item.exceptions = e.currentTarget.checked ? (item.exceptions || '') : undefined; glitchesData = [...glitchesData]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if item.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="Describe exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}
		<div class="add-row">
			<button class="btn btn--add" onclick={() => { glitchesData = addItem(glitchesData, { slug: '', label: '', description: '', game_specific: true }); editingSection = 'gl'; editingIndex = glitchesData.length - 1; }}>+ Add Custom Glitch Category</button>
			<div class="preset-dropdown">
				<select class="field-input field-input--short" onchange={(e) => {
					const sel = (e.target as HTMLSelectElement).value;
					if (!sel) return;
					const preset = COMMON_GLITCHES.find(c => c.slug === sel);
					if (preset && !glitchesData.some(c => c.slug === preset.slug)) {
						glitchesData = [...glitchesData, { ...deepClone(preset), game_specific: false }];
						editingSection = 'gl'; editingIndex = glitchesData.length - 1;
					}
					(e.target as HTMLSelectElement).value = '';
				}}>
					<option value="">+ Add common glitch category…</option>
					{#each COMMON_GLITCHES.filter(c => !glitchesData.some(d => d.slug === c.slug)) as c}
						<option value={c.slug}>{c.label}</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}

	<!-- NMG Rules & Glitch Doc Links -->
	<div class="editor-section" style="margin-top: 1.5rem;">
		<h3 class="subsection-title">{m.ge_ch_glitch_details()}</h3>
		<div class="field-row">
			<label class="field-label">{m.ge_ch_nmg()}</label>
			<textarea class="field-input" rows="3" bind:value={nmgRules} placeholder="What qualifies as a 'major glitch' for this game?" disabled={!canEdit}></textarea>
			<span class="field-hint">{m.ge_ch_nmg_desc()}</span>
		</div>
		<div class="field-row" style="margin-top: 0.75rem;">
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
