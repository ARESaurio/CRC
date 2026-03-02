<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(true);
	let error = $state('');
	let requests = $state<any[]>([]);
	let expandedId = $state<string | null>(null);
	let toast = $state('');

	type UpdateStatus = 'pending' | 'acknowledged' | 'resolved' | 'dismissed' | 'all';
	let statusFilter = $state<UpdateStatus>('pending');
	let gameFilter = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');

	// ── Derived ───────────────────────────────────────────────────────────────
	let filteredRequests = $derived.by(() => {
		let result = requests;
		if (statusFilter !== 'all') result = result.filter(r => r.status === statusFilter);
		if (gameFilter) result = result.filter(r => r.game_id === gameFilter);
		if (dateFrom) result = result.filter(r => r.created_at >= dateFrom);
		if (dateTo) result = result.filter(r => r.created_at <= dateTo + 'T23:59:59');
		return result;
	});

	let pendingCount = $derived(requests.filter(r => r.status === 'pending').length);
	let acknowledgedCount = $derived(requests.filter(r => r.status === 'acknowledged').length);
	let resolvedCount = $derived(requests.filter(r => r.status === 'resolved').length);
	let dismissedCount = $derived(requests.filter(r => r.status === 'dismissed').length);

	let gameOptions = $derived.by(() => {
		const ids = [...new Set(requests.map(r => r.game_id).filter(Boolean))].sort();
		return ids;
	});

	// ── Helpers ───────────────────────────────────────────────────────────────
	function fmt(id: string): string {
		return (id || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}
	function fmtDate(d: string): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
	function fmtAgo(d: string): string {
		if (!d) return '—';
		const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
		if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
		return fmtDate(d);
	}

	const sectionMap: Record<string, string> = {
		'game-description': 'Description', 'full-runs': 'Full Runs', 'mini-challenges': 'Mini Challenges',
		'rules': 'Rules', 'achievements': 'Achievements', 'credits': 'Credits', 'other': 'Other'
	};
	const typeMap: Record<string, string> = {
		incorrect: 'Incorrect', missing: 'Missing', outdated: 'Outdated', typo: 'Typo', suggestion: 'Suggestion'
	};

	// ── Data Loading ──────────────────────────────────────────────────────────
	async function loadRequests() {
		loading = true; error = '';
		try {
			// Load all statuses so tab counts are accurate
			const { data, error: err } = await supabase
				.from('game_update_requests')
				.select('*')
				.order('created_at', { ascending: false });
			if (err) throw err;
			requests = data || [];
		} catch (e: any) { error = e.message; }
		loading = false;
	}

	// ── Actions ───────────────────────────────────────────────────────────────
	async function updateStatus(id: string, newStatus: string) {
		try {
			const { error: err } = await supabase
				.from('game_update_requests')
				.update({ status: newStatus, updated_at: new Date().toISOString() })
				.eq('id', id);
			if (err) throw err;
			requests = requests.map(r => r.id === id ? { ...r, status: newStatus } : r);
			toast = 'Updated to ' + newStatus;
			setTimeout(() => toast = '', 2000);
		} catch (e: any) { toast = 'Error: ' + e.message; }
	}

	// ── Init ──────────────────────────────────────────────────────────────────
	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/game-updates'); return; }
				const role = await checkAdminRole();
				authorized = !!(role?.admin || role?.moderator || role?.verifier);
				checking = false;
				if (authorized) loadRequests();
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>📝 Game Updates | Admin | CRC</title></svelte:head>

<div class="page-width">
	<p class="back"><a href="/admin">← Dashboard</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access...</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 Access Denied</h2><p class="muted">Verifier or admin privileges required.</p><a href="/" class="btn">Go Home</a></div>
	{:else}
		<h1>📝 Game Updates</h1>
		<p class="muted mb-2">Review pending updates and manage approved corrections.</p>

		{#if toast}
			<div class="toast toast--success">{toast}</div>
		{/if}

		<!-- Status Tabs + Filters -->
		<div class="filters card">
			<div class="filters__row">
				<div class="filters__tabs">
					{#each (['pending', 'acknowledged', 'resolved', 'dismissed', 'all'] as const) as status}
						{@const count = status === 'pending' ? pendingCount : status === 'acknowledged' ? acknowledgedCount : status === 'resolved' ? resolvedCount : status === 'dismissed' ? dismissedCount : requests.length}
						<button
							class="filter-tab"
							class:active={statusFilter === status}
							onclick={() => { statusFilter = status; }}
						>
							{status.charAt(0).toUpperCase() + status.slice(1)}
							<span class="filter-tab__count">{count}</span>
						</button>
					{/each}
				</div>
				<div class="filters__controls">
					<select bind:value={gameFilter}>
						<option value="">All Games</option>
						{#each gameOptions as gid}
							<option value={gid}>{fmt(gid)}</option>
						{/each}
					</select>
					<button class="btn btn--small" onclick={loadRequests} disabled={loading}>↻ Refresh</button>
				</div>
			</div>
			<div class="filters__advanced">
				<div class="filter-group">
					<label class="filter-label">Date From</label>
					<input type="date" class="filter-input" bind:value={dateFrom} />
				</div>
				<div class="filter-group">
					<label class="filter-label">Date To</label>
					<input type="date" class="filter-input" bind:value={dateTo} />
				</div>
				{#if gameFilter || dateFrom || dateTo}
					<button class="btn btn--small" onclick={() => { gameFilter = ''; dateFrom = ''; dateTo = ''; }}>✕ Clear</button>
				{/if}
			</div>
		</div>

		<!-- Requests List -->
		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">Loading requests...</p></div></div>
		{:else if error}
			<div class="card"><p class="muted">Error: {error}</p><p class="muted" style="font-size:0.85rem;">Ensure <code>game_update_requests</code> table exists.</p></div>
		{:else if filteredRequests.length === 0}
			<div class="card">
				<div class="empty">
					<span class="empty__icon">🎉</span>
					<h3>No requests found</h3>
					<p class="muted">No {statusFilter === 'all' ? '' : statusFilter} game update requests matching your filters.</p>
				</div>
			</div>
		{:else}
			<div class="requests-list">
				{#each filteredRequests as req (req.id)}
					{@const isExpanded = expandedId === req.id}
					<div class="req-card" class:expanded={isExpanded}>
						<button class="req-card__header" onclick={() => expandedId = isExpanded ? null : req.id}>
							<div>
								<div class="req-card__title-row">
									<span class="req-card__game">{req.game_name || fmt(req.game_id)}</span>
									<span class="status-badge status-badge--{req.status}">{req.status}</span>
									<span class="tag tag--section">{sectionMap[req.section] || req.section || '—'}</span>
									<span class="tag tag--type">{typeMap[req.update_type] || req.update_type || '—'}</span>
								</div>
								<span class="req-card__submitter">
									by {#if req.runner_id}{req.runner_id}{:else}Anonymous{/if}
								</span>
							</div>
							<span class="req-card__date muted">{fmtAgo(req.created_at)}</span>
						</button>

						{#if isExpanded}
							<div class="req-card__body">
								<div class="req-details">
									<div class="req-detail"><span class="req-detail__label">Section</span><span class="req-detail__value">{sectionMap[req.section] || req.section || '—'}</span></div>
									<div class="req-detail"><span class="req-detail__label">Type</span><span class="req-detail__value">{typeMap[req.update_type] || req.update_type || '—'}</span></div>
									<div class="req-detail"><span class="req-detail__label">Game</span><span class="req-detail__value">{req.game_name || fmt(req.game_id)}</span></div>
									<div class="req-detail"><span class="req-detail__label">Submitted</span><span class="req-detail__value">{fmtDate(req.created_at)}</span></div>
									{#if req.runner_id}<div class="req-detail"><span class="req-detail__label">Submitter</span><span class="req-detail__value"><a href="/runners/{req.runner_id}">{req.runner_id}</a></span></div>{/if}
									{#if req.page_url}<div class="req-detail"><span class="req-detail__label">Page</span><span class="req-detail__value"><a href={req.page_url} target="_blank" rel="noopener">View page →</a></span></div>{/if}
								</div>

								{#if req.details}
									<div class="req-content">
										<span class="req-content__label">Details</span>
										<div class="req-content__text">{req.details}</div>
									</div>
								{/if}

								{#if req.image_urls?.length}
									<div class="req-images">
										{#each req.image_urls as url, i}
											<a href={url} target="_blank" rel="noopener" class="req-images__link">
												<img src={url} alt="Attachment {i + 1}" class="req-images__img" />
											</a>
										{/each}
									</div>
								{/if}

								<div class="req-actions">
									{#if req.status === 'pending'}
										<button class="btn btn--acknowledge" onclick={() => updateStatus(req.id, 'acknowledged')}>👀 Acknowledge</button>
										<button class="btn btn--approve" onclick={() => updateStatus(req.id, 'resolved')}>✅ Resolve</button>
										<button class="btn btn--reject" onclick={() => updateStatus(req.id, 'dismissed')}>✕ Dismiss</button>
									{:else if req.status === 'acknowledged'}
										<button class="btn btn--approve" onclick={() => updateStatus(req.id, 'resolved')}>✅ Resolve</button>
										<button class="btn btn--reject" onclick={() => updateStatus(req.id, 'dismissed')}>✕ Dismiss</button>
									{:else}
										<button class="btn btn--reopen" onclick={() => updateStatus(req.id, 'pending')}>↩ Reopen</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; }
	.center { text-align: center; padding: 4rem 0; }
	.center-sm { text-align: center; padding: 2rem; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; font-family: inherit; }
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn:disabled { opacity: 0.4; cursor: not-allowed; }

	/* Toast */
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }

	/* Filters */
	.filters { padding: 1rem; margin-bottom: 1.5rem; }
	.filters__row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
	.filters__tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	.filter-tab { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; color: var(--muted); cursor: pointer; transition: all 0.15s; font-family: inherit; }
	.filter-tab:hover { border-color: var(--fg); color: var(--fg); }
	.filter-tab.active { background: var(--accent); color: white; border-color: var(--accent); }
	.filter-tab__count { display: inline-block; background: rgba(255,255,255,0.25); padding: 0 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; font-weight: 700; }
	.filters__controls { display: flex; gap: 0.5rem; align-items: center; }
	.filters__controls select { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.85rem; color: var(--fg); font-family: inherit; }
	.filters__advanced { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.filter-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.filter-input { padding: 0.35rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.filter-input:focus { border-color: var(--accent); outline: none; }

	/* Request cards */
	.requests-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.req-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.req-card__header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem 1.25rem; cursor: pointer; transition: background 0.1s; flex-wrap: wrap; gap: 0.75rem; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; }
	.req-card__header:hover { background: rgba(255,255,255,0.02); }
	.req-card__title-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.req-card__game { font-weight: 700; font-size: 1.05rem; }
	.req-card__submitter { font-size: 0.85rem; color: var(--muted); display: block; margin-top: 0.15rem; }
	.req-card__date { white-space: nowrap; font-size: 0.85rem; }

	/* Status badges */
	.status-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
	.status-badge--pending { background: rgba(234, 179, 8, 0.15); color: #eab308; }
	.status-badge--acknowledged { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.status-badge--resolved { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
	.status-badge--dismissed { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }

	/* Tags */
	.tag { font-size: 0.65rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 4px; text-transform: uppercase; }
	.tag--section { background: rgba(99,102,241,0.15); color: #818cf8; }
	.tag--type { background: rgba(245,158,11,0.15); color: #fbbf24; }

	/* Expandable body */
	.req-card__body { border-top: 1px solid var(--border); padding: 1.25rem; }
	.req-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
	.req-detail { display: flex; flex-direction: column; gap: 0.2rem; }
	.req-detail__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
	.req-detail__value { font-weight: 500; word-break: break-word; }
	.req-detail__value a { color: var(--accent); text-decoration: none; }
	.req-detail__value a:hover { text-decoration: underline; }

	/* Content block */
	.req-content { margin-bottom: 1.25rem; }
	.req-content__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); display: block; margin-bottom: 0.35rem; }
	.req-content__text { font-size: 0.9rem; line-height: 1.5; background: var(--bg); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word; }

	/* Images */
	.req-images { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
	.req-images__link { display: block; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); transition: border-color 0.15s; }
	.req-images__link:hover { border-color: var(--accent); }
	.req-images__img { width: 100px; height: 100px; object-fit: cover; display: block; }

	/* Actions */
	.req-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--border); }
	.btn--approve { background: #28a745; color: white; border-color: #28a745; }
	.btn--approve:hover { background: #218838; color: white; }
	.btn--acknowledge { border-color: #3b82f6; color: #3b82f6; }
	.btn--acknowledge:hover { background: #3b82f6; color: white; }
	.btn--reject { border-color: #dc3545; color: #dc3545; }
	.btn--reject:hover { background: #dc3545; color: white; }
	.btn--reopen { border-color: var(--muted); color: var(--muted); }
	.btn--reopen:hover { border-color: var(--fg); color: var(--fg); }

	/* Empty */
	.empty { text-align: center; padding: 3rem 1rem; }
	.empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
	.empty h3 { margin: 0 0 0.5rem; }

	@media (max-width: 640px) {
		.filters__row { flex-direction: column; align-items: stretch; }
		.req-details { grid-template-columns: 1fr 1fr; }
		.req-actions { flex-direction: column; }
		.req-actions .btn { width: 100%; justify-content: center; }
	}
</style>
