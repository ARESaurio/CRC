<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Save, Undo2, RotateCcw, RefreshCw } from 'lucide-svelte';
	import { fmtDate } from '$lib/components/game-editor/_helpers.js';
	import * as Button from '$lib/components/ui/button/index.js';

	let {
		snapshots = $bindable(),
		snapshotsLoading = $bindable(),
		rollbackConfirm = $bindable(),
		isAdmin,
		saving,
		onRollback,
		onRefresh,
	}: {
		snapshots: any[];
		snapshotsLoading: boolean;
		rollbackConfirm: string | null;
		isAdmin: boolean;
		saving: boolean;
		onRollback: (id: string) => void;
		onRefresh: () => void;
	} = $props();
</script>

<section class="editor-section">
	<h3 class="subsection-title">{m.ge_history_snapshots()}</h3>
	<p class="subsection-desc">{m.ge_history_desc()}</p>

	{#if snapshotsLoading}
		<div class="center-sm"><div class="spinner spinner--sm"></div></div>
	{:else if snapshots.length === 0}
		<div class="empty-sm"><p class="muted">{m.ge_history_empty()}</p></div>
	{:else}
		<div class="snapshot-list">
			{#each snapshots as snap}
				<div class="snapshot-row" class:snapshot-row--active={rollbackConfirm === snap.id}>
					<div class="snapshot-row__info">
						<span class="snapshot-row__date">{fmtDate(snap.created_at)}</span>
						<span class="snapshot-row__desc">{snap.description || 'Manual save'}</span>
					</div>
					<div class="snapshot-row__actions">
						{#if isAdmin}
							{#if rollbackConfirm === snap.id}
								<button class="btn btn--small btn--save" onclick={() => onRollback(snap.id)} disabled={saving}>{saving ? '...' : 'Confirm Rollback'}</button>
								<Button.Root size="sm" onclick={() => rollbackConfirm = null}>{m.ge_cancel()}</Button.Root>
							{:else}
								<button class="btn btn--small btn--rollback" onclick={() => rollbackConfirm = snap.id}><RotateCcw size={14} /> Rollback</button>
							{/if}
						{:else}
							<span class="muted" style="font-size:0.8rem;">{m.ge_history_admin_req()}</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="section-actions">
		<Button.Root onclick={onRefresh} disabled={snapshotsLoading}>{#if snapshotsLoading}Loading...{:else}<RefreshCw size={14} /> Refresh{/if}</Button.Root>
	</div>
</section>
