<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	let {
		tabData = $bindable(),
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		tabData: { enabled: boolean; title: string; content: string };
		canEdit: boolean;
		isFrozen: boolean;
		isAdmin: boolean;
		saving: boolean;
		onSave: () => void;
		onReset: () => void;
	} = $props();
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<h3 class="subsection-title">{tabData.title || 'Additional Tab'}</h3>
	<p class="subsection-desc">{m.ge_additional_hint()}</p>
	<textarea class="rules-textarea" rows="20" bind:value={tabData.content} disabled={!canEdit}></textarea>
	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : '💾 Save'}</button>
			<button class="btn btn--reset" onclick={onReset}>↩ Reset</button>
		</div>
	{/if}
</section>
