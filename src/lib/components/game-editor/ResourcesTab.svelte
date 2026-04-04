<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { X, ChevronUp, ChevronDown} from 'lucide-svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import type { GameResource } from '$types';

	let {
		resourcesData = $bindable(),
		canEdit,
		saving,
		onSave,
		onReset,
	}: {
		resourcesData: GameResource[];
		canEdit: boolean;
		saving: boolean;
		onSave: () => void;
		onReset: () => void;
	} = $props();

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

	function addResource() {
		resourcesData = [...resourcesData, { name: '', url: '', description: '', type: 'guide' }];
	}

	function removeResource(idx: number) {
		openConfirm('Remove Resource', `Remove "${resourcesData[idx]?.name || 'this resource'}"?`, () => {
			resourcesData = resourcesData.filter((_, i) => i !== idx);
		});
	}

	function moveResource(idx: number, dir: -1 | 1) {
		const target = idx + dir;
		if (target < 0 || target >= resourcesData.length) return;
		const arr = [...resourcesData];
		[arr[idx], arr[target]] = [arr[target], arr[idx]];
		resourcesData = arr;
	}

	const RESOURCE_TYPES = ['guide', 'documentation', 'tool', 'video', 'spreadsheet', 'discord', 'other'];
</script>

<section class="editor-section">
	<p class="subsection-desc">Community resources like guides, documentation, tools, and links displayed on the Resources tab.</p>

	{#if resourcesData.length === 0}
		<div class="empty-state">
			<p class="muted">No resources yet.</p>
		</div>
	{/if}

	{#each resourcesData as resource, i}
		<div class="resource-card card">
			<div class="resource-card__header">
				<span class="resource-card__num">#{i + 1}</span>
				{#if canEdit}
					<div class="resource-card__actions">
						{#if i > 0}
							<button class="btn btn--xs" onclick={() => moveResource(i, -1)}><ChevronUp size={14} /></button>
						{/if}
						{#if i < resourcesData.length - 1}
							<button class="btn btn--xs" onclick={() => moveResource(i, 1)}><ChevronDown size={14} /></button>
						{/if}
						<button class="btn btn--xs btn--danger-text" onclick={() => removeResource(i)}><X size={14} /></button>
					</div>
				{/if}
			</div>
			<div class="resource-card__fields">
				<div class="field-row">
					<label class="field-label">Name</label>
					<input type="text" class="field-input" bind:value={resource.name} placeholder="e.g. Glitch Documentation" disabled={!canEdit} maxlength="200" />
				</div>
				<div class="field-row">
					<label class="field-label">URL</label>
					<input type="url" class="field-input" bind:value={resource.url} placeholder="https://..." disabled={!canEdit} maxlength="500" />
				</div>
				<div class="field-row">
					<label class="field-label">Description</label>
					<input type="text" class="field-input" bind:value={resource.description} placeholder="Short description (optional)" disabled={!canEdit} maxlength="300" />
				</div>
				<div class="field-row">
					<label class="field-label">Type</label>
					<select class="field-input" bind:value={resource.type} disabled={!canEdit} style="max-width: 14rem;">
						{#each RESOURCE_TYPES as t}
							<option value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	{/each}

	{#if canEdit}
		<button class="btn btn--add" onclick={addResource}>+ Add Resource</button>
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Resources'}</button>
			<button class="btn btn--reset" onclick={onReset}>Reset</button>
		</div>
	{/if}
</section>

<!-- Confirm dialog -->
<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="confirm-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleConfirmAction}>Confirm</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.resource-card { margin-bottom: 0.75rem; padding: 1rem; }
	.resource-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
	.resource-card__num { font-weight: 600; font-size: 0.85rem; color: var(--muted); }
	.resource-card__actions { display: flex; gap: 0.25rem; }
	.resource-card__fields { display: flex; flex-direction: column; gap: 0.5rem; }
	.empty-state { text-align: center; padding: 1.5rem; }
	.confirm-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
</style>
