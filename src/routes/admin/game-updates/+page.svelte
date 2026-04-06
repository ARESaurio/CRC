<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, Pencil, ArrowLeft, Sparkles, FileText, RefreshCw, Eye, X } from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(true);
	let error = $state('');
	let requests = $state<any[]>([]);
	let expandedId = $state<string | null>(null);
	let toast = $state('');

	// Games this user can moderate (write permission)
	let myModeratorGameIds = $state<Set<string>>(new Set());
	let isAdmin = $state(false);
	let isSuperAdmin = $state(false);

	function canEdit(req: any): boolean {
		return isAdmin || isSuperAdmin || myModeratorGameIds.has(req.game_id);
	}

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

	function wasEdited(req: any): boolean {
		return !!(req.updated_at && req.created_at && req.updated_at !== req.created_at);
	}

	// ── Data Loading ──────────────────────────────────────────────────────────
	async function loadRequests() {
		loading = true; error = '';
		try {
			const { data, error: err } = await supabase
				.from('game_update_requests')
				.select('*')
				.order('created_at', { ascending: false });
			if (err) throw err;

			// Resolve claimed_by UUIDs to names
			const claimerIds = [...new Set((data || []).filter((r: any) => r.claimed_by).map((r: any) => r.claimed_by))];
			let claimerMap: Record<string, string> = {};
			if (claimerIds.length > 0) {
				const { data: profiles } = await supabase.from('profiles').select('user_id, runner_id, display_name').in('user_id', claimerIds);
				for (const p of profiles || []) {
					if (p.user_id) claimerMap[p.user_id] = p.runner_id || p.display_name || 'Staff';
				}
			}
			requests = (data || []).map((r: any) => ({
				...r,
				claimed_by_name: r.claimed_by ? (claimerMap[r.claimed_by] || 'Staff') : null,
			}));
		} catch (e: any) { error = e.message; }
		loading = false;
	}

	// ── Claim / Unclaim ───────────────────────────────────────────────────────
	async function claimUpdate(id: string) {
		try {
			const { data: { user: u } } = await supabase.auth.getUser();
			if (!u) throw new Error('Not authenticated');
			const { data: profile } = await supabase.from('profiles').select('runner_id, display_name').eq('user_id', u.id).single();
			const claimName = profile?.runner_id || profile?.display_name || 'Unknown';
			const { error: err } = await supabase.from('game_update_requests').update({
				claimed_by: u.id,
				claimed_at: new Date().toISOString()
			}).eq('id', id);
			if (err) throw err;
			requests = requests.map(r => r.id === id ? { ...r, claimed_by: u.id, claimed_by_name: claimName, claimed_at: new Date().toISOString() } : r);
			toast = 'Update claimed for review.';
		} catch (e: any) { toast = 'Claim failed: ' + e.message; }
		setTimeout(() => toast = '', 3000);
	}

	async function unclaimUpdate(id: string) {
		try {
			const { error: err } = await supabase.from('game_update_requests').update({
				claimed_by: null,
				claimed_at: null
			}).eq('id', id);
			if (err) throw err;
			requests = requests.map(r => r.id === id ? { ...r, claimed_by: null, claimed_by_name: null, claimed_at: null } : r);
			toast = 'Claim released.';
		} catch (e: any) { toast = 'Unclaim failed: ' + e.message; }
		setTimeout(() => toast = '', 3000);
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
				if (role?.admin) isAdmin = true;
				if (role?.superAdmin) isSuperAdmin = true;
				if (role?.moderatorGameIds?.length) {
					myModeratorGameIds = new Set(role.moderatorGameIds);
				}
				checking = false;
				if (authorized) loadRequests();
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>{m.admin_updates_title()}</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}><ArrowLeft size={14} /> {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_staff_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h2>{m.admin_updates_heading()}</h2>
		<p class="muted mb-2">{m.admin_updates_desc()}</p>

		{#if toast}
			<div class="toast toast--success">{toast}</div>
		{/if}

		<!-- Status Tabs + Filters -->
		<div class="filters card">
			<div class="filters__row">
				<ToggleGroup.Root class="filter-tabs" bind:value={statusFilter}>
					{#each (['pending', 'acknowledged', 'resolved', 'dismissed', 'all'] as const) as status}
						{@const count = status === 'pending' ? pendingCount : status === 'acknowledged' ? acknowledgedCount : status === 'resolved' ? resolvedCount : status === 'dismissed' ? dismissedCount : requests.length}
						<ToggleGroup.Item value={status}>
							{status.charAt(0).toUpperCase() + status.slice(1)}
							<span class="filter-tab__count">{count}</span>
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
				<div class="filters__controls">
					<Select.Root bind:value={gameFilter}>
						<Select.Trigger>{gameFilter ? fmt(gameFilter) : m.admin_all_games()}</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label={m.admin_all_games()} />
							{#each gameOptions as gid}
								<Select.Item value={gid} label={fmt(gid)} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Button.Root size="sm" onclick={loadRequests} disabled={loading}><RefreshCw size={12} /> Refresh</Button.Root>
				</div>
			</div>
			<div class="filters__advanced">
				<div class="filter-group">
					<label class="filter-label">{m.admin_date_from()}</label>
					<input type="date" class="filter-input" bind:value={dateFrom} />
				</div>
				<div class="filter-group">
					<label class="filter-label">{m.admin_date_to()}</label>
					<input type="date" class="filter-input" bind:value={dateTo} />
				</div>
				{#if gameFilter || dateFrom || dateTo}
					<Button.Root size="sm" onclick={() => { gameFilter = ''; dateFrom = ''; dateTo = ''; }}><X size={12} /> Clear</Button.Root>
				{/if}
			</div>
		</div>

		<!-- Requests List -->
		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">{m.admin_loading_requests()}</p></div></div>
		{:else if error}
			<div class="card"><p class="muted">Error: {error}</p><p class="muted" style="font-size:0.85rem;">Ensure <code>game_update_requests</code> table exists.</p></div>
		{:else if filteredRequests.length === 0}
			<div class="card">
				<div class="empty">
					<span class="empty__icon"><Sparkles size={24} /></span>
					<h3>{m.admin_updates_no_requests()}</h3>
					<p class="muted">No {statusFilter === 'all' ? '' : statusFilter} game update requests matching your filters.</p>
				</div>
			</div>
		{:else}
			<div class="requests-list">
				{#each filteredRequests as req (req.id)}
					<Collapsible.Root open={expandedId === req.id} onOpenChange={(o: boolean) => { expandedId = o ? req.id : null; }} class="req-card">
						<Collapsible.Trigger class="req-card__header">
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
						</Collapsible.Trigger>

						<Collapsible.Content class="req-card__body">
								<!-- Claim Bar -->
								{#if canEdit(req) && (req.status === 'pending' || req.status === 'acknowledged')}
								<div class="claim-bar">
									{#if req.claimed_by}
										<span class="claim-badge claim-badge--claimed"><Lock size={12} /> Claimed by {req.claimed_by_name || req.claimed_by}{#if req.claimed_at} · {fmtAgo(req.claimed_at)}{/if}</span>
										<Button.Root size="sm" onclick={() => unclaimUpdate(req.id)}>{m.admin_release()}</Button.Root>
									{:else}
										<button class="btn btn--claim" onclick={() => claimUpdate(req.id)}>” Claim for Review</button>
										<span class="claim-badge claim-badge--unclaimed">{m.admin_updates_unclaimed()}</span>
									{/if}
								</div>
								{/if}

								<!-- Edit indicator -->
								{#if wasEdited(req)}
									<div class="edit-indicator"><Pencil size={14} /> Edited after submission · {fmtAgo(req.updated_at)}</div>
								{/if}

								<div class="req-details">
									<div class="req-detail"><span class="req-detail__label">{m.admin_section()}</span><span class="req-detail__value">{sectionMap[req.section] || req.section || '—'}</span></div>
									<div class="req-detail"><span class="req-detail__label">{m.admin_type()}</span><span class="req-detail__value">{typeMap[req.update_type] || req.update_type || '—'}</span></div>
									<div class="req-detail"><span class="req-detail__label">{m.admin_game()}</span><span class="req-detail__value">{req.game_name || fmt(req.game_id)}</span></div>
									<div class="req-detail"><span class="req-detail__label">{m.admin_submitted()}</span><span class="req-detail__value">{fmtDate(req.created_at)}</span></div>
									{#if req.runner_id}<div class="req-detail"><span class="req-detail__label">{m.admin_updates_submitter()}</span><span class="req-detail__value"><a href={localizeHref(`/runners/${req.runner_id}`)}>{req.runner_id}</a></span></div>{/if}
									{#if req.page_url}<div class="req-detail"><span class="req-detail__label">{m.admin_updates_page()}</span><span class="req-detail__value"><a href={req.page_url} target="_blank" rel="noopener">{m.admin_updates_view_page()}</a></span></div>{/if}
								</div>

								{#if req.details}
									<div class="req-content">
										<span class="req-content__label">{m.admin_details()}</span>
										<div class="req-content__text">{@html renderMarkdown(req.details)}</div>
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
									{#if canEdit(req)}
										{#if req.status === 'pending'}
											<button class="btn btn--acknowledge" onclick={() => updateStatus(req.id, 'acknowledged')}><Eye size={14} /> Acknowledge</button>
											<button class="btn btn--approve" onclick={() => updateStatus(req.id, 'resolved')}><CheckCircle size={14} /> Resolve</button>
											<button class="btn btn--reject" onclick={() => updateStatus(req.id, 'dismissed')}><X size={12} /> Dismiss</button>
										{:else if req.status === 'acknowledged'}
											<button class="btn btn--approve" onclick={() => updateStatus(req.id, 'resolved')}><CheckCircle size={14} /> Resolve</button>
											<button class="btn btn--reject" onclick={() => updateStatus(req.id, 'dismissed')}><X size={12} /> Dismiss</button>
										{:else}
											<button class="btn btn--reopen" onclick={() => updateStatus(req.id, 'pending')}>↩ Reopen</button>
										{/if}
									{:else}
										<p class="muted" style="font-size: 0.85rem; margin: 0;">{m.admin_updates_view_only()}</p>
									{/if}
								</div>
							</Collapsible.Content>
					</Collapsible.Root>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h2 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; font-family: inherit; }

	/* Toast */
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }

	/* Filters */
	.filters { padding: 1rem; margin-bottom: 1.5rem; }
	.filters__row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
	.filters__tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	:global(.filter-tabs.ui-toggle-group) { display: flex; flex-wrap: wrap; gap: 0.25rem; border: none; border-radius: 0; overflow: visible; }
	:global(.filter-tabs .ui-toggle-group-item) { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; color: var(--muted); }
	:global(.filter-tabs .ui-toggle-group-item:hover) { border-color: var(--fg); color: var(--fg); }
	:global(.filter-tabs .ui-toggle-group-item[data-state="on"]) { background: var(--accent); color: white; border-color: var(--accent); }
	:global(.filter-tab__count) { display: inline-block; background: rgba(255,255,255,0.25); padding: 0 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; font-weight: 700; }
	.filters__controls { display: flex; gap: 0.5rem; align-items: center; }
	.filters__advanced { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.filter-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.filter-input { padding: 0.35rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.filter-input:focus { border-color: var(--accent); outline: none; }

	/* Request cards */
	.requests-list { display: flex; flex-direction: column; gap: 0.75rem; }
	:global(.req-card) { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	:global(.req-card__header) { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem 1.25rem; cursor: pointer; transition: background 0.1s; flex-wrap: wrap; gap: 0.75rem; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; }
	:global(.req-card__header:hover) { background: rgba(255,255,255,0.02); }
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
	:global(.req-card__body) { border-top: 1px solid var(--border); padding: 1.25rem; }

	/* Claim bar */
	.claim-bar { margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.claim-badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
	.claim-badge--claimed { background: rgba(59, 130, 246, 0.12); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.25); }
	.claim-badge--unclaimed { background: rgba(107, 114, 128, 0.1); color: var(--muted); border: 1px solid var(--border); }
	.btn--claim { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #3b82f6; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn--claim:hover { background: rgba(59, 130, 246, 0.2); }

	/* Edit indicator */
	.edit-indicator { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; margin-bottom: 1rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: #fbbf24; }
	.req-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
	.req-detail { display: flex; flex-direction: column; gap: 0.2rem; }
	.req-detail__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
	.req-detail__value { font-weight: 500; word-break: break-word; }
	.req-detail__value a { color: var(--accent); text-decoration: none; }
	.req-detail__value a:hover { text-decoration: underline; }

	/* Content block */
	.req-content { margin-bottom: 1.25rem; }
	.req-content__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); display: block; margin-bottom: 0.35rem; }
	.req-content__text { font-size: 0.9rem; line-height: 1.5; background: var(--bg); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border); word-break: break-word; }
	.req-content__text :global(p) { margin: 0.25rem 0; }
	.req-content__text :global(p:first-child) { margin-top: 0; }
	.req-content__text :global(p:last-child) { margin-bottom: 0; }
	.req-content__text :global(ul), .req-content__text :global(ol) { margin: 0.25rem 0; padding-left: 1.25rem; }
	.req-content__text :global(a) { color: var(--accent); text-decoration: underline; }
	.req-content__text :global(code) { font-size: 0.85em; background: rgba(255,255,255,0.06); padding: 0.1em 0.35em; border-radius: 3px; }
	.req-content__text :global(blockquote) { margin: 0.5rem 0; padding-left: 0.75rem; border-left: 3px solid var(--border); color: var(--muted); }
	.req-content__text :global(strong) { font-weight: 600; }

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
