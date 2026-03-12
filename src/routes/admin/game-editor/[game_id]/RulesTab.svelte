<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	let {
		generalRules = $bindable(),
		canEdit,
		isFrozen,
		isAdmin,
		saving,
		onSave,
		onReset,
	}: {
		generalRules: string;
		canEdit: boolean;
		isFrozen: boolean;
		isAdmin: boolean;
		saving: boolean;
		onSave: () => void;
		onReset: () => void;
	} = $props();
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<p class="subsection-desc">{m.ge_rules_hint()}</p>
	<textarea class="rules-textarea" rows="20" bind:value={generalRules} disabled={!canEdit}></textarea>
	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : '💾 Save Rules'}</button>
			<button class="btn btn--reset" onclick={onReset}>↩ Reset</button>
		</div>
	{/if}
</section>
