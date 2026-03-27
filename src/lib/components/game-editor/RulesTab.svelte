<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { renderMarkdown } from '$lib/utils/markdown';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Pencil, Eye, Save, RotateCcw } from 'lucide-svelte';

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

	let showPreview = $state(false);
</script>

<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
	<p class="subsection-desc">{m.ge_rules_hint()}</p>

	<div class="rules-toolbar">
		<ToggleGroup.Root class="preview-toggle" value={showPreview ? 'preview' : 'edit'} onValueChange={(v: string) => { showPreview = v === 'preview'; }}>
			<ToggleGroup.Item value="edit"><Pencil size={14} /> Edit</ToggleGroup.Item>
			<ToggleGroup.Item value="preview"><Eye size={14} /> Preview</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>

	{#if showPreview}
		<div class="rules-preview markdown-body">
			{#if generalRules?.trim()}
				{@html renderMarkdown(generalRules)}
			{:else}
				<p class="muted">No rules content to preview.</p>
			{/if}
		</div>
	{:else}
		<textarea class="rules-textarea" rows="30" bind:value={generalRules} disabled={!canEdit}></textarea>
	{/if}

	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{#if saving}Saving...{:else}<Save size={14} /> Save Rules{/if}</button>
			<button class="btn btn--reset" onclick={onReset}><RotateCcw size={14} /> Reset</button>
		</div>
	{/if}
</section>

<style>
	:global(.preview-toggle) { display: flex; gap: 0.25rem; border: none; overflow: visible; }
	:global(.preview-toggle [data-toggle-group-item]) { padding: 0.35rem 0.65rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; font-size: 0.82rem; cursor: pointer; color: var(--muted); font-family: inherit; }
	:global(.preview-toggle [data-toggle-group-item][data-state="on"]) { background: var(--accent); color: #fff; border-color: var(--accent); }
</style>
