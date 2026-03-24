<script lang="ts">
	import { Lock, CheckCircle, XCircle } from 'lucide-svelte';
	import { adminAction } from '$lib/admin';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { formatDate } from '$lib/utils';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { data } = $props();

	let suggestions = $state(data.suggestions);
	let statusFilter = $state<string>('pending');
	let gameFilter = $state<string>('');
	let processingId = $state<string | null>(null);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// ── Response modal ──────────────────────────────────────────────────
	let modalOpen = $state(false);
	let modalSuggestion = $state<any>(null);
	let modalAction = $state<'accepted' | 'rejected' | 'noted'>('accepted');
	let modalResponse = $state('');

	const filtered = $derived.by(() => {
		let result = suggestions;
		if (statusFilter !== 'all') result = result.filter((s: any) => s.status === statusFilter);
		if (gameFilter) result = result.filter((s: any) => s.game_id === gameFilter);
		return result;
	});

	const gameOptions = $derived.by(() => {
		const ids = [...new Set(suggestions.map((s: any) => s.game_id).filter(Boolean))].sort();
		return ids;
	});

	const pendingCount = $derived(suggestions.filter((s: any) => s.status === 'pending').length);

	function openReviewModal(s: any, action: 'accepted' | 'rejected' | 'noted') {
		modalSuggestion = s;
		modalAction = action;
		modalResponse = '';
		modalOpen = true;
	}

	async function confirmReview() {
		if (!modalSuggestion) return;
		processingId = modalSuggestion.id;
		toast = null;

		const result = await adminAction('/admin/review-rule-suggestion', {
			suggestion_id: modalSuggestion.id,
			status: modalAction,
			admin_response: modalResponse.trim() || null,
		});

		if (result.ok) {
			suggestions = suggestions.map((s: any) =>
				s.id === modalSuggestion.id
					? { ...s, status: modalAction, admin_response: modalResponse.trim() || null }
					: s
			);
			toast = { type: 'success', text: `Suggestion ${modalAction}.` };
		} else {
			toast = { type: 'error', text: result.message };
		}

		modalOpen = false;
		processingId = null;
		setTimeout(() => toast = null, 3000);
	}

	function fmtGame(id: string): string {
		return (id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}
</script>

<svelte:head><title>Rule Suggestions | Admin</title></svelte:head>

<div class="suggestions-page">
	<div class="suggestions-header">
		<h1>💬 Rule Suggestions</h1>
		<p class="muted">Community-submitted rule change suggestions. {pendingCount} pending.</p>
	</div>

	{#if toast}
		<div class="toast toast--{toast.type}">{toast.text}</div>
	{/if}

	<!-- Filters -->
	<div class="filters">
		<div class="filter-tabs">
			<button class="filter-tab" class:active={statusFilter === 'pending'} onclick={() => statusFilter = 'pending'}>
				Pending ({suggestions.filter((s) => s.status === 'pending').length})
			</button>
			<button class="filter-tab" class:active={statusFilter === 'accepted'} onclick={() => statusFilter = 'accepted'}>
				Accepted ({suggestions.filter((s) => s.status === 'accepted').length})
			</button>
			<button class="filter-tab" class:active={statusFilter === 'noted'} onclick={() => statusFilter = 'noted'}>
				Noted ({suggestions.filter((s) => s.status === 'noted').length})
			</button>
			<button class="filter-tab" class:active={statusFilter === 'rejected'} onclick={() => statusFilter = 'rejected'}>
				Rejected ({suggestions.filter((s) => s.status === 'rejected').length})
			</button>
			<button class="filter-tab" class:active={statusFilter === 'all'} onclick={() => statusFilter = 'all'}>
				All ({suggestions.length})
			</button>
		</div>
		{#if gameOptions.length > 1}
			<select class="filter-select" bind:value={gameFilter}>
				<option value="">All games</option>
				{#each gameOptions as g}
					<option value={g}>{fmtGame(g)}</option>
				{/each}
			</select>
		{/if}
	</div>

	<!-- Suggestion list -->
	{#if filtered.length === 0}
		<div class="empty">No suggestions matching this filter.</div>
	{:else}
		<div class="suggestion-list">
			{#each filtered as s}
				<div class="sug-card sug-card--{s.status}">
					<div class="sug-card__header">
						<span class="sug-card__user">
							{#if s.runner_id}
								<a href={localizeHref(`/runners/${s.runner_id}`)}>{s.display_name}</a>
							{:else}
								{s.display_name}
							{/if}
						</span>
						<a href={localizeHref(`/games/${s.game_id}`)} class="sug-card__game">{fmtGame(s.game_id)}</a>
						<span class="sug-card__date muted">{formatDate(s.created_at)}</span>
						<span class="sug-card__status sug-card__status--{s.status}">{s.status}</span>
					</div>
					<div class="sug-card__body">{s.suggestion}</div>
					{#if s.admin_response}
						<div class="sug-card__response">
							<strong>Admin response:</strong> {s.admin_response}
						</div>
					{/if}
					{#if s.status === 'pending'}
						<div class="sug-card__actions">
							<button class="btn btn--small btn--approve" onclick={() => openReviewModal(s, 'accepted')} disabled={processingId === s.id}>✅ Accept</button>
							<button class="btn btn--small btn--noted" onclick={() => openReviewModal(s, 'noted')} disabled={processingId === s.id}>📌 Note</button>
							<button class="btn btn--small btn--reject" onclick={() => openReviewModal(s, 'rejected')} disabled={processingId === s.id}>❌ Reject</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Review Modal -->
<Dialog.Root open={modalOpen && !!modalSuggestion} onOpenChange={(o) => { if (!o) modalOpen = false; }}>
	<Dialog.Overlay />
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>
				{#if modalAction === 'accepted'}✅ Accept Suggestion
				{:else if modalAction === 'noted'}📌 Note Suggestion
				{:else}❌ Reject Suggestion
				{/if}
			</Dialog.Title>
			<Dialog.Close>&times;</Dialog.Close>
		</Dialog.Header>
		<div class="modal__body">
			<p class="muted mb-1">From <strong>{modalSuggestion?.display_name}</strong> for <strong>{fmtGame(modalSuggestion?.game_id)}</strong>:</p>
			<div class="modal__quote">{modalSuggestion?.suggestion}</div>
			<label class="modal__label">Response (optional — shown to the user):</label>
			<textarea class="modal__textarea" bind:value={modalResponse} rows="3" placeholder="Your response..."></textarea>
		</div>
		<Dialog.Footer>
			<button class="btn btn--save" onclick={confirmReview} disabled={processingId !== null}>
				{processingId ? '...' : 'Confirm'}
			</button>
			<button class="btn btn--reset" onclick={() => modalOpen = false}>Cancel</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	.suggestions-page { max-width: 900px; margin: 0 auto; padding: 0 1rem; }
	.suggestions-header { margin-bottom: 1.5rem; }
	.suggestions-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }

	.toast { padding: 0.6rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.toast--success { background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); color: #28a745; }
	.toast--error { background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); color: #dc3545; }

	/* Filters */
	.filters { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
	.filter-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; }
	.filter-tab { padding: 0.4rem 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.82rem; cursor: pointer; font-family: inherit; }
	.filter-tab:hover { background: rgba(255,255,255,0.05); }
	.filter-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
	.filter-select { padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.82rem; font-family: inherit; }

	.empty { text-align: center; padding: 2rem; color: var(--muted); }

	/* Suggestion cards */
	.suggestion-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.sug-card { padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.sug-card--accepted { border-left: 3px solid #28a745; }
	.sug-card--noted { border-left: 3px solid #f59e0b; }
	.sug-card--rejected { border-left: 3px solid #dc3545; opacity: 0.7; }
	.sug-card__header { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.5rem; font-size: 0.85rem; }
	.sug-card__user { font-weight: 600; }
	.sug-card__user a { color: var(--accent); text-decoration: none; }
	.sug-card__user a:hover { text-decoration: underline; }
	.sug-card__game { color: var(--muted); font-size: 0.8rem; }
	.sug-card__date { font-size: 0.78rem; }
	.sug-card__status { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
	.sug-card__status--pending { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.sug-card__status--accepted { background: rgba(40, 167, 69, 0.15); color: #28a745; }
	.sug-card__status--noted { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.sug-card__status--rejected { background: rgba(220, 53, 69, 0.15); color: #dc3545; }
	.sug-card__body { font-size: 0.9rem; line-height: 1.5; margin-bottom: 0.5rem; }
	.sug-card__response { font-size: 0.85rem; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 4px; margin-bottom: 0.5rem; }
	.sug-card__actions { display: flex; gap: 0.35rem; }

	.btn--approve { background: #28a745; color: white; border-color: #28a745; }
	.btn--noted { background: #f59e0b; color: white; border-color: #f59e0b; }
	.btn--reject { background: #dc3545; color: white; border-color: #dc3545; }

	/* Modal content */
	.modal__body { margin-bottom: 1rem; }
	.modal__quote { background: var(--bg); border-left: 3px solid var(--accent); padding: 0.6rem 0.75rem; margin: 0.5rem 0 1rem; font-size: 0.9rem; line-height: 1.5; border-radius: 0 4px 4px 0; }
	.modal__label { display: block; font-weight: 600; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.3rem; }
	.modal__textarea { width: 100%; padding: 0.5rem 0.7rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9rem; resize: vertical; box-sizing: border-box; }
	.modal__textarea:focus { outline: none; border-color: var(--accent); }

	.mb-1 { margin-bottom: 0.5rem; }
</style>
