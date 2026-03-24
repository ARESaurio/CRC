<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import * as Switch from '$lib/components/ui/switch/index.js';
	let {
		additionalTabs = $bindable(),
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		additionalTabs: { tab1: { enabled: boolean; title: string; content: string }; tab2: { enabled: boolean; title: string; content: string } };
		canEdit: boolean;
		isFrozen: boolean;
		isAdmin: boolean;
		saving: boolean;
		onSave: () => void;
		onReset: () => void;
	} = $props();
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<h3 class="subsection-title">{m.ge_custom_heading()}</h3>
	<p class="subsection-desc">{m.ge_custom_desc()}</p>

	<div class="custom-tab-config">
		<div class="custom-tab-config__item">
			<label class="toggle-row">
				<Switch.Root bind:checked={additionalTabs.tab1.enabled} disabled={!canEdit} />
				<span class="toggle-label">{m.ge_custom_tab1()}</span>
			</label>
			{#if additionalTabs.tab1.enabled}
				<div class="field-row mt-1">
					<label class="field-label">{m.ge_custom_tab_title()}</label>
					<input type="text" class="field-input field-input--short" bind:value={additionalTabs.tab1.title} placeholder="e.g. Paths, Strategies, Resources..." disabled={!canEdit} />
				</div>
			{/if}
		</div>
		<div class="custom-tab-config__item mt-2">
			<label class="toggle-row">
				<Switch.Root bind:checked={additionalTabs.tab2.enabled} disabled={!canEdit} />
				<span class="toggle-label">{m.ge_custom_tab2()}</span>
			</label>
			{#if additionalTabs.tab2.enabled}
				<div class="field-row mt-1">
					<label class="field-label">{m.ge_custom_tab_title()}</label>
					<input type="text" class="field-input field-input--short" bind:value={additionalTabs.tab2.title} placeholder="e.g. Routes, Tier Lists..." disabled={!canEdit} />
				</div>
			{/if}
		</div>
	</div>

	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : '💾 Save Tab Settings'}</button>
			<button class="btn btn--reset" onclick={onReset}>↩ Reset</button>
		</div>
	{/if}
</section>
