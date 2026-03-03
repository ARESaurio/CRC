<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(false);
	let processingId = $state<string | null>(null);
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	type GameStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes' | 'all';
	let games = $state<any[]>([]);
	let statusFilter = $state<GameStatus>('pending');
	let expandedId = $state<string | null>(null);
	let dateFrom = $state('');
	let dateTo = $state('');

	let rejectModalOpen = $state(false);
	let changesModalOpen = $state(false);
	let modalId = $state<string | null>(null);
	let modalInfo = $state('');
	let rejectReason = $state('');
	let rejectNotes = $state('');
	let changesNotes = $state('');

	let filteredGames = $derived.by(() => {
		let result = games;
		if (statusFilter !== 'all') result = result.filter(g => g.status === statusFilter);
		if (dateFrom) result = result.filter(g => g.submitted_at >= dateFrom);
		if (dateTo) result = result.filter(g => g.submitted_at <= dateTo + 'T23:59:59');
		return result;
	});
	let pendingCount = $derived(games.filter(g => g.status === 'pending').length);

	function formatDate(d: string): string {
		if (!d) return '—';
		const dt = new Date(d);
		const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
		if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
		if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
		return dt.toLocaleDateString();
	}

	async function loadGames() {
		loading = true;
		try {
			const { data, error } = await supabase
				.from('pending_games')
				.select('*')
				.order('submitted_at', { ascending: false })
				.limit(200);
			if (!error && data) games = data;
		} catch { /* ignore */ }
		loading = false;
	}

	async function approveGame(id: string) {
		if (!confirm('Approve this game?')) return;
		processingId = id;
		const result = await adminAction('/admin/approve-game', { game_id: id });
		if (result.ok) {
			games = games.map(g => g.id === id ? { ...g, status: 'approved' } : g);
			actionMessage = { type: 'success', text: 'Game approved!' };
		} else { actionMessage = { type: 'error', text: result.message }; }
		processingId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	function openRejectModal(g: any) {
		modalId = g.id; modalInfo = g.game_name || g.game_id;
		rejectReason = ''; rejectNotes = ''; rejectModalOpen = true;
	}

	async function confirmReject() {
		if (!modalId || !rejectReason) return;
		processingId = modalId;
		const result = await adminAction('/admin/reject-game', { game_id: modalId, reason: rejectReason, notes: rejectNotes.trim() || undefined });
		if (result.ok) {
			games = games.map(g => g.id === modalId ? { ...g, status: 'rejected', rejection_reason: rejectReason } : g);
			actionMessage = { type: 'success', text: 'Game rejected.' };
		} else { actionMessage = { type: 'error', text: result.message }; }
		rejectModalOpen = false; processingId = null; modalId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	function openChangesModal(g: any) {
		modalId = g.id; modalInfo = g.game_name || g.game_id;
		changesNotes = ''; changesModalOpen = true;
	}

	async function confirmChanges() {
		if (!modalId || !changesNotes.trim()) return;
		processingId = modalId;
		const result = await adminAction('/admin/request-game-changes', { game_id: modalId, notes: changesNotes.trim() });
		if (result.ok) {
			games = games.map(g => g.id === modalId ? { ...g, status: 'needs_changes' } : g);
			actionMessage = { type: 'success', text: 'Changes requested.' };
		} else { actionMessage = { type: 'error', text: result.message }; }
		changesModalOpen = false; processingId = null; modalId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/games'); return; }
				const role = await checkAdminRole();
				authorized = !!(role?.admin);
				checking = false;
				if (authorized) loadGames();
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>🎯 Games | Admin | CRC</title></svelte:head>

<div class="page-width">
	<p class="back"><a href="/admin">← Dashboard</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access...</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 Access Denied</h2><a href="/" class="btn">Go Home</a></div>
	{:else}
		<h1>🎯 Games</h1>
		<p class="muted mb-2">Review pending games and manage approved submissions.</p>

		{#if actionMessage}
			<div class="toast toast--{actionMessage.type}">{actionMessage.text}</div>
		{/if}

		<div class="filters card">
			<div class="filters__row">
				<div class="filters__tabs">
					{#each (['pending', 'approved', 'rejected', 'needs_changes', 'all'] as const) as status}
						<button class="filter-tab" class:active={statusFilter === status} onclick={() => statusFilter = status}>
							{status === 'needs_changes' ? 'Needs Changes' : status.charAt(0).toUpperCase() + status.slice(1)}
							{#if status === 'pending'}<span class="filter-tab__count">{pendingCount}</span>{/if}
						</button>
					{/each}
				</div>
				<button class="btn btn--small" onclick={loadGames}>↻ Refresh</button>
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
				{#if dateFrom || dateTo}
					<button class="btn btn--small" onclick={() => { dateFrom = ''; dateTo = ''; }}>✕ Clear</button>
				{/if}
			</div>
		</div>

		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">Loading games...</p></div></div>
		{:else if filteredGames.length === 0}
			<div class="card"><div class="empty"><span class="empty__icon">🎉</span><h3>No {statusFilter === 'all' ? '' : statusFilter} games</h3><p class="muted">All caught up!</p></div></div>
		{:else}
			<div class="games-list">
				{#each filteredGames as g (g.id)}
					{@const isExpanded = expandedId === g.id}
					{@const canAct = g.status === 'pending' || g.status === 'needs_changes'}
					<div class="game-card" class:expanded={isExpanded}>
						<button class="game-card__header" onclick={() => expandedId = isExpanded ? null : g.id}>
							<div>
								<div class="game-card__title-row">
									<span class="game-card__name">{g.game_name || g.game_id || '—'}</span>
									<span class="status-badge status-badge--{g.status}">{g.status}</span>
								</div>
								{#if g.submitter_handle}<span class="game-card__submitter muted">by {g.submitter_handle}</span>{/if}
							</div>
							<span class="muted" style="font-size:0.85rem;">{formatDate(g.submitted_at)}</span>
						</button>

						{#if isExpanded}
							{@const gd = g.game_data || {}}
							<div class="game-card__body">
								<div class="detail-grid">
									<div class="detail"><span class="detail__label">Game ID</span><code>{g.game_id || '—'}</code></div>
									{#if g.game_name_aliases?.length}<div class="detail"><span class="detail__label">Aliases</span>{g.game_name_aliases.join(', ')}</div>{/if}
									<div class="detail"><span class="detail__label">Timing</span>{gd.timing_method || 'RTA'}</div>
									{#if g.submitted_by}<div class="detail"><span class="detail__label">User ID</span><code style="font-size:0.7rem;">{g.submitted_by}</code></div>{/if}
								</div>

								{#if g.description}
									<div class="detail mt-2"><span class="detail__label">Description</span><p class="bio-text">{g.description}</p></div>
								{/if}

								{#if g.genres?.length}
									<div class="detail mt-2"><span class="detail__label">Genres</span>
										<div class="chips">{#each g.genres as genre}<span class="chip">{genre}</span>{/each}</div>
									</div>
								{/if}
								{#if g.platforms?.length}
									<div class="detail mt-2"><span class="detail__label">Platforms</span>
										<div class="chips">{#each g.platforms as plat}<span class="chip">{plat}</span>{/each}</div>
									</div>
								{/if}

								{#if gd.full_runs?.length}
									<div class="detail mt-2"><span class="detail__label">Full Run Categories</span>
										<div class="chips">{#each gd.full_runs as c}<span class="chip">{c.label || c.slug}</span>{/each}</div>
									</div>
								{/if}
								{#if gd.mini_challenges?.length}
									<div class="detail mt-2"><span class="detail__label">Mini-Challenge Categories</span>
										<div class="chips">{#each gd.mini_challenges as c}<span class="chip">{c.label || c.slug}</span>{/each}</div>
									</div>
								{/if}

								{#if gd.challenges_data?.length}
									<div class="detail mt-2"><span class="detail__label">Challenges</span>
										<div class="chips">{#each gd.challenges_data as c}<span class="chip chip--accent">{c.label || c.slug}</span>{/each}</div>
									</div>
								{/if}

								{#if gd.character_column?.enabled}
									<div class="detail mt-2"><span class="detail__label">{gd.character_column.label || 'Character'} Column</span>
										{#if gd.characters_data?.length}
											<div class="chips">{#each gd.characters_data as c}<span class="chip">{c.label || c.slug}</span>{/each}</div>
										{:else}
											<span class="muted">Enabled, no options listed</span>
										{/if}
									</div>
								{/if}

								{#if gd.restrictions_data?.length}
									<div class="detail mt-2"><span class="detail__label">Restrictions</span>
										<div class="chips">{#each gd.restrictions_data as r}<span class="chip">{r.label || r.slug}</span>{/each}</div>
									</div>
								{/if}

								{#if gd.glitches_data?.length}
									<div class="detail mt-2"><span class="detail__label">Glitch Categories</span>
										<div class="chips">{#each gd.glitches_data as gl}<span class="chip">{gl.label || gl.slug}</span>{/each}</div>
									</div>
								{/if}
								{#if gd.glitch_doc_links}
									<div class="detail mt-2"><span class="detail__label">Glitch Docs</span><p class="bio-text">{gd.glitch_doc_links}</p></div>
								{/if}

								{#if g.rules}
									<div class="detail mt-2"><span class="detail__label">Rules</span><p class="bio-text">{g.rules}</p></div>
								{/if}

								{#if gd.involvement?.length}
									<div class="detail mt-2"><span class="detail__label">Submitter Involvement</span>
										<ul class="involve-list">{#each gd.involvement as inv}<li>{inv}</li>{/each}</ul>
									</div>
								{/if}
								{#if g.submitter_notes}
									<div class="detail mt-2"><span class="detail__label">Submitter Notes</span><p class="bio-text">{g.submitter_notes}</p></div>
								{/if}

								{#if g.rejection_reason}
									<div class="status-bar mt-2">Previous rejection: {g.rejection_reason}</div>
								{/if}
								{#if g.reviewer_notes}
									<div class="status-bar status-bar--info mt-2">Reviewer notes: {g.reviewer_notes}</div>
								{/if}
								{#if canAct}
									<div class="actions mt-2">
										<button class="btn btn--approve" onclick={() => approveGame(g.id)} disabled={processingId === g.id}>{processingId === g.id ? '...' : '✅ Approve'}</button>
										<button class="btn btn--changes" onclick={() => openChangesModal(g)} disabled={processingId === g.id}>✏️ Request Changes</button>
										<button class="btn btn--reject" onclick={() => openRejectModal(g)} disabled={processingId === g.id}>❌ Reject</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if rejectModalOpen}
			<div class="modal-backdrop" onclick={() => rejectModalOpen = false}></div>
			<div class="modal">
				<h3>Reject Game</h3><p class="muted mb-2">{modalInfo}</p>
				<div class="form-field"><label>Reason <span class="required">*</span></label>
					<select bind:value={rejectReason}><option value="">Select...</option><option value="not_suitable">Not suitable for CRC</option><option value="duplicate">Already tracked</option><option value="insufficient_info">Insufficient information</option><option value="other">Other</option></select>
				</div>
				<div class="form-field"><label>Notes (optional)</label><textarea rows="3" bind:value={rejectNotes} placeholder="Details..."></textarea></div>
				<div class="modal__actions">
					<button class="btn btn--reject" onclick={confirmReject} disabled={!rejectReason || processingId !== null}>Reject</button>
					<button class="btn" onclick={() => rejectModalOpen = false}>Cancel</button>
				</div>
			</div>
		{/if}
		{#if changesModalOpen}
			<div class="modal-backdrop" onclick={() => changesModalOpen = false}></div>
			<div class="modal">
				<h3>Request Changes</h3><p class="muted mb-2">{modalInfo}</p>
				<div class="form-field"><label>What needs to change? <span class="required">*</span></label><textarea rows="4" bind:value={changesNotes} placeholder="Describe..."></textarea></div>
				<div class="modal__actions">
					<button class="btn btn--changes" onclick={confirmChanges} disabled={!changesNotes.trim() || processingId !== null}>Send</button>
					<button class="btn" onclick={() => changesModalOpen = false}>Cancel</button>
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
	.filters__advanced { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.filter-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.filter-input { padding: 0.35rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.filter-input:focus { border-color: var(--accent); outline: none; }
	.games-list { display: flex; flex-direction: column; gap: 1rem; }
	.game-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.game-card__header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem; cursor: pointer; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; gap: 1rem; }
	.game-card__header:hover { background: rgba(255,255,255,0.02); }
	.game-card__title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.game-card__name { font-weight: 700; font-size: 1.05rem; }
	.game-card__submitter { font-size: 0.85rem; display: block; margin-top: 0.15rem; }
	.status-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
	.status-badge--pending { background: rgba(234, 179, 8, 0.15); color: #eab308; }
	.status-badge--approved { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
	.status-badge--rejected { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.status-badge--needs_changes { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.game-card__body { border-top: 1px solid var(--border); padding: 1.25rem; }
	.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
	.detail__label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.15rem; }
	.bio-text { margin: 0.35rem 0 0; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; }
	code { background: var(--bg); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; }
	.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
	.chip { padding: 0.2rem 0.6rem; background: var(--bg); border-radius: 6px; font-size: 0.8rem; }
	.status-bar { padding: 0.5rem 0.75rem; background: rgba(239, 68, 68, 0.08); border-radius: 6px; font-size: 0.85rem; color: #ef4444; }
	.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--border); }
	.empty { text-align: center; padding: 3rem 1rem; } .empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; } .empty h3 { margin: 0 0 0.5rem; }
	.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 500px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; z-index: 101; padding: 1.5rem; }
	.modal h3 { margin: 0 0 0.75rem; } .modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
	.form-field { margin-bottom: 1rem; } .form-field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
	.form-field select, .form-field textarea { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.required { color: #dc3545; }

	.chip--accent { background: rgba(99, 102, 241, 0.15); color: var(--accent); }
	.involve-list { margin: 0.35rem 0 0; padding-left: 1.25rem; font-size: 0.85rem; line-height: 1.6; }
	.status-bar--info { background: rgba(59, 130, 246, 0.08); color: #3b82f6; }
</style>
