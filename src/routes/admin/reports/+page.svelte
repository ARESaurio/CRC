<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(false);
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	type ReportStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed' | 'all';
	let reports = $state<any[]>([]);
	let statusFilter = $state<ReportStatus>('pending');
	let expandedId = $state<string | null>(null);
	let processingId = $state<string | null>(null);

	// Modals
	let resolveModalOpen = $state(false);
	let dismissModalOpen = $state(false);
	let modalId = $state<string | null>(null);
	let modalInfo = $state('');
	let resolutionText = $state('');
	let internalNotes = $state('');

	let filteredReports = $derived.by(() => {
		if (statusFilter === 'all') return reports;
		return reports.filter(r => r.status === statusFilter);
	});
	let pendingCount = $derived(reports.filter(r => r.status === 'pending').length);

	function formatDate(d: string): string {
		if (!d) return '—';
		const dt = new Date(d);
		const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
		if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
		if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
		return dt.toLocaleDateString();
	}

	const REASON_LABELS: Record<string, string> = {
		cheating: 'Cheating',
		harassment: 'Harassment',
		inappropriate_content: 'Inappropriate Content',
		spam: 'Spam',
		impersonation: 'Impersonation',
		false_information: 'False Information',
		other: 'Other',
	};

	const TYPE_LABELS: Record<string, string> = {
		user: '👤 User',
		run: '🏃 Run',
		game: '🎮 Game',
		comment: '💬 Comment',
		other: '📋 Other',
	};

	async function loadReports() {
		loading = true;
		try {
			const { data, error } = await supabase
				.from('user_reports')
				.select('*')
				.order('reported_at', { ascending: false })
				.limit(200);
			if (!error && data) reports = data;
		} catch { /* ignore */ }
		loading = false;
	}

	async function updateStatus(id: string, status: string, extra: Record<string, any> = {}) {
		processingId = id;
		const { data: { session: sess } } = await supabase.auth.getSession();
		const updates: Record<string, any> = {
			status,
			reviewed_by: sess?.user?.id || null,
			reviewed_at: new Date().toISOString(),
			...extra,
		};
		const { error } = await supabase
			.from('user_reports')
			.update(updates)
			.eq('id', id);
		if (!error) {
			reports = reports.map(r => r.id === id ? { ...r, ...updates } : r);
			actionMessage = { type: 'success', text: `Report ${status}.` };
		} else {
			actionMessage = { type: 'error', text: error.message };
		}
		processingId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	async function startInvestigating(id: string) {
		await updateStatus(id, 'investigating');
	}

	function openResolveModal(r: any) {
		modalId = r.id;
		modalInfo = `${TYPE_LABELS[r.report_type] || r.report_type} — ${REASON_LABELS[r.reason] || r.reason}`;
		resolutionText = '';
		internalNotes = r.internal_notes || '';
		resolveModalOpen = true;
	}

	async function confirmResolve() {
		if (!modalId || !resolutionText.trim()) return;
		await updateStatus(modalId, 'resolved', {
			resolution: resolutionText.trim(),
			internal_notes: internalNotes.trim() || null,
		});
		resolveModalOpen = false;
		modalId = null;
	}

	function openDismissModal(r: any) {
		modalId = r.id;
		modalInfo = `${TYPE_LABELS[r.report_type] || r.report_type} — ${REASON_LABELS[r.reason] || r.reason}`;
		resolutionText = '';
		internalNotes = r.internal_notes || '';
		dismissModalOpen = true;
	}

	async function confirmDismiss() {
		if (!modalId) return;
		await updateStatus(modalId, 'dismissed', {
			resolution: resolutionText.trim() || 'Dismissed — no action needed',
			internal_notes: internalNotes.trim() || null,
		});
		dismissModalOpen = false;
		modalId = null;
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/reports'); return; }
				const role = await checkAdminRole();
				authorized = !!(role?.admin || role?.moderator);
				checking = false;
				if (authorized) loadReports();
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>🚩 Reports | Admin | CRC</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>← {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access...</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 {m.admin_access_denied()}</h2><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>🚩 Reports</h1>
		<p class="muted mb-2">Review user-submitted reports on runners, runs, games, and other content.</p>

		{#if actionMessage}
			<div class="toast toast--{actionMessage.type}">{actionMessage.text}</div>
		{/if}

		<div class="filters card">
			<div class="filters__row">
				<div class="filters__tabs">
					{#each (['pending', 'investigating', 'resolved', 'dismissed', 'all'] as const) as status}
						<button class="filter-tab" class:active={statusFilter === status} onclick={() => statusFilter = status}>
							{status.charAt(0).toUpperCase() + status.slice(1)}
							{#if status === 'pending'}<span class="filter-tab__count">{pendingCount}</span>{/if}
						</button>
					{/each}
				</div>
				<button class="btn btn--small" onclick={loadReports}>↻ Refresh</button>
			</div>
		</div>

		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">Loading reports...</p></div></div>
		{:else if filteredReports.length === 0}
			<div class="card"><div class="empty"><span class="empty__icon">🎉</span><h3>No {statusFilter === 'all' ? '' : statusFilter} reports</h3><p class="muted">All caught up!</p></div></div>
		{:else}
			<div class="reports-list">
				{#each filteredReports as r (r.id)}
					{@const isExpanded = expandedId === r.id}
					{@const canAct = r.status === 'pending' || r.status === 'investigating'}
					<div class="report-card" class:expanded={isExpanded}>
						<button class="report-card__header" onclick={() => expandedId = isExpanded ? null : r.id}>
							<div>
								<div class="report-card__title-row">
									<span class="report-card__type">{TYPE_LABELS[r.report_type] || r.report_type}</span>
									<span class="report-card__reason">{REASON_LABELS[r.reason] || r.reason}</span>
									<span class="status-badge status-badge--{r.status}">{r.status}</span>
									{#if r.priority && r.priority !== 'normal'}
										<span class="priority-badge priority-badge--{r.priority}">{r.priority}</span>
									{/if}
								</div>
								{#if r.reporter_runner_id}
									<span class="report-card__reporter muted">reported by {r.reporter_runner_id}</span>
								{/if}
							</div>
							<span class="muted" style="font-size:0.85rem;">{formatDate(r.reported_at)}</span>
						</button>

						{#if isExpanded}
							<div class="report-card__body">
								<div class="detail-grid">
									{#if r.reported_user_id}
										<div class="detail"><span class="detail__label">Reported User</span><a href={localizeHref(`/runners/${r.reported_user_id}`)} class="runner-link" target="_blank">{r.reported_user_id}</a></div>
									{/if}
									{#if r.reported_item_id}
										<div class="detail"><span class="detail__label">Item ID</span><code>{r.reported_item_id}</code></div>
									{/if}
									<div class="detail"><span class="detail__label">Type</span>{TYPE_LABELS[r.report_type] || r.report_type}</div>
									<div class="detail"><span class="detail__label">Reason</span>{REASON_LABELS[r.reason] || r.reason}</div>
								</div>

								<div class="detail mt-2"><span class="detail__label">Description</span><p class="bio-text">{r.description}</p></div>

								{#if r.evidence_urls?.length}
									<div class="detail mt-2"><span class="detail__label">Evidence</span>
										<div class="evidence-links">
											{#each r.evidence_urls as url, i}
												<a href={url} target="_blank" rel="noopener noreferrer" class="evidence-link">Link {i + 1}</a>
											{/each}
										</div>
									</div>
								{/if}

								{#if r.resolution}
									<div class="status-bar status-bar--info mt-2">Resolution: {r.resolution}</div>
								{/if}
								{#if r.internal_notes}
									<div class="status-bar mt-2">Internal notes: {r.internal_notes}</div>
								{/if}

								{#if canAct}
									<div class="actions mt-2">
										{#if r.status === 'pending'}
											<button class="btn btn--changes" onclick={() => startInvestigating(r.id)} disabled={processingId === r.id}>🔍 Investigate</button>
										{/if}
										<button class="btn btn--approve" onclick={() => openResolveModal(r)} disabled={processingId === r.id}>✅ Resolve</button>
										<button class="btn btn--reject" onclick={() => openDismissModal(r)} disabled={processingId === r.id}>❌ Dismiss</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Resolve Modal -->
		{#if resolveModalOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="modal-backdrop" onclick={() => resolveModalOpen = false}></div>
			<div class="modal">
				<h3>Resolve Report</h3><p class="muted mb-2">{modalInfo}</p>
				<div class="form-field"><label>Resolution <span class="required">*</span></label><textarea rows="3" bind:value={resolutionText} placeholder="Describe the action taken..."></textarea></div>
				<div class="form-field"><label>Internal Notes (optional)</label><textarea rows="2" bind:value={internalNotes} placeholder="Staff-only notes..."></textarea></div>
				<div class="modal__actions">
					<button class="btn btn--approve" onclick={confirmResolve} disabled={!resolutionText.trim() || processingId !== null}>Resolve</button>
					<button class="btn" onclick={() => resolveModalOpen = false}>Cancel</button>
				</div>
			</div>
		{/if}

		<!-- Dismiss Modal -->
		{#if dismissModalOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="modal-backdrop" onclick={() => dismissModalOpen = false}></div>
			<div class="modal">
				<h3>Dismiss Report</h3><p class="muted mb-2">{modalInfo}</p>
				<div class="form-field"><label>Reason (optional)</label><textarea rows="2" bind:value={resolutionText} placeholder="Why is this being dismissed?"></textarea></div>
				<div class="form-field"><label>Internal Notes (optional)</label><textarea rows="2" bind:value={internalNotes} placeholder="Staff-only notes..."></textarea></div>
				<div class="modal__actions">
					<button class="btn btn--reject" onclick={confirmDismiss} disabled={processingId !== null}>Dismiss</button>
					<button class="btn" onclick={() => dismissModalOpen = false}>Cancel</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mt-2 { margin-top: 1rem; }
	.center { text-align: center; padding: 4rem 0; } .center-sm { text-align: center; padding: 2rem; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
	.btn:hover { border-color: var(--accent); color: var(--accent); } .btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; } .btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn--approve { background: #28a745; color: white; border-color: #28a745; } .btn--approve:hover { background: #218838; color: white; }
	.btn--reject { border-color: #dc3545; color: #dc3545; } .btn--reject:hover { background: #dc3545; color: white; }
	.btn--changes { border-color: #17a2b8; color: #17a2b8; } .btn--changes:hover { background: #17a2b8; color: white; }
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
	.filters { padding: 1rem; margin-bottom: 1.5rem; }
	.filters__row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
	.filters__tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	.filter-tab { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; color: var(--muted); cursor: pointer; }
	.filter-tab:hover { border-color: var(--fg); color: var(--fg); }
	.filter-tab.active { background: var(--accent); color: white; border-color: var(--accent); }
	.filter-tab__count { display: inline-block; background: rgba(255,255,255,0.25); padding: 0 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; font-weight: 700; }
	.reports-list { display: flex; flex-direction: column; gap: 1rem; }
	.report-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.report-card__header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem; cursor: pointer; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; gap: 1rem; }
	.report-card__header:hover { background: rgba(255,255,255,0.02); }
	.report-card__title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.report-card__type { font-weight: 700; font-size: 1rem; }
	.report-card__reason { font-size: 0.9rem; color: var(--muted); }
	.report-card__reporter { font-size: 0.85rem; display: block; margin-top: 0.15rem; }
	.runner-link { color: var(--accent); text-decoration: none; font-size: 0.9rem; } .runner-link:hover { text-decoration: underline; }
	.status-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
	.status-badge--pending { background: rgba(234, 179, 8, 0.15); color: #eab308; }
	.status-badge--investigating { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.status-badge--resolved { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
	.status-badge--dismissed { background: rgba(107, 114, 128, 0.15); color: #6b7280; }
	.priority-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
	.priority-badge--high { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.priority-badge--urgent { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.report-card__body { border-top: 1px solid var(--border); padding: 1.25rem; }
	.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
	.detail__label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.15rem; }
	.bio-text { margin: 0.35rem 0 0; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; }
	code { background: var(--bg); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; }
	.evidence-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.35rem; }
	.evidence-link { color: var(--accent); text-decoration: none; font-size: 0.85rem; padding: 0.2rem 0.5rem; background: var(--bg); border-radius: 4px; }
	.evidence-link:hover { text-decoration: underline; }
	.status-bar { padding: 0.5rem 0.75rem; background: rgba(239, 68, 68, 0.08); border-radius: 6px; font-size: 0.85rem; color: #ef4444; }
	.status-bar--info { background: rgba(59, 130, 246, 0.08); color: #3b82f6; }
	.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--border); }
	.empty { text-align: center; padding: 3rem 1rem; } .empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; } .empty h3 { margin: 0 0 0.5rem; }
	.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 500px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; z-index: 101; padding: 1.5rem; }
	.modal h3 { margin: 0 0 0.75rem; } .modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
	.form-field { margin-bottom: 1rem; } .form-field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
	.form-field textarea { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.required { color: #dc3545; }
	.muted { opacity: 0.6; }
</style>
