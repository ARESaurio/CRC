<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Save, Undo2 , X, ChevronRight, ChevronUp, ChevronDown} from 'lucide-svelte';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { slugify, addItem, removeItem, moveItem, deepClone } from './_helpers.js';
	import type { FullRunCategory, MiniChallengeGroup, PlayerMadeChallenge, ChallengeType, GlitchCategory, Restriction, CharacterColumn, CharacterOption } from '$types';

	let {
		fullRuns = $bindable(),
		miniChallenges = $bindable(),
		playerMade = $bindable(),
		challengesData,
		restrictionsData,
		characterColumn,
		charactersData,
		originalSlugs,
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		fullRuns: FullRunCategory[];
		miniChallenges: MiniChallengeGroup[];
		playerMade: PlayerMadeChallenge[];
		challengesData: ChallengeType[];
		restrictionsData: Restriction[];
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
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<h3 class="subsection-title">{m.ge_cat_full_runs()}</h3>
	<p class="subsection-desc">{m.ge_cat_full_desc()}</p>
	<div class="item-list">
		{#each fullRuns as item, i}
			<div class="item-card" class:item-card--open={isEditing('fr', i)}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit('fr', i)}>
						<span class="item-card__slug">{item.slug || '(new)'}</span>
						<span class="item-card__label">{item.label || 'Untitled'}</span>
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { fullRuns = moveItem(fullRuns, i, i - 1); }} disabled={i === 0}><ChevronUp size={14} /></button>
							<button class="item-btn" onclick={() => { fullRuns = moveItem(fullRuns, i, i + 1); }} disabled={i === fullRuns.length - 1}><ChevronDown size={14} /></button>
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Category', `Delete "${item.label}"?`, () => { fullRuns = removeItem(fullRuns, i); }); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if isEditing('fr', i)}
					<div class="item-card__body">
						{#if isLockedSlug(item.slug)}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked">{item.slug}</code></div>
						{:else}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
						{/if}
						<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
						<div class="field-row--compact"><label>{m.ge_description()}</label><textarea rows="2" bind:value={item.description} disabled={!canEdit}></textarea></div>
						<span class="field-hint">{m.ge_markdown_supported()}</span>
						<label class="toggle-row"><Switch.Root checked={item.fixed_loadout?.enabled || false} onCheckedChange={(v: boolean) => { if (!item.fixed_loadout) item.fixed_loadout = { enabled: false }; item.fixed_loadout.enabled = v; fullRuns = [...fullRuns]; }} disabled={!canEdit} /> Fixed Loadout</label>
						{#if item.fixed_loadout?.enabled}
							<div class="fixed-loadout-fields">
								{#if characterColumn.enabled && charactersData.length}
									<div class="field-row--compact"><label>{characterColumn.label || 'Character'}</label><Select.Root value={item.fixed_loadout!.character || ''} onValueChange={(v: string) => { item.fixed_loadout!.character = v || undefined; fullRuns = [...fullRuns]; }}><Select.Trigger disabled={!canEdit}>{charactersData.find(ch => ch.slug === item.fixed_loadout?.character)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each charactersData as ch}<Select.Item value={ch.slug} label={ch.label} />{/each}</Select.Content></Select.Root></div>
								{/if}
								{#if challengesData.length}
									<div class="field-row--compact"><label>{m.ge_cat_challenge()}</label><Select.Root value={item.fixed_loadout!.challenge || ''} onValueChange={(v: string) => { item.fixed_loadout!.challenge = v || undefined; fullRuns = [...fullRuns]; }}><Select.Trigger disabled={!canEdit}>{challengesData.find(ch => ch.slug === item.fixed_loadout?.challenge)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each challengesData as ch}<Select.Item value={ch.slug} label={ch.label} />{/each}</Select.Content></Select.Root></div>
								{/if}
								{#if restrictionsData.length}
									<div class="field-row--compact"><label>{m.ge_cat_restriction()}</label><Select.Root value={item.fixed_loadout!.restriction || ''} onValueChange={(v: string) => { item.fixed_loadout!.restriction = v || undefined; fullRuns = [...fullRuns]; }}><Select.Trigger disabled={!canEdit}>{restrictionsData.find(r => r.slug === item.fixed_loadout?.restriction)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each restrictionsData as r}<Select.Item value={r.slug} label={r.label} />{/each}</Select.Content></Select.Root></div>
								{/if}
								{#if !characterColumn.enabled && !challengesData.length && !restrictionsData.length}
									<p class="field-hint">{m.ge_cat_define_first()}</p>
								{/if}
							</div>
						{/if}
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron"><ChevronRight size={12} /></span></Collapsible.Trigger><Collapsible.Content>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; fullRuns = [...fullRuns]; }}>
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
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = (item.children || []).filter((_: any, j: number) => j !== ci); fullRuns = [...fullRuns]; }}><X size={14} /></button>{/if}
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
										<label class="toggle-row toggle-row--child"><Switch.Root checked={!!child.exceptions} onCheckedChange={(v: boolean) => { child.exceptions = v ? (child.exceptions || '') : undefined; fullRuns = [...fullRuns]; }} disabled={!canEdit} /> Has Exceptions</label>
										{#if child.exceptions != null}
											<textarea class="exceptions-textarea" rows="2" bind:value={child.exceptions} placeholder="Exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
										{/if}
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '' }]; fullRuns = [...fullRuns]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}<button class="btn btn--add" onclick={() => { fullRuns = addItem(fullRuns, { slug: '', label: '', description: '', fixed_loadout: { enabled: false } }); editingSection = 'fr'; editingIndex = fullRuns.length - 1; }}>+ Add Full Run Category</button>{/if}

	<h3 class="subsection-title mt-2">{m.ge_cat_mini()}</h3>
	<p class="subsection-desc">{m.ge_cat_mini_desc()}</p>
	<div class="item-list">
		{#each miniChallenges as group, gi}
			<div class="item-card item-card--group" class:item-card--open={isEditing('mc', gi)}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit('mc', gi)}>
						<span class="item-card__slug">{group.slug || '(new)'}</span>
						<span class="item-card__label">{group.label || 'Untitled Group'}</span>
						<span class="item-card__count">{group.children?.length || 0} children</span>
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { miniChallenges = moveItem(miniChallenges, gi, gi - 1); }} disabled={gi === 0}><ChevronUp size={14} /></button>
							<button class="item-btn" onclick={() => { miniChallenges = moveItem(miniChallenges, gi, gi + 1); }} disabled={gi === miniChallenges.length - 1}><ChevronDown size={14} /></button>
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Group', `Delete group "${group.label}" and all children?`, () => { miniChallenges = removeItem(miniChallenges, gi); }); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if isEditing('mc', gi)}
					<div class="item-card__body">
						{#if isLockedSlug(group.slug)}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked">{group.slug}</code></div>
						{:else}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={group.slug} disabled class="slug-auto" /></div>
						{/if}
						<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={group.label} oninput={() => { if (!isLockedSlug(group.slug)) group.slug = slugify(group.label); }} disabled={!canEdit} /></div>
						<div class="field-row--compact"><label>{m.ge_description()}</label><textarea rows="2" bind:value={group.description} disabled={!canEdit}></textarea></div>
						<span class="field-hint">{m.ge_markdown_supported()}</span>
						<label class="toggle-row"><Switch.Root checked={!!group.exceptions} onCheckedChange={(v: boolean) => { group.exceptions = v ? (group.exceptions || '') : undefined; miniChallenges = [...miniChallenges]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if group.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={group.exceptions} placeholder="Describe exceptions to the rules above (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(group.children || []).length})</span> <span class="children-chevron"><ChevronRight size={12} /></span></Collapsible.Trigger><Collapsible.Content>
							{#if (group.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<Select.Root value={group.child_select || 'single'} onValueChange={(v: string) => { group.child_select = v as 'single' | 'multi'; miniChallenges = [...miniChallenges]; }}>
										<Select.Trigger class="field-input field-input--short" disabled={!canEdit}>{{ single: m.ge_single_select(), multi: m.ge_multi_select() }[group.child_select || 'single']}</Select.Trigger>
										<Select.Content>
											<Select.Item value="single" label={m.ge_single_select()} />
											<Select.Item value="multi" label={m.ge_multi_select()} />
										</Select.Content>
									</Select.Root>
								</div>
							{/if}
							{#each group.children || [] as child, ci}
								<Collapsible.Root class="child-card">
									<Collapsible.Trigger class="child-card__header">
										<span class="child-card__chevron"><ChevronRight size={12} /></span>
										<span class="child-card__arrow">└</span>
										<span class="child-card__slug-text">{child.slug || '(new)'}</span>
										<span class="child-card__label-text">{child.label || 'Untitled'}</span>
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); group.children = group.children.filter((_: any, j: number) => j !== ci); miniChallenges = [...miniChallenges]; }}><X size={14} /></button>{/if}
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
										<label class="toggle-row toggle-row--child"><Switch.Root checked={!!child.exceptions} onCheckedChange={(v: boolean) => { child.exceptions = v ? (child.exceptions || '') : undefined; miniChallenges = [...miniChallenges]; }} disabled={!canEdit} /> Has Exceptions</label>
										{#if child.exceptions != null}
											<textarea class="exceptions-textarea" rows="2" bind:value={child.exceptions} placeholder="Exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
										{/if}
										<label class="toggle-row toggle-row--child"><Switch.Root checked={child.fixed_loadout?.enabled || false} onCheckedChange={(v: boolean) => { if (!child.fixed_loadout) child.fixed_loadout = { enabled: false }; child.fixed_loadout.enabled = v; miniChallenges = [...miniChallenges]; }} disabled={!canEdit} /> Fixed Loadout</label>
										{#if child.fixed_loadout?.enabled}
											<div class="fixed-loadout-fields">
												{#if characterColumn.enabled && charactersData.length}
													<div class="field-row--compact"><label>{characterColumn.label || 'Character'}</label><Select.Root value={child.fixed_loadout!.character || ''} onValueChange={(v: string) => { child.fixed_loadout!.character = v || undefined; miniChallenges = [...miniChallenges]; }}><Select.Trigger disabled={!canEdit}>{charactersData.find(ch => ch.slug === child.fixed_loadout?.character)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each charactersData as ch}<Select.Item value={ch.slug} label={ch.label} />{/each}</Select.Content></Select.Root></div>
												{/if}
												{#if challengesData.length}
													<div class="field-row--compact"><label>{m.ge_cat_challenge()}</label><Select.Root value={child.fixed_loadout!.challenge || ''} onValueChange={(v: string) => { child.fixed_loadout!.challenge = v || undefined; miniChallenges = [...miniChallenges]; }}><Select.Trigger disabled={!canEdit}>{challengesData.find(ch => ch.slug === child.fixed_loadout?.challenge)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each challengesData as ch}<Select.Item value={ch.slug} label={ch.label} />{/each}</Select.Content></Select.Root></div>
												{/if}
												{#if restrictionsData.length}
													<div class="field-row--compact"><label>{m.ge_cat_restriction()}</label><Select.Root value={child.fixed_loadout!.restriction || ''} onValueChange={(v: string) => { child.fixed_loadout!.restriction = v || undefined; miniChallenges = [...miniChallenges]; }}><Select.Trigger disabled={!canEdit}>{restrictionsData.find(r => r.slug === child.fixed_loadout?.restriction)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each restrictionsData as r}<Select.Item value={r.slug} label={r.label} />{/each}</Select.Content></Select.Root></div>
												{/if}
												{#if !characterColumn.enabled && !challengesData.length && !restrictionsData.length}
													<p class="field-hint">{m.ge_cat_define_first()}</p>
												{/if}
											</div>
										{/if}
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!group.children) group.children = []; group.children = [...group.children, { slug: '', label: '', description: '', fixed_loadout: { enabled: false } }]; miniChallenges = [...miniChallenges]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}<button class="btn btn--add" onclick={() => { miniChallenges = addItem(miniChallenges, { slug: '', label: '', description: '', children: [] }); editingSection = 'mc'; editingIndex = miniChallenges.length - 1; }}>+ Add Mini-Challenge Group</button>{/if}

	<h3 class="subsection-title mt-2">{m.ge_cat_player()}</h3>
	<p class="subsection-desc">{m.ge_cat_player_desc()}</p>
	<div class="item-list">
		{#each playerMade as item, i}
			<div class="item-card" class:item-card--open={isEditing('pm', i)}>
				<div class="item-card__header">
					<button class="item-card__toggle" onclick={() => toggleEdit('pm', i)}>
						<span class="item-card__slug">{item.slug || '(new)'}</span>
						<span class="item-card__label">{item.label || 'Untitled'}</span>
					</button>
					{#if canEdit}
						<div class="item-card__actions">
							<button class="item-btn" onclick={() => { playerMade = moveItem(playerMade, i, i - 1); }} disabled={i === 0}><ChevronUp size={14} /></button>
							<button class="item-btn" onclick={() => { playerMade = moveItem(playerMade, i, i + 1); }} disabled={i === playerMade.length - 1}><ChevronDown size={14} /></button>
							<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Delete Challenge', `Delete "${item.label}"?`, () => { playerMade = removeItem(playerMade, i); }); }}><X size={14} /></button>
						</div>
					{/if}
				</div>
				{#if isEditing('pm', i)}
					<div class="item-card__body">
						{#if isLockedSlug(item.slug)}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><code class="slug-locked">{item.slug}</code></div>
						{:else}
							<div class="field-row--compact"><label>{m.ge_slug()}</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
						{/if}
						<div class="field-row--compact"><label>{m.ge_label()}</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
						<div class="field-row--compact"><label>{m.ge_description()}</label><textarea rows="2" bind:value={item.description} disabled={!canEdit}></textarea></div>
						<span class="field-hint">{m.ge_markdown_supported()}</span>
						<div class="field-row--compact"><label>{m.ge_cat_creator()}</label><input type="text" bind:value={item.creator} placeholder="Runner ID" disabled={!canEdit} /></div>
						<label class="toggle-row"><Switch.Root checked={!!item.exceptions} onCheckedChange={(v: boolean) => { item.exceptions = v ? (item.exceptions || '') : undefined; playerMade = [...playerMade]; }} disabled={!canEdit} /> Has Exceptions</label>
						{#if item.exceptions != null}
							<textarea class="exceptions-textarea" rows="2" bind:value={item.exceptions} placeholder="Describe exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
						{/if}
						<label class="toggle-row"><Switch.Root checked={item.fixed_loadout?.enabled || false} onCheckedChange={(v: boolean) => { if (!item.fixed_loadout) item.fixed_loadout = { enabled: false }; item.fixed_loadout.enabled = v; playerMade = [...playerMade]; }} disabled={!canEdit} /> Fixed Loadout</label>
						{#if item.fixed_loadout?.enabled}
							<div class="fixed-loadout-fields">
								{#if characterColumn.enabled && charactersData.length}
									<div class="field-row--compact"><label>{characterColumn.label || 'Character'}</label><Select.Root value={item.fixed_loadout!.character || ''} onValueChange={(v: string) => { item.fixed_loadout!.character = v || undefined; playerMade = [...playerMade]; }}><Select.Trigger disabled={!canEdit}>{charactersData.find(ch => ch.slug === item.fixed_loadout?.character)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each charactersData as ch}<Select.Item value={ch.slug} label={ch.label} />{/each}</Select.Content></Select.Root></div>
								{/if}
								{#if challengesData.length}
									<div class="field-row--compact"><label>{m.ge_cat_challenge()}</label><Select.Root value={item.fixed_loadout!.challenge || ''} onValueChange={(v: string) => { item.fixed_loadout!.challenge = v || undefined; playerMade = [...playerMade]; }}><Select.Trigger disabled={!canEdit}>{challengesData.find(ch => ch.slug === item.fixed_loadout?.challenge)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each challengesData as ch}<Select.Item value={ch.slug} label={ch.label} />{/each}</Select.Content></Select.Root></div>
								{/if}
								{#if restrictionsData.length}
									<div class="field-row--compact"><label>{m.ge_cat_restriction()}</label><Select.Root value={item.fixed_loadout!.restriction || ''} onValueChange={(v: string) => { item.fixed_loadout!.restriction = v || undefined; playerMade = [...playerMade]; }}><Select.Trigger disabled={!canEdit}>{restrictionsData.find(r => r.slug === item.fixed_loadout?.restriction)?.label || '— Not fixed —'}</Select.Trigger><Select.Content><Select.Item value="" label="— Not fixed —" />{#each restrictionsData as r}<Select.Item value={r.slug} label={r.label} />{/each}</Select.Content></Select.Root></div>
								{/if}
								{#if !characterColumn.enabled && !challengesData.length && !restrictionsData.length}
									<p class="field-hint">{m.ge_cat_define_first()}</p>
								{/if}
							</div>
						{/if}
						<Collapsible.Root class="children-section">
							<Collapsible.Trigger class="children-title">Children <span class="muted">({(item.children || []).length})</span> <span class="children-chevron"><ChevronRight size={12} /></span></Collapsible.Trigger><Collapsible.Content>
							{#if (item.children || []).length > 0}
								<div class="child-select-row">
									<label class="field-label">{m.ge_child_select_mode()}</label>
									<Select.Root value={item.child_select || 'single'} onValueChange={(v: string) => { item.child_select = v as 'single' | 'multi'; playerMade = [...playerMade]; }}>
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
										{#if canEdit}<button class="item-btn item-btn--danger" onclick={(e) => { e.stopPropagation(); item.children = (item.children || []).filter((_: any, j: number) => j !== ci); playerMade = [...playerMade]; }}><X size={14} /></button>{/if}
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
										<label class="toggle-row toggle-row--child"><Switch.Root checked={!!child.exceptions} onCheckedChange={(v: boolean) => { child.exceptions = v ? (child.exceptions || '') : undefined; playerMade = [...playerMade]; }} disabled={!canEdit} /> Has Exceptions</label>
										{#if child.exceptions != null}
											<textarea class="exceptions-textarea" rows="2" bind:value={child.exceptions} placeholder="Exceptions (Markdown supported)..." disabled={!canEdit}></textarea>
										{/if}
									</div>
								</Collapsible.Content></Collapsible.Root>
							{/each}
							{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '' }]; playerMade = [...playerMade]; }}>+ Add Child</button>{/if}
						</Collapsible.Content></Collapsible.Root>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if canEdit}<button class="btn btn--add" onclick={() => { playerMade = addItem(playerMade, { slug: '', label: '', description: '', fixed_loadout: { enabled: false } }); editingSection = 'pm'; editingIndex = playerMade.length - 1; }}>+ Add Player-Made Category</button>{/if}

	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Categories'}</button>
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
