<script lang="ts">
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { getAccessToken } from '$lib/admin';
	import { showToast } from '$stores/toast';
	import { formatDate } from '$lib/utils';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { CheckCircle, XCircle, Clock, Pencil, AlertTriangle, Trash2 } from 'lucide-svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const CLAIM_TTL_MS = 14 * 24 * 60 * 60 * 1000;

	let withdrawingId = $state<string | null>(null);
	let confirmWithdrawId = $state<string | null>(null);
	let confirmWithdrawType = $state<'run' | 'game' | 'update' | null>(null);

	// ── Tab state ──
	let activeTab = $state<'pending' | 'rejected' | 'history'>('pending');

	// ── Counts ──
	const pendingRunCount = $derived(data.pendingRuns?.length || 0);
	const pendingGameCount = $derived(data.pendingGames?.length || 0);
	const pendingUpdateCount = $derived(data.pendingUpdates?.length || 0);
	const rejectedCount = $derived(
		(data.rejectedRuns?.length || 0) +
		(data.rejectedGames?.length || 0) +
		(data.rejectedUpdates?.length || 0)
	);
	const historyCount = $derived(
		(data.approvedRuns?.length || 0) +
		(data.approvedGames?.length || 0) +
		(data.approvedUpdates?.length || 0)
	);

	function isLocked(item: any): boolean {
		return !!(item.claimed_by && item.claimed_at &&
			(Date.now() - new Date(item.claimed_at).getTime()) < CLAIM_TTL_MS);
	}

	function gameName(gameId: string): string {
		return data.gameNames?.[gameId] || gameId;
	}

	function promptWithdraw(id: string, type: 'run' | 'game' | 'update') {
		confirmWithdrawId = id;
		confirmWithdrawType = type;
	}

	function cancelWithdraw() {
		confirmWithdrawId = null;
		confirmWithdrawType = null;
	}

	async function confirmWithdrawAction() {
		if (!confirmWithdrawId || !confirmWithdrawType) return;
		const id = confirmWithdrawId;
		const type = confirmWithdrawType;
		cancelWithdraw();
		withdrawingId = id;

		try {
			if (type === 'run') {
				const token = await getAccessToken();
				if (!token) throw new Error('Not authenticated');
				const res = await fetch(`${PUBLIC_WORKER_URL}/withdraw-pending-run`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ run_id: id })
				});
				const result = await res.json();
				if (!res.ok || !result.ok) throw new Error(result.error || 'Failed to withdraw');

			} else if (type === 'game') {
				const token = await getAccessToken();
				if (!token) throw new Error('Not authenticated');
				const res = await fetch(`${PUBLIC_WORKER_URL}/withdraw-pending-game`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ game_id: id })
				});
				const result = await res.json();
				if (!res.ok || !result.ok) throw new Error(result.error || 'Failed to withdraw');

			} else if (type === 'update') {
				const { error } = await supabase
					.from('game_update_requests')
					.delete()
					.eq('id', id);
				if (error) throw error;
			}

			showToast('success', m.submissions_withdrawn_success());
			await invalidateAll();
		} catch (err: any) {
			showToast('error', err.message || 'Failed to withdraw submission');
		}

		withdrawingId = null;
	}
</script>

<svelte:head><title>{m.submissions_page_title()}</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="submissions-page">
			<h1>📋 {m.submissions_heading()}</h1>
			<p class="sub">{m.submissions_description()}</p>

			<!-- Tab bar -->
			<Tabs.Root bind:value={activeTab}>
			<Tabs.List variant="game" class="sub-tabs">
				<Tabs.Trigger variant="game" value="pending">
					{m.submissions_tab_pending()} <span class="tab-count">{pendingRunCount + pendingGameCount + pendingUpdateCount}</span>
				</Tabs.Trigger>
				<Tabs.Trigger variant="game" value="rejected">
					{m.submissions_tab_rejected()} <span class="tab-count">{rejectedCount}</span>
				</Tabs.Trigger>
				<Tabs.Trigger variant="game" value="history">
					{m.submissions_tab_history()} <span class="tab-count">{historyCount}</span>
				</Tabs.Trigger>
			</Tabs.List>
			</Tabs.Root>

			<div class="tab-body">
				<!-- ═══════ Pending Tab ═══════ -->
				{#if activeTab === 'pending'}
					{#if pendingRunCount + pendingGameCount + pendingUpdateCount === 0}
						<p class="empty">{m.submissions_no_pending_runs()}</p>
					{:else}
						<div class="card-list">
							{#each data.pendingRuns as run (run.public_id)}
								{@const locked = isLocked(run)}
								<div class="sub-card" class:locked>
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_run()}</span>
											<a href={localizeHref(`/games/${run.game_id}`)}>{gameName(run.game_id)}</a>
											— {run.category || '—'}
										</div>
										<div class="sub-card__meta">
											<span>{m.submissions_submitted()} {formatDate(run.submitted_at)}</span>
											{#if run.updated_at && run.updated_at !== run.submitted_at}
												<span class="sep">·</span>
												<span class="edited-badge">{m.submissions_updated()} {formatDate(run.updated_at)}</span>
											{/if}
										</div>
										{#if run.video_url}
											<div class="sub-card__meta">
												<a href={run.video_url} target="_blank" rel="noopener noreferrer" class="video-link">🎬 Video</a>
											</div>
										{/if}
									</div>
									<div class="sub-card__actions">
										{#if locked}
											<span class="lock-badge">🔒 {m.submissions_under_review()}</span>
										{:else}
											<a href={localizeHref(`/profile/submissions/run/${run.public_id}`)} class="btn btn--sm">{m.submissions_edit()}</a>
											<Button.Root variant="danger" size="sm" disabled={withdrawingId === run.public_id} onclick={() => promptWithdraw(run.public_id, 'run')}>{m.submissions_withdraw()}</Button.Root>
										{/if}
									</div>
								</div>
							{/each}

							{#each data.pendingGames as game (game.id)}
								{@const locked = isLocked(game)}
								<div class="sub-card" class:locked>
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_game()}</span>
											{game.game_name}
										</div>
										<div class="sub-card__meta">
											<span>{m.submissions_submitted()} {formatDate(game.submitted_at)}</span>
											{#if game.updated_at && game.updated_at !== game.submitted_at}
												<span class="sep">·</span>
												<span class="edited-badge">{m.submissions_updated()} {formatDate(game.updated_at)}</span>
											{/if}
										</div>
									</div>
									<div class="sub-card__actions">
										{#if locked}
											<span class="lock-badge">🔒 {m.submissions_under_review()}</span>
										{:else}
											<a href={localizeHref(`/profile/submissions/game/${game.id}`)} class="btn btn--sm">{m.submissions_edit()}</a>
											<Button.Root variant="danger" size="sm" disabled={withdrawingId === game.id} onclick={() => promptWithdraw(game.id, 'game')}>{m.submissions_withdraw()}</Button.Root>
										{/if}
									</div>
								</div>
							{/each}

							{#each data.pendingUpdates as upd (upd.id)}
								{@const locked = isLocked(upd)}
								<div class="sub-card" class:locked>
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_update()}</span>
											{upd.game_name || upd.game_id}
											{#if upd.section}— {upd.section}{/if}
										</div>
										<div class="sub-card__meta">
											{#if upd.update_type}<span class="tag">{upd.update_type}</span>{/if}
											<span>{m.submissions_submitted()} {formatDate(upd.created_at)}</span>
											{#if upd.updated_at && upd.updated_at !== upd.created_at}
												<span class="sep">·</span>
												<span class="edited-badge">{m.submissions_updated()} {formatDate(upd.updated_at)}</span>
											{/if}
										</div>
										{#if upd.details}
											<p class="sub-card__detail">{upd.details.length > 120 ? upd.details.slice(0, 120) + '…' : upd.details}</p>
										{/if}
									</div>
									<div class="sub-card__actions">
										{#if locked}
											<span class="lock-badge">🔒 {m.submissions_under_review()}</span>
										{:else}
											<a href={localizeHref(`/profile/submissions/update/${upd.id}`)} class="btn btn--sm">{m.submissions_edit()}</a>
											<Button.Root variant="danger" size="sm" disabled={withdrawingId === upd.id} onclick={() => promptWithdraw(upd.id, 'update')}>{m.submissions_withdraw()}</Button.Root>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}

				<!-- ═══════ Rejected Tab ═══════ -->
				{:else if activeTab === 'rejected'}
					{#if rejectedCount === 0}
						<p class="empty">{m.submissions_no_rejected()}</p>
					{:else}
						<div class="card-list">
							{#each data.rejectedRuns as run (run.public_id)}
								<div class="sub-card sub-card--rejected">
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_run()}</span>
											<a href={localizeHref(`/games/${run.game_id}`)}>{gameName(run.game_id)}</a>
											— {run.category || '—'}
										</div>
										<div class="rejection-notice">{m.submissions_rejected_message({ type: m.submissions_type_run() })}</div>
										{#if run.rejection_reason || run.reviewer_notes}
											<div class="rejection-detail">
												{#if run.rejection_reason}<p><strong>{m.submissions_rejection_reason()}:</strong> {run.rejection_reason}</p>{/if}
												{#if run.reviewer_notes}<p><strong>{m.submissions_reviewer_notes()}:</strong> {run.reviewer_notes}</p>{/if}
											</div>
										{/if}
									</div>
									<div class="sub-card__status"><span class="status-badge status-badge--rejected">{m.submissions_status_rejected()}</span></div>
								</div>
							{/each}

							{#each data.rejectedGames as game (game.id)}
								<div class="sub-card sub-card--rejected">
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_game()}</span>
											{game.game_name}
										</div>
										<div class="rejection-notice">{m.submissions_rejected_message({ type: m.submissions_type_game() })}</div>
										{#if game.rejection_reason || game.reviewer_notes}
											<div class="rejection-detail">
												{#if game.rejection_reason}<p><strong>{m.submissions_rejection_reason()}:</strong> {game.rejection_reason}</p>{/if}
												{#if game.reviewer_notes}<p><strong>{m.submissions_reviewer_notes()}:</strong> {game.reviewer_notes}</p>{/if}
											</div>
										{/if}
									</div>
									<div class="sub-card__status"><span class="status-badge status-badge--rejected">{m.submissions_status_rejected()}</span></div>
								</div>
							{/each}

							{#each data.rejectedUpdates as upd (upd.id)}
								<div class="sub-card sub-card--rejected">
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_update()}</span>
											{upd.game_name || upd.game_id}
											{#if upd.section}— {upd.section}{/if}
										</div>
										<div class="rejection-notice">{m.submissions_rejected_message({ type: m.submissions_type_update() })}</div>
									</div>
									<div class="sub-card__status"><span class="status-badge status-badge--rejected">{m.submissions_status_rejected()}</span></div>
								</div>
							{/each}
						</div>
					{/if}

				<!-- ═══════ History Tab ═══════ -->
				{:else if activeTab === 'history'}
					{#if historyCount === 0}
						<p class="empty">{m.submissions_no_history()}</p>
					{:else}
						<div class="card-list">
							{#each data.approvedRuns as run (run.public_id)}
								<div class="sub-card sub-card--approved">
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_run()}</span>
											<a href={localizeHref(`/games/${run.game_id}`)}>{gameName(run.game_id)}</a>
											— {run.category || '—'}
										</div>
										<div class="sub-card__meta"><span>{m.submissions_submitted()} {formatDate(run.submitted_at)}</span></div>
									</div>
									<div class="sub-card__status"><span class="status-badge status-badge--approved">{m.submissions_status_approved()}</span></div>
								</div>
							{/each}

							{#each data.approvedGames as game (game.id)}
								<div class="sub-card sub-card--approved">
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_game()}</span>
											{game.game_name}
										</div>
										<div class="sub-card__meta"><span>{m.submissions_submitted()} {formatDate(game.submitted_at)}</span></div>
									</div>
									<div class="sub-card__status"><span class="status-badge status-badge--approved">{m.submissions_status_approved()}</span></div>
								</div>
							{/each}

							{#each data.approvedUpdates as upd (upd.id)}
								<div class="sub-card sub-card--approved">
									<div class="sub-card__body">
										<div class="sub-card__title">
											<span class="type-label">{m.sub_type_update()}</span>
											{upd.game_name || upd.game_id}
											{#if upd.section}— {upd.section}{/if}
										</div>
										<div class="sub-card__meta"><span>{m.submissions_submitted()} {formatDate(upd.created_at)}</span></div>
									</div>
									<div class="sub-card__status"><span class="status-badge status-badge--approved">{m.submissions_status_approved()}</span></div>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	<!-- ═══════ Withdraw Confirmation Dialog ═══════ -->
	<AlertDialog.Root open={!!confirmWithdrawId} onOpenChange={(o: boolean) => { if (!o) cancelWithdraw(); }}>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Title>⚠️ {m.submissions_withdraw()}</AlertDialog.Title>
			<AlertDialog.Description>{m.submissions_withdraw_confirm()}</AlertDialog.Description>
			<div class="dialog-actions">
				<AlertDialog.Cancel>{m.btn_cancel()}</AlertDialog.Cancel>
				<AlertDialog.Action class="btn--danger" onclick={confirmWithdrawAction}>{m.submissions_withdraw()}</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
</AuthGuard>

<style>
	.submissions-page {
		max-width: 800px;
		margin: 2rem auto;
	}

	.submissions-page > h1 {
		margin: 0 0 0.25rem;
	}

	.sub {
		color: var(--muted);
		margin: 0 0 2rem;
		font-size: 0.9rem;
	}

	/* ── Sections ── */
	/* ── Tabs ── */
	.sub-tabs {
		margin-top: 1.5rem;
		margin-bottom: 0;
		flex-wrap: wrap;
		overflow-x: visible;
	}

	.tab-body {
		padding: 1.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-top: none;
		border-radius: 0 0 12px 12px;
		min-height: 120px;
	}

	.tab-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 5px;
		background: var(--border);
		border-radius: 99px;
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--muted);
		margin-left: 0.35rem;
	}

	.empty {
		color: var(--muted);
		font-size: 0.85rem;
		padding: 1.5rem 1rem;
		text-align: center;
	}

	/* ── Card list ── */
	.card-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 0 1.25rem;
	}

	.sub-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		transition: border-color 0.15s ease;
	}

	.sub-card:hover {
		border-color: color-mix(in srgb, var(--border) 50%, var(--accent));
	}

	.sub-card.locked {
		opacity: 0.7;
	}

	.sub-card--rejected {
		border-left: 3px solid #ef4444;
	}

	.sub-card--approved {
		border-left: 3px solid #22c55e;
	}

	.sub-card__body {
		flex: 1;
		min-width: 0;
	}

	.sub-card__title {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--fg);
		margin-bottom: 0.25rem;
	}

	.sub-card__title a {
		color: var(--accent);
		text-decoration: none;
	}

	.sub-card__title a:hover {
		text-decoration: underline;
	}

	.sub-card__meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.sep {
		opacity: 0.4;
	}

	.tag {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		background: rgba(99, 102, 241, 0.08);
		border-radius: 4px;
		font-size: 0.75rem;
		color: var(--accent);
		text-transform: capitalize;
	}

	.edited-badge {
		color: #f59e0b;
		font-style: italic;
	}

	.sub-card__detail {
		font-size: 0.8rem;
		color: var(--muted);
		margin: 0.35rem 0 0;
		line-height: 1.4;
	}

	.video-link {
		color: var(--accent);
		text-decoration: none;
		font-size: 0.8rem;
	}

	.video-link:hover {
		text-decoration: underline;
	}

	.type-label {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		margin-right: 0.3rem;
		background: var(--border);
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--muted);
		letter-spacing: 0.02em;
	}

	/* ── Actions ── */
	.sub-card__actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.sub-card__status {
		flex-shrink: 0;
	}

	.lock-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.65rem;
		background: rgba(245, 158, 11, 0.08);
		border: 1px solid rgba(245, 158, 11, 0.2);
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		color: #fbbf24;
		white-space: nowrap;
	}

	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.status-badge--approved {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
	}

	.status-badge--rejected {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	/* ── Rejection ── */
	.rejection-notice {
		font-size: 0.8rem;
		color: #ef4444;
		margin: 0.35rem 0;
	}

	.rejection-detail {
		font-size: 0.8rem;
		color: var(--muted);
		margin-top: 0.35rem;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.04);
		border-radius: 6px;
		border-left: 2px solid rgba(239, 68, 68, 0.3);
	}

	.rejection-detail p {
		margin: 0 0 0.25rem;
	}

	.rejection-detail p:last-child {
		margin: 0;
	}

	/* ── Buttons ── */
	.btn {
		display: inline-flex;
		align-items: center;
		padding: 0.4rem 0.85rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		text-decoration: none;
		border: 1px solid var(--border);
		background: none;
		color: var(--fg);
		font-family: inherit;
		white-space: nowrap;
	}

	.btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.btn--sm {
		padding: 0.3rem 0.7rem;
		font-size: 0.78rem;
	}

	.btn--danger {
		border-color: rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.btn--danger:hover {
		background: rgba(239, 68, 68, 0.08);
		border-color: #ef4444;
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* ── Confirm Dialog ── */
	.dialog-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	/* ── Responsive ── */
	@media (max-width: 600px) {
		.sub-card {
			flex-direction: column;
			gap: 0.6rem;
		}

		.sub-card__actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
