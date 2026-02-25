<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

	let checking = $state(true);
	let authorized = $state(false);
	let isSuperAdmin = $state(false);
	let isVerifier = $state(false);
	let roleLabel = $state('');
	/** game_ids this user can approve runs for (loaded from role_game_verifiers) */
	let assignedGameIds = $state<Set<string>>(new Set());

	/** Can the current user approve a specific run? */
	function canApproveRun(run: any): boolean {
		if (isSuperAdmin) return true;
		return assignedGameIds.has(run.game_id);
	}

	// ── Data ──
	let allRuns = $state<any[]>([]);
	let loading = $state(true);
	let processingId = $state<string | null>(null);
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// ── Expanded game ──
	let expandedGame = $state<string | null>(null);
	let expandedRun = $state<string | null>(null);

	// ── Reject/Changes modals ──
	let rejectModalOpen = $state(false);
	let changesModalOpen = $state(false);
	let modalRunId = $state<string | null>(null);
	let modalInfo = $state('');
	let rejectReason = $state('');
	let rejectNotes = $state('');
	let changesNotes = $state('');

	// ── Derived: group by game ──
	const gameGroups = $derived.by(() => {
		const map: Record<string, { runs: typeof allRuns; count: number }> = {};
		for (const run of allRuns) {
			const gid = run.game_id || 'unknown';
			if (!map[gid]) map[gid] = { runs: [], count: 0 };
			map[gid].runs.push(run);
			map[gid].count++;
		}
		// Sort by count descending
		return Object.entries(map)
			.sort(([, a], [, b]) => b.count - a.count)
			.map(([gameId, data]) => ({ gameId, ...data }));
	});

	const totalPending = $derived(allRuns.length);

	// ── Helpers ──
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
	function getVideoEmbed(url: string): string | null {
		if (!url) return null;
		try {
			const u = new URL(url);
			if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
				const id = u.hostname.includes('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v');
				return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
			}
			if (u.hostname.includes('twitch.tv') && u.pathname.includes('/videos/')) {
				const vid = u.pathname.split('/videos/')[1];
				return vid ? `https://player.twitch.tv/?video=${vid}&parent=${location.hostname}` : null;
			}
		} catch { /* */ }
		return null;
	}

	// ── Load ──
	async function loadRuns() {
		loading = true;
		try {
			const token = (await supabase.auth.getSession()).data.session?.access_token;
			if (!token) { allRuns = []; loading = false; return; }
			const res = await fetch(
				`${PUBLIC_SUPABASE_URL}/rest/v1/pending_runs?status=eq.pending&order=submitted_at.desc&limit=500`,
				{ headers: { 'apikey': PUBLIC_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
			);
			if (res.ok) allRuns = await res.json();
		} catch { /* */ }
		loading = false;
	}

	// ── Actions ──
	async function approveRun(id: string) {
		if (!confirm('Approve this run?')) return;
		processingId = id;
		actionMessage = null;
		const result = await adminAction('/admin/approve-run', { run_id: id });
		if (result.ok) {
			allRuns = allRuns.filter(r => r.id !== id);
			actionMessage = { type: 'success', text: 'Run approved!' };
		} else {
			actionMessage = { type: 'error', text: result.message };
		}
		processingId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	function openRejectModal(run: any) {
		modalRunId = run.id;
		modalInfo = `${fmt(run.game_id)} by ${run.runner_id}`;
		rejectReason = '';
		rejectNotes = '';
		rejectModalOpen = true;
	}

	async function confirmReject() {
		if (!modalRunId || !rejectReason) return;
		processingId = modalRunId;
		const result = await adminAction('/admin/reject-run', {
			run_id: modalRunId, reason: rejectReason, notes: rejectNotes.trim() || undefined
		});
		if (result.ok) {
			allRuns = allRuns.filter(r => r.id !== modalRunId);
			actionMessage = { type: 'success', text: 'Run rejected.' };
		} else {
			actionMessage = { type: 'error', text: result.message };
		}
		rejectModalOpen = false;
		processingId = null;
		modalRunId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	function openChangesModal(run: any) {
		modalRunId = run.id;
		modalInfo = `${fmt(run.game_id)} by ${run.runner_id}`;
		changesNotes = '';
		changesModalOpen = true;
	}

	async function confirmChanges() {
		if (!modalRunId || !changesNotes.trim()) return;
		processingId = modalRunId;
		const result = await adminAction('/admin/request-changes', {
			run_id: modalRunId, notes: changesNotes.trim()
		});
		if (result.ok) {
			allRuns = allRuns.filter(r => r.id !== modalRunId);
			actionMessage = { type: 'success', text: 'Changes requested.' };
		} else {
			actionMessage = { type: 'error', text: result.message };
		}
		changesModalOpen = false;
		processingId = null;
		modalRunId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	// ── Init ──
	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/runs-queue'); return; }
				const role = await checkAdminRole();
				authorized = !!(role?.admin || role?.verifier || role?.moderator);
				isSuperAdmin = !!(role?.superAdmin);
				isVerifier = !!(role?.verifier && !role?.admin && !role?.moderator);
				roleLabel = role?.superAdmin ? 'Super Admin' : role?.admin ? 'Admin' : role?.moderator ? 'Moderator' : role?.verifier ? 'Verifier' : '';
				// Load which games this user can approve
				if (authorized && !role?.superAdmin) {
					try {
						const { data: vGames } = await supabase
							.from('role_game_verifiers')
							.select('game_id')
							.eq('user_id', sess.user.id);
						assignedGameIds = new Set((vGames || []).map((r: any) => r.game_id));
					} catch { /* continue — assignedGameIds stays empty */ }
				}
				checking = false;
				if (authorized) loadRuns();
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>✅ Runs Queue ({totalPending}) | Admin | CRC</title></svelte:head>

<div class="page-width">
	<p class="back"><a href="/admin">← Dashboard</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access...</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 Access Denied</h2><p class="muted">You need verifier or admin privileges.</p><a href="/" class="btn">Go Home</a></div>
	{:else}
		<div class="page-header">
			<div>
				<h1>✅ Verification Queue</h1>
				<p class="muted">{roleLabel} · {totalPending} pending run{totalPending !== 1 ? 's' : ''} across {gameGroups.length} game{gameGroups.length !== 1 ? 's' : ''}</p>
			</div>
			<div class="page-header__actions">
				<button class="btn btn--small" onclick={loadRuns} disabled={loading}>↻ Refresh</button>
				<a href="/admin/runs" class="btn btn--small">Advanced View →</a>
			</div>
		</div>

		{#if actionMessage}
			<div class="toast toast--{actionMessage.type}">{actionMessage.text}</div>
		{/if}

		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">Loading queue...</p></div></div>
		{:else if totalPending === 0}
			<div class="card">
				<div class="empty">
					<span class="empty__icon">🎉</span>
					<h3>Queue Clear!</h3>
					<p class="muted">No runs awaiting verification.</p>
				</div>
			</div>
		{:else}
			<!-- Game-grouped queue -->
			<div class="queue-grid">
				{#each gameGroups as group}
					{@const isExpanded = expandedGame === group.gameId}
					{@const canApproveThisGame = isSuperAdmin || assignedGameIds.has(group.gameId)}
					<div class="game-group" class:game-group--expanded={isExpanded}>
						<button
							class="game-group__header"
							onclick={() => expandedGame = isExpanded ? null : group.gameId}
						>
							<div class="game-group__info">
								<span class="game-group__name">{fmt(group.gameId)}</span>
								<span class="game-group__badge">{group.count}</span>
								{#if !canApproveThisGame}
									<span class="game-group__viewonly">👁 View Only</span>
								{/if}
							</div>
							<span class="game-group__arrow">{isExpanded ? '▼' : '▶'}</span>
						</button>

						{#if isExpanded}
							<div class="game-group__runs">
								{#each group.runs as run}
									{@const isRunExpanded = expandedRun === run.id}
									<div class="queue-run" class:queue-run--expanded={isRunExpanded}>
										<button
											class="queue-run__summary"
											onclick={() => expandedRun = isRunExpanded ? null : run.id}
										>
											<div class="queue-run__main">
												<span class="queue-run__runner">{run.runner_id}</span>
												<span class="queue-run__category muted">{fmt(run.category_slug || '')}</span>
												{#if run.run_time}
													<span class="queue-run__time">{run.run_time}</span>
												{/if}
											</div>
											<span class="queue-run__ago muted">{fmtAgo(run.submitted_at)}</span>
										</button>

										{#if isRunExpanded}
											<div class="queue-run__details">
												<div class="detail-grid">
													<div class="detail"><span class="detail__label">Category</span><span>{fmt(run.category_slug || '—')}</span></div>
													<div class="detail"><span class="detail__label">Tier</span><span>{fmt(run.category_tier || '—')}</span></div>
													<div class="detail"><span class="detail__label">Time</span><span class="mono">{run.run_time || '—'}</span></div>
													<div class="detail"><span class="detail__label">Date</span><span>{fmtDate(run.date_completed || run.run_date)}</span></div>
													{#if run.character}
														<div class="detail"><span class="detail__label">Character</span><span>{fmt(run.character)}</span></div>
													{/if}
													{#if run.standard_challenges?.length}
														<div class="detail"><span class="detail__label">Challenges</span><span>{run.standard_challenges.map((s: string) => fmt(s)).join(', ')}</span></div>
													{/if}
													{#if run.restrictions?.length}
														<div class="detail"><span class="detail__label">Restrictions</span><span>{run.restrictions.map((s: string) => fmt(s)).join(', ')}</span></div>
													{/if}
													<div class="detail"><span class="detail__label">Submitted</span><span>{fmtDate(run.submitted_at)}</span></div>
												</div>

												{#if run.video_url}
													<div class="queue-run__video">
														<a href={run.video_url} target="_blank" rel="noopener">🎬 {run.video_url}</a>
														{#if getVideoEmbed(run.video_url)}
															<div class="video-embed">
																<iframe src={getVideoEmbed(run.video_url)} allowfullscreen loading="lazy" title="Run video"></iframe>
															</div>
														{/if}
													</div>
												{/if}

												<div class="queue-run__actions">
													{#if canApproveThisGame}
														<button class="btn btn--approve" onclick={() => approveRun(run.id)} disabled={processingId === run.id}>
															{processingId === run.id ? '...' : '✅ Approve'}
														</button>
														<button class="btn btn--changes" onclick={() => openChangesModal(run)} disabled={processingId === run.id}>
															✏️ Changes
														</button>
														<button class="btn btn--reject" onclick={() => openRejectModal(run)} disabled={processingId === run.id}>
															❌ Reject
														</button>
													{:else}
														<span class="queue-run__viewonly">👁 View only — not your assigned game</span>
													{/if}
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Reject Modal -->
		{#if rejectModalOpen}
			<div class="modal-backdrop" onclick={() => rejectModalOpen = false}></div>
			<div class="modal">
				<h3>Reject Run</h3>
				<p class="muted mb-2">{modalInfo}</p>
				<div class="form-field">
					<label for="reject-reason">Reason <span class="req">*</span></label>
					<select id="reject-reason" bind:value={rejectReason}>
						<option value="">Select a reason...</option>
						<option value="invalid_run">Invalid run — does not meet requirements</option>
						<option value="wrong_category">Wrong category or tier</option>
						<option value="video_issue">Video unavailable, incomplete, or doesn't match</option>
						<option value="cheating_suspected">Suspected cheating or spliced footage</option>
						<option value="duplicate">Duplicate submission</option>
						<option value="other">Other</option>
					</select>
				</div>
				<div class="form-field">
					<label for="reject-notes">Notes (optional)</label>
					<textarea id="reject-notes" rows="3" bind:value={rejectNotes} placeholder="Additional details for the runner..."></textarea>
				</div>
				<div class="modal__actions">
					<button class="btn btn--reject" onclick={confirmReject} disabled={!rejectReason || processingId !== null}>
						{processingId ? 'Rejecting...' : 'Reject Run'}
					</button>
					<button class="btn" onclick={() => rejectModalOpen = false}>Cancel</button>
				</div>
			</div>
		{/if}

		<!-- Changes Modal -->
		{#if changesModalOpen}
			<div class="modal-backdrop" onclick={() => changesModalOpen = false}></div>
			<div class="modal">
				<h3>Request Changes</h3>
				<p class="muted mb-2">{modalInfo}</p>
				<div class="form-field">
					<label for="changes-notes">What needs to change? <span class="req">*</span></label>
					<textarea id="changes-notes" rows="4" bind:value={changesNotes} placeholder="Describe what the runner needs to fix..."></textarea>
				</div>
				<div class="modal__actions">
					<button class="btn btn--changes" onclick={confirmChanges} disabled={!changesNotes.trim() || processingId !== null}>
						{processingId ? 'Sending...' : 'Send Request'}
					</button>
					<button class="btn" onclick={() => changesModalOpen = false}>Cancel</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--text-muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; }
	.center { text-align: center; padding: 4rem 0; }
	.center-sm { text-align: center; padding: 2rem; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; font-family: inherit; }
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.mono { font-family: monospace; }
	.req { color: #ef4444; }

	/* Header */
	.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
	.page-header__actions { display: flex; gap: 0.5rem; }

	/* Toast */
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
	.toast--error { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

	/* Queue Grid */
	.queue-grid { display: flex; flex-direction: column; gap: 0.5rem; }

	/* Game Group */
	.game-group { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.game-group--expanded { border-color: var(--accent); }
	.game-group__header {
		display: flex; justify-content: space-between; align-items: center;
		padding: 1rem 1.25rem; cursor: pointer; width: 100%; background: none;
		border: none; color: var(--fg); font-family: inherit; font-size: inherit; text-align: left;
	}
	.game-group__header:hover { background: rgba(255,255,255,0.02); }
	.game-group__info { display: flex; align-items: center; gap: 0.75rem; }
	.game-group__name { font-weight: 700; font-size: 1.05rem; }
	.game-group__badge {
		display: inline-flex; align-items: center; justify-content: center;
		min-width: 24px; height: 24px; padding: 0 6px;
		background: var(--accent); color: #fff; border-radius: 12px;
		font-size: 0.8rem; font-weight: 700;
	}
	.game-group__arrow { color: var(--text-muted); font-size: 0.8rem; }
	.game-group__viewonly { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.45rem; border-radius: 4px; background: rgba(107,114,128,0.15); color: var(--text-muted); letter-spacing: 0.3px; }

	/* Runs in group */
	.game-group__runs { border-top: 1px solid var(--border); }
	.queue-run { border-bottom: 1px solid var(--border); }
	.queue-run:last-child { border-bottom: none; }
	.queue-run__summary {
		display: flex; justify-content: space-between; align-items: center;
		padding: 0.75rem 1.25rem; cursor: pointer; width: 100%; background: none;
		border: none; color: var(--fg); font-family: inherit; font-size: inherit; text-align: left;
		gap: 1rem;
	}
	.queue-run__summary:hover { background: rgba(255,255,255,0.02); }
	.queue-run__main { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.queue-run__runner { font-weight: 600; }
	.queue-run__category { font-size: 0.85rem; }
	.queue-run__time { font-family: monospace; font-size: 0.85rem; color: var(--accent); font-weight: 600; }
	.queue-run__ago { font-size: 0.8rem; white-space: nowrap; }

	/* Run details */
	.queue-run__details { padding: 1rem 1.25rem; background: var(--bg); border-top: 1px solid var(--border); }
	.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
	.detail { display: flex; flex-direction: column; gap: 0.15rem; }
	.detail__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }

	/* Video */
	.queue-run__video { margin-bottom: 1rem; }
	.queue-run__video a { color: var(--accent); word-break: break-all; text-decoration: none; font-size: 0.9rem; }
	.queue-run__video a:hover { text-decoration: underline; }
	.video-embed { margin-top: 0.75rem; aspect-ratio: 16/9; max-width: 560px; border-radius: 8px; overflow: hidden; }
	.video-embed iframe { width: 100%; height: 100%; border: none; }

	/* Actions */
	.queue-run__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.queue-run__viewonly { font-size: 0.82rem; color: var(--text-muted); padding: 0.4rem 0; font-style: italic; }
	.btn--approve { background: #28a745; color: white; border-color: #28a745; }
	.btn--approve:hover { background: #218838; color: white; }
	.btn--reject { border-color: #dc3545; color: #dc3545; }
	.btn--reject:hover { background: #dc3545; color: white; }
	.btn--changes { border-color: #17a2b8; color: #17a2b8; }
	.btn--changes:hover { background: #17a2b8; color: white; }

	/* Empty */
	.empty { text-align: center; padding: 3rem 1rem; }
	.empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
	.empty h3 { margin: 0 0 0.5rem; }

	/* Modal */
	.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 500px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; z-index: 101; padding: 1.5rem; max-height: 90vh; overflow-y: auto; }
	.modal h3 { margin: 0 0 0.75rem; }
	.modal__actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
	.form-field { margin-bottom: 1rem; }
	.form-field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
	.form-field select, .form-field textarea { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.form-field select:focus, .form-field textarea:focus { outline: none; border-color: var(--accent); }

	@media (max-width: 640px) {
		.page-header { flex-direction: column; }
		.detail-grid { grid-template-columns: 1fr 1fr; }
		.queue-run__actions { flex-direction: column; }
		.queue-run__actions .btn { width: 100%; justify-content: center; }
	}
</style>
