<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, AlertTriangle } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

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
		// Run reasons
		invalid_run: 'Invalid Run',
		wrong_category: 'Wrong Category',
		wrong_challenge: 'Wrong Challenge',
		video_unavailable: 'Video Unavailable',
		cheating_suspected: 'Cheating Suspected',
		// Game reasons
		incorrect_game_info: 'Incorrect Game Info',
		// Profile reasons
		inappropriate_content: 'Inappropriate Content',
		impersonation: 'Impersonation',
		harassment: 'Harassment',
		// Shared reasons
		bug: 'Bug or Broken Page',
		spam: 'Spam',
		other: 'Other',
		// Legacy (may exist in older reports)
		cheating: 'Cheating',
		false_information: 'False Information',
	};

	const TYPE_LABELS: Record<string, string> = {
		user: '👤 User',
		profile: '👤 Profile',
		run: 'ðŸƒ Run',
		game: '🎮 Game',
		comment: 'ðŸ’¬ Comment',
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

<svelte:head><title>{m.admin_reports_title()}</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>â† {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>{m.admin_reports_heading()}</h1>
		<p class="muted mb-2">{m.admin_reports_desc()}</p>

		{#if actionMessage}
			<div class="toast toast--{actionMessage.type}">{actionMessage.text}</div>
		{/if}

		<div class="filters card">
			<div class="filters__row">
				<ToggleGroup.Root class="filter-tabs" bind:value={statusFilter}>
					{#each (['pending', 'investigating', 'resolved', 'dismissed', 'all'] as const) as status}
						<ToggleGroup.Item value={status}>
							{status.charAt(0).toUpperCase() + status.slice(1)}
							{#if status === 'pending'}<span class="filter-tab__count">{pendingCount}</span>{/if}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
				<Button.Root size="sm" onclick={loadReports}>â†» Refresh</Button.Root>
			</div>
		</div>

		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">{m.admin_loading_reports()}</p></div></div>
		{:else if filteredReports.length === 0}
			<div class="card"><div class="empty"><span class="empty__icon">ðŸŽ‰</span><h3>No {statusFilter === 'all' ? '' : statusFilter} reports</h3><p class="muted">{m.admin_all_caught_up()}</p></div></div>
		{:else}
			<div class="reports-list">
				{#each filteredReports as r (r.id)}
					{@const canAct = r.status === 'pending' || r.status === 'investigating'}
					<Collapsible.Root open={expandedId === r.id} onOpenChange={(o: boolean) => { expandedId = o ? r.id : null; }} class="report-card">
						<Collapsible.Trigger class="report-card__header">
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
						</Collapsible.Trigger>

						<Collapsible.Content class="report-card__body">
								<div class="detail-grid">
									{#if r.reported_user_id}
										<div class="detail"><span class="detail__label">{m.admin_reports_reported_user()}</span><a href={localizeHref(`/runners/${r.reported_user_id}`)} class="runner-link" target="_blank">{r.reported_user_id}</a></div>
									{/if}
									{#if r.reported_item_id}
										<div class="detail"><span class="detail__label">{m.admin_reports_item_id()}</span>
											{#if r.report_type === 'game' || r.report_type === 'run'}
												<a href={localizeHref(`/games/${r.reported_item_id}`)} target="_blank">{r.reported_item_id}</a>
											{:else if r.report_type === 'profile'}
												<a href={localizeHref(`/runners/${r.reported_item_id}`)} target="_blank">{r.reported_item_id}</a>
											{:else}
												<code>{r.reported_item_id}</code>
											{/if}
										</div>
									{/if}
									<div class="detail"><span class="detail__label">{m.admin_type()}</span>{TYPE_LABELS[r.report_type] || r.report_type}</div>
									<div class="detail"><span class="detail__label">{m.admin_reports_reason()}</span>{REASON_LABELS[r.reason] || r.reason}</div>
									{#if r.page_url}
										<div class="detail"><span class="detail__label">Reported From</span><a href={r.page_url} target="_blank" class="mono" style="font-size:0.8rem;">{r.page_url}</a></div>
									{/if}
								</div>

								<div class="detail mt-2"><span class="detail__label">{m.admin_reports_description()}</span><p class="bio-text">{r.description}</p></div>

								{#if r.evidence_urls?.length}
									<div class="detail mt-2"><span class="detail__label">{m.admin_reports_evidence()}</span>
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
											<button class="btn btn--changes" onclick={() => startInvestigating(r.id)} disabled={processingId === r.id}>ðŸ” Investigate</button>
										{/if}
										<button class="btn btn--approve" onclick={() => openResolveModal(r)} disabled={processingId === r.id}><CheckCircle size={14} /> Resolve</button>
										<button class="btn btn--reject" onclick={() => openDismissModal(r)} disabled={processingId === r.id}><XCircle size={14} /> Dismiss</button>
									</div>
								{/if}
							</Collapsible.Content>
					</Collapsible.Root>
				{/each}
			</div>
		{/if}

		<!-- Resolve Modal -->
		<Dialog.Root open={resolveModalOpen} onOpenChange={(o: boolean) => { if (!o) resolveModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_reports_resolve()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<p class="muted mb-2">{modalInfo}</p>
					<div class="form-field"><label>{m.admin_reports_resolution_req()} <span class="required">*</span></label><textarea rows="3" bind:value={resolutionText} placeholder="Describe the action taken..."></textarea></div>
					<div class="form-field"><label>{m.admin_reports_internal_notes()}</label><textarea rows="2" bind:value={internalNotes} placeholder="Staff-only notes..."></textarea></div>
				</div>
				<Dialog.Footer>
					<button class="btn btn--approve" onclick={confirmResolve} disabled={!resolutionText.trim() || processingId !== null}>{m.admin_reports_resolve_btn()}</button>
					<Button.Root onclick={() => resolveModalOpen = false}>{m.admin_cancel()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<!-- Dismiss Modal -->
		<Dialog.Root open={dismissModalOpen} onOpenChange={(o: boolean) => { if (!o) dismissModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_reports_dismiss()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<p class="muted mb-2">{modalInfo}</p>
					<div class="form-field"><label>{m.admin_reports_dismiss_reason()}</label><textarea rows="2" bind:value={resolutionText} placeholder="Why is this being dismissed?"></textarea></div>
					<div class="form-field"><label>{m.admin_reports_internal_notes()}</label><textarea rows="2" bind:value={internalNotes} placeholder="Staff-only notes..."></textarea></div>
				</div>
				<Dialog.Footer>
					<button class="btn btn--reject" onclick={confirmDismiss} disabled={processingId !== null}>{m.admin_reports_dismiss_btn()}</button>
					<Button.Root onclick={() => dismissModalOpen = false}>{m.admin_cancel()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mt-2 { margin-top: 1rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
	.btn--approve { background: #28a745; color: white; border-color: #28a745; } .btn--approve:hover { background: #218838; color: white; }
	.btn--reject { border-color: #dc3545; color: #dc3545; } .btn--reject:hover { background: #dc3545; color: white; }
	.btn--changes { border-color: #17a2b8; color: #17a2b8; } .btn--changes:hover { background: #17a2b8; color: white; }
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
	.filters { padding: 1rem; margin-bottom: 1.5rem; }
	.filters__row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
	.filters__tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	:global(.filter-tabs.ui-toggle-group) { display: flex; flex-wrap: wrap; gap: 0.25rem; border: none; border-radius: 0; overflow: visible; }
	:global(.filter-tabs .ui-toggle-group-item) { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; color: var(--muted); }
	:global(.filter-tabs .ui-toggle-group-item:hover) { border-color: var(--fg); color: var(--fg); }
	:global(.filter-tabs .ui-toggle-group-item[data-state="on"]) { background: var(--accent); color: white; border-color: var(--accent); }
	:global(.filter-tab__count) { display: inline-block; background: rgba(255,255,255,0.25); padding: 0 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; font-weight: 700; }
	.reports-list { display: flex; flex-direction: column; gap: 1rem; }
	:global(.report-card) { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	:global(.report-card__header) { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem; cursor: pointer; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; gap: 1rem; }
	:global(.report-card__header:hover) { background: rgba(255,255,255,0.02); }
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
	:global(.report-card__body) { border-top: 1px solid var(--border); padding: 1.25rem; }
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
	.modal__body { margin-bottom: 0.5rem; }
	.form-field { margin-bottom: 1rem; } .form-field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
	.form-field textarea { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.required { color: #dc3545; }
	.muted { opacity: 0.6; }
</style>
