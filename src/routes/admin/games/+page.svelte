<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, Pencil, Search, X } from 'lucide-svelte';

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
	let modalId = $state<string | null>(null);
	let modalInfo = $state('');
	let rejectReason = $state('');
	let rejectNotes = $state('');

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => Promise<void>) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => Promise<void>) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	async function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) await confirmCallback();
		confirmCallback = null;
	}

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

	function fmtAgo(d: string): string {
		if (!d) return '';
		const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
		if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
		return new Date(d).toLocaleDateString();
	}

	function wasEdited(g: any): boolean {
		return !!(g.updated_at && g.submitted_at && g.updated_at !== g.submitted_at);
	}

	async function loadGames() {
		loading = true;
		try {
			const { data, error } = await supabase
				.from('pending_games')
				.select('*')
				.order('submitted_at', { ascending: false })
				.limit(200);
			if (!error && data) {
				// Look up runner_id + claimed_by names via profiles
				const allUserIds = [...new Set([
					...data.map((g: any) => g.submitted_by),
					...data.map((g: any) => g.claimed_by)
				].filter(Boolean))];
				let profileMap: Record<string, string> = {};
				if (allUserIds.length > 0) {
					const { data: profiles } = await supabase
						.from('profiles')
						.select('user_id, runner_id, display_name')
						.in('user_id', allUserIds);
					for (const p of profiles || []) {
						if (p.user_id) profileMap[p.user_id] = p.runner_id || p.display_name || 'Staff';
					}
				}
				games = data.map((g: any) => ({
					...g,
					runner_id: profileMap[g.submitted_by] ?? null,
					claimed_by_name: g.claimed_by ? (profileMap[g.claimed_by] || 'Staff') : null,
				}));
			}
		} catch { /* ignore */ }
		loading = false;
	}

	async function claimGame(id: string) {
		processingId = id;
		actionMessage = null;
		try {
			const { data: { user: u } } = await supabase.auth.getUser();
			if (!u) throw new Error('Not authenticated');
			const { data: profile } = await supabase.from('profiles').select('runner_id, display_name').eq('user_id', u.id).single();
			const claimName = profile?.runner_id || profile?.display_name || 'Unknown';
			const { error } = await supabase.from('pending_games').update({
				claimed_by: u.id,
				claimed_at: new Date().toISOString()
			}).eq('id', id);
			if (error) throw error;
			games = games.map(g => g.id === id ? { ...g, claimed_by: u.id, claimed_by_name: claimName, claimed_at: new Date().toISOString() } : g);
			actionMessage = { type: 'success', text: 'Game claimed for review.' };
		} catch (e: any) {
			actionMessage = { type: 'error', text: `Claim failed: ${e.message}` };
		}
		processingId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	async function unclaimGame(id: string) {
		processingId = id;
		actionMessage = null;
		try {
			const { error } = await supabase.from('pending_games').update({
				claimed_by: null,
				claimed_at: null
			}).eq('id', id);
			if (error) throw error;
			games = games.map(g => g.id === id ? { ...g, claimed_by: null, claimed_by_name: null, claimed_at: null } : g);
			actionMessage = { type: 'success', text: 'Claim released.' };
		} catch (e: any) {
			actionMessage = { type: 'error', text: `Unclaim failed: ${e.message}` };
		}
		processingId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	async function approveGame(id: string, approveAs: 'Active' | 'Community Review' = 'Active') {
		const label = approveAs === 'Community Review' ? 'Approve as Community Review (rules open for input)?' : 'Approve this game?';
		openConfirm('Approve Game', label, async () => {
			processingId = id;
			const result = await adminAction('/admin/approve-game', { game_id: id, approve_as: approveAs });
			if (result.ok) {
				games = games.map(g => g.id === id ? { ...g, status: 'approved' } : g);
				actionMessage = { type: 'success', text: approveAs === 'Community Review' ? 'Game approved in Community Review!' : 'Game approved!' };
			} else { actionMessage = { type: 'error', text: result.message }; }
			processingId = null;
			setTimeout(() => actionMessage = null, 3000);
		});
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

<svelte:head><title>{m.admin_games_title()}</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>← {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>{m.admin_games_heading()}</h1>
		<p class="muted mb-2">{m.admin_games_desc()}</p>

		{#if actionMessage}
			<div class="toast toast--{actionMessage.type}">{actionMessage.text}</div>
		{/if}

		<div class="filters card">
			<div class="filters__row">
				<ToggleGroup.Root class="filter-tabs" bind:value={statusFilter}>
					{#each (['pending', 'approved', 'rejected', 'needs_changes', 'all'] as const) as status}
						<ToggleGroup.Item value={status}>
							{status === 'needs_changes' ? 'Needs Changes' : status.charAt(0).toUpperCase() + status.slice(1)}
							{#if status === 'pending'}<span class="filter-tab__count">{pendingCount}</span>{/if}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
				<Button.Root size="sm" onclick={loadGames}>↻ Refresh</Button.Root>
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
				{#if dateFrom || dateTo}
					<Button.Root size="sm" onclick={() => { dateFrom = ''; dateTo = ''; }}>✕ Clear</Button.Root>
				{/if}
			</div>
		</div>

		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">{m.admin_games_loading()}</p></div></div>
		{:else if filteredGames.length === 0}
			<div class="card"><div class="empty"><span class="empty__icon">🎉</span><h3>No {statusFilter === 'all' ? '' : statusFilter} games</h3><p class="muted">{m.admin_all_caught_up()}</p></div></div>
		{:else}
			<div class="games-list">
				{#each filteredGames as g (g.id)}
					{@const isExpanded = expandedId === g.id}
					{@const canAct = g.status === 'pending' || g.status === 'needs_changes'}
					<div class="game-card" class:expanded={isExpanded}>
						<button class="game-card__header" onclick={() => expandedId = isExpanded ? null : g.id}>
							<div class="game-card__cover">
								{#if g.cover_image_url}
									<img src={g.cover_image_url} alt="" class="game-card__cover-img" />
								{:else}
									<div class="game-card__cover-empty"></div>
								{/if}
							</div>
							<div class="game-card__info">
								<div class="game-card__title-row">
									<span class="game-card__name">{g.game_name || g.game_id || '—'}</span>
									<span class="status-badge status-badge--{g.status}">{g.status}</span>
									{#if g.game_data?.submission_type === 'basic'}<span class="status-badge status-badge--basic">📝 basic</span>{/if}
								</div>
								{#if g.submitter_handle}<span class="game-card__submitter muted">by {g.submitter_handle}</span>{/if}
							</div>
							<span class="muted" style="font-size:0.85rem;">{formatDate(g.submitted_at)}</span>
						</button>

						{#if isExpanded}
							{@const gd = g.game_data || {}}
							<div class="game-card__body">

								<!-- Claim Bar -->
								{#if canAct}
								<div class="claim-bar">
									{#if g.claimed_by}
										<span class="claim-badge claim-badge--claimed">🔒 Claimed by {g.claimed_by_name || g.claimed_by}{#if g.claimed_at} · {fmtAgo(g.claimed_at)}{/if}</span>
										<Button.Root size="sm" onclick={() => unclaimGame(g.id)} disabled={processingId === g.id}>{m.admin_release()}</Button.Root>
									{:else}
										<button class="btn btn--claim" onclick={() => claimGame(g.id)} disabled={processingId === g.id}>🔐 Claim for Review</button>
										<span class="claim-badge claim-badge--unclaimed">{m.admin_unclaimed()}</span>
									{/if}
								</div>
								{/if}

								<!-- Edit indicator -->
								{#if wasEdited(g)}
									<div class="edit-indicator"><Pencil size={14} /> Edited after submission · {fmtAgo(g.updated_at)}</div>
								{/if}

								<!-- Section: Basic Info -->
								<div class="card-section">
									<h4 class="card-section__title">{m.admin_games_basic_info()}</h4>
									<div class="detail-grid">
										<div class="detail"><span class="detail__label">{m.admin_games_game_id()}</span><code>{g.game_id || '—'}</code></div>
										{#if g.game_name_aliases?.length}<div class="detail"><span class="detail__label">{m.admin_games_aliases()}</span>{g.game_name_aliases.join(', ')}</div>{/if}
										<div class="detail"><span class="detail__label">{m.admin_games_timing()}</span>{gd.timing_method || 'RTA'}</div>
										{#if g.runner_id}<div class="detail"><span class="detail__label">{m.admin_submitted_by()}</span><a href={localizeHref(`/runners/${g.runner_id}`)} class="runner-link" target="_blank">{g.runner_id}</a></div>{:else if g.submitted_by}<div class="detail"><span class="detail__label">{m.admin_submitted_by()}</span><code style="font-size:0.7rem;">{g.submitted_by}</code></div>{/if}
									</div>
									{#if g.description}
										<div class="detail mt-2"><span class="detail__label">{m.admin_description()}</span><div class="bio-text">{@html renderMarkdown(g.description)}</div></div>
									{/if}
								</div>

								<!-- Section: Platforms & Genres -->
								{#if g.genres?.length || g.platforms?.length || gd.custom_genres?.length || gd.custom_platforms?.length}
									<div class="card-section">
										<h4 class="card-section__title">{m.admin_games_platforms_genres()}</h4>
										{#if g.platforms?.length}
											<div class="detail"><span class="detail__label">{m.admin_games_platforms()}</span>
												<div class="chips">{#each g.platforms as plat}<span class="chip">{plat}</span>{/each}</div>
											</div>
										{/if}
										{#if gd.custom_platforms?.length}
											<div class="detail mt-1"><span class="detail__label">{m.admin_games_custom_platforms()}</span>
												<div class="chips">{#each gd.custom_platforms as plat}<span class="chip chip--new">{plat}</span>{/each}</div>
											</div>
										{/if}
										{#if g.genres?.length}
											<div class="detail mt-1"><span class="detail__label">{m.admin_games_genres()}</span>
												<div class="chips">{#each g.genres as genre}<span class="chip">{genre}</span>{/each}</div>
											</div>
										{/if}
										{#if gd.custom_genres?.length}
											<div class="detail mt-1"><span class="detail__label">{m.admin_games_custom_genres()}</span>
												<div class="chips">{#each gd.custom_genres as genre}<span class="chip chip--new">{genre}</span>{/each}</div>
											</div>
										{/if}
									</div>
								{/if}

								<!-- Section: Categories -->
								{#if gd.full_runs?.length || gd.mini_challenges?.length}
									<div class="card-section">
										<h4 class="card-section__title">{m.admin_games_categories()}</h4>
										{#if gd.full_runs?.length}
											<div class="detail"><span class="detail__label">{m.admin_games_full_runs()}</span>
												{#each gd.full_runs as c}
													<div class="data-item"><span class="chip">{c.label || c.slug}</span>{#if c.description}<div class="data-item__desc">{@html renderMarkdown(c.description)}</div>{/if}{#if c.exceptions}<div class="data-item__exc">⚠ {@html renderMarkdown(c.exceptions)}</div>{/if}</div>
												{/each}
											</div>
										{/if}
										{#if gd.mini_challenges?.length}
											<div class="detail mt-2"><span class="detail__label">{m.admin_games_mini_cats()}</span>
												{#each gd.mini_challenges as c}
													<div class="data-item"><span class="chip">{c.label || c.slug}</span>{#if c.description}<div class="data-item__desc">{@html renderMarkdown(c.description)}</div>{/if}{#if c.exceptions}<div class="data-item__exc">⚠ {@html renderMarkdown(c.exceptions)}</div>{/if}
														{#if c.children?.length}<div class="data-item__children">{#each c.children as ch}<div class="data-item"><span class="chip chip--sm">└ {ch.label || ch.slug}</span>{#if ch.description}<div class="data-item__desc">{@html renderMarkdown(ch.description)}</div>{/if}{#if ch.exceptions}<div class="data-item__exc">⚠ {@html renderMarkdown(ch.exceptions)}</div>{/if}{#if ch.fixed_loadout}<span class="data-item__fixed">Fixed: {ch.fixed_loadout.character || ''}{ch.fixed_loadout.character && ch.fixed_loadout.restriction ? ' / ' : ''}{ch.fixed_loadout.restriction || ''}</span>{/if}</div>{/each}</div>{/if}
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/if}

								<!-- Section: Challenges -->
								{#if gd.challenges_data?.length}
									<div class="card-section">
										<h4 class="card-section__title">{m.admin_games_challenges()}</h4>
										{#each gd.challenges_data as c}
											<div class="data-item"><span class="chip chip--accent">{c.label || c.slug}</span>{#if c.description}<div class="data-item__desc">{@html renderMarkdown(c.description)}</div>{/if}{#if c.exceptions}<div class="data-item__exc">⚠ {@html renderMarkdown(c.exceptions)}</div>{/if}</div>
										{/each}
									</div>
								{/if}

								<!-- Section: Characters -->
								{#if gd.character_column?.enabled}
									<div class="card-section">
										<h4 class="card-section__title">{gd.character_column.label || 'Character'} Column</h4>
										{#if gd.characters_data?.length}
											<div class="chips">{#each gd.characters_data as c}<span class="chip">{c.label || c.slug}</span>{/each}</div>
										{:else}
											<span class="muted">{m.admin_games_enabled_no_opts()}</span>
										{/if}
									</div>
								{/if}

								<!-- Section: Restrictions -->
								{#if gd.restrictions_data?.length}
									<div class="card-section">
										<h4 class="card-section__title">{m.admin_games_restrictions()}</h4>
										{#each gd.restrictions_data as r}
											<div class="data-item"><span class="chip">{r.label || r.slug}</span>{#if r.description}<div class="data-item__desc">{@html renderMarkdown(r.description)}</div>{/if}{#if r.exceptions}<div class="data-item__exc">⚠ {@html renderMarkdown(r.exceptions)}</div>{/if}
												{#if r.children?.length}<div class="data-item__children">{#each r.children as ch}<div class="data-item"><span class="chip chip--sm">└ {ch.label || ch.slug}</span>{#if ch.description}<div class="data-item__desc">{@html renderMarkdown(ch.description)}</div>{/if}{#if ch.exceptions}<div class="data-item__exc">⚠ {@html renderMarkdown(ch.exceptions)}</div>{/if}</div>{/each}</div>{/if}
											</div>
										{/each}
									</div>
								{/if}

								<!-- Section: Glitches -->
								{#if gd.glitches_data?.length || gd.glitch_doc_links || gd.nmg_rules}
									<div class="card-section">
										<h4 class="card-section__title">{m.admin_games_glitches()}</h4>
										{#if gd.glitches_data?.length}
											<div class="detail"><span class="detail__label">{m.admin_games_glitch_cats()}</span>
												<div class="chips">{#each gd.glitches_data as gl}<span class="chip">{gl.label || gl.slug}</span>{/each}</div>
											</div>
										{/if}
										{#if gd.nmg_rules}
											<div class="detail mt-1"><span class="detail__label">{m.admin_games_nmg()}</span><div class="bio-text">{@html renderMarkdown(gd.nmg_rules)}</div></div>
										{/if}
										{#if gd.glitch_doc_links}
											<div class="detail mt-1"><span class="detail__label">{m.admin_games_glitch_docs()}</span><div class="bio-text">{@html renderMarkdown(gd.glitch_doc_links)}</div></div>
										{/if}
									</div>
								{/if}

								<!-- Section: Rules -->
								{#if g.rules}
									<div class="card-section">
										<h4 class="card-section__title">{m.admin_games_rules()}</h4>
										<div class="bio-text">{@html renderMarkdown(g.rules)}</div>
									</div>
								{/if}

								<!-- Section: Submitter Info -->
								{#if gd.involvement?.length || g.submitter_notes}
									<div class="card-section">
										<h4 class="card-section__title">{m.admin_games_submitter_info()}</h4>
										{#if gd.involvement?.length}
											<div class="detail"><span class="detail__label">{m.admin_games_involvement()}</span>
												<ul class="involve-list">{#each gd.involvement as inv}<li>{inv}</li>{/each}</ul>
											</div>
										{/if}
										{#if g.submitter_notes}
											<div class="detail mt-1"><span class="detail__label">{m.admin_games_submitter_notes()}</span><div class="bio-text">{@html renderMarkdown(g.submitter_notes)}</div></div>
										{/if}
									</div>
								{/if}

								<!-- Status bars -->
								{#if g.rejection_reason}
									<div class="status-bar mt-2">Previous rejection: {@html renderMarkdown(g.rejection_reason)}</div>
								{/if}
								{#if g.reviewer_notes}
									<div class="status-bar status-bar--info mt-2">Reviewer notes: {@html renderMarkdown(g.reviewer_notes)}</div>
								{/if}

								<!-- Actions -->
								{#if canAct}
									<div class="actions mt-2">
										<button class="btn btn--approve" onclick={() => approveGame(g.id)} disabled={processingId === g.id}>{processingId === g.id ? '...' : '✅ Approve'}</button>
									<button class="btn btn--review-approve" onclick={() => approveGame(g.id, 'Community Review')} disabled={processingId === g.id}>{processingId === g.id ? '...' : '📋 Approve as Review'}</button>
										<a href={localizeHref(`/admin/games/${g.id}/review`)} class="btn btn--changes"><Pencil size={14} /> Request Changes</a>
										<button class="btn btn--reject" onclick={() => openRejectModal(g)} disabled={processingId === g.id}><XCircle size={14} /> Reject</button>
									</div>
								{/if}
								{#if g.status === 'approved' && g.game_id}
									<div class="actions mt-2">
										<a href={localizeHref(`/admin/game-editor/${g.game_id}`)} class="btn btn--changes">🛠️ Edit in Game Editor</a>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<Dialog.Root open={rejectModalOpen} onOpenChange={(o: boolean) => { if (!o) rejectModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_games_reject()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<p class="muted mb-2">{modalInfo}</p>
					<div class="form-field"><label>{m.admin_reason_required()} <span class="required">*</span></label>
						<Select.Root bind:value={rejectReason}>
							<Select.Trigger>{{ not_suitable: m.admin_games_reject_not_suitable(), duplicate: m.admin_games_already_tracked(), insufficient_info: m.admin_games_reject_insufficient(), other: m.admin_other() }[rejectReason] || m.admin_games_select()}</Select.Trigger>
							<Select.Content>
								<Select.Item value="not_suitable" label={m.admin_games_reject_not_suitable()} />
								<Select.Item value="duplicate" label={m.admin_games_already_tracked()} />
								<Select.Item value="insufficient_info" label={m.admin_games_reject_insufficient()} />
								<Select.Item value="other" label={m.admin_other()} />
							</Select.Content>
						</Select.Root>
					</div>
					<div class="form-field"><label>{m.admin_notes_opt()}</label><textarea rows="3" bind:value={rejectNotes} placeholder="Details..."></textarea></div>
				</div>
				<Dialog.Footer>
					<button class="btn btn--reject" onclick={confirmReject} disabled={!rejectReason || processingId !== null}>{m.admin_reject_btn()}</button>
					<Button.Root onclick={() => rejectModalOpen = false}>{m.admin_cancel()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	<AlertDialog.Root bind:open={confirmOpen}>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
			<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
			<div class="alert-dialog-actions">
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action onclick={handleConfirmAction}>Confirm</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
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
	.btn--review-approve { background: #3b82f6; color: white; border-color: #3b82f6; } .btn--review-approve:hover { background: #2563eb; color: white; }
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
	.filters__advanced { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.filter-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.filter-input { padding: 0.35rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.filter-input:focus { border-color: var(--accent); outline: none; }
	.games-list { display: flex; flex-direction: column; gap: 1rem; }
	.game-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
	.game-card + .game-card { margin-top: 0.25rem; }
	.game-card__header { display: flex; align-items: center; padding: 1.25rem; cursor: pointer; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; gap: 1rem; }
	.game-card__header:hover { background: rgba(255,255,255,0.02); }
	.game-card__cover { flex-shrink: 0; width: 80px; height: 38px; border-radius: 4px; overflow: hidden; }
	.game-card__cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.game-card__cover-empty { width: 100%; height: 100%; background: var(--bg); border: 1px dashed var(--border); border-radius: 4px; }
	.game-card__info { flex: 1; min-width: 0; }
	.game-card__title-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.game-card__name { font-weight: 700; font-size: 1.05rem; }
	.game-card__submitter { font-size: 0.85rem; display: block; margin-top: 0.15rem; }
	.runner-link { color: var(--accent); text-decoration: none; font-size: 0.9rem; }
	.runner-link:hover { text-decoration: underline; }
	.status-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
	.status-badge--pending { background: rgba(234, 179, 8, 0.15); color: #eab308; }
	.status-badge--approved { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
	.status-badge--rejected { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.status-badge--needs_changes { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.status-badge--basic { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.game-card__body { border-top: 1px solid var(--border); padding: 1.25rem; }

	/* Card sections with separators */
	.card-section { padding: 1rem 0; border-bottom: 1px solid var(--border); }
	.card-section:first-child { padding-top: 0; }
	.card-section:last-of-type { border-bottom: none; }
	.card-section__title { margin: 0 0 0.6rem; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); }
	.mt-1 { margin-top: 0.5rem; }

	.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
	.detail__label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.15rem; }
	.bio-text { margin: 0.35rem 0 0; font-size: 0.9rem; line-height: 1.5; }
	.bio-text :global(p) { margin: 0.25rem 0; }
	.bio-text :global(p:first-child) { margin-top: 0; }
	.bio-text :global(ul), .bio-text :global(ol) { margin: 0.25rem 0; padding-left: 1.25rem; }
	.bio-text :global(a) { color: var(--accent); text-decoration: underline; }
	.bio-text :global(code) { font-size: 0.85em; background: rgba(255,255,255,0.06); padding: 0.1em 0.35em; border-radius: 3px; }
	code { background: var(--bg); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; }
	.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
	.chip { padding: 0.2rem 0.6rem; background: var(--bg); border-radius: 6px; font-size: 0.8rem; }
	.status-bar { padding: 0.5rem 0.75rem; background: rgba(239, 68, 68, 0.08); border-radius: 6px; font-size: 0.85rem; color: #ef4444; }
	.status-bar :global(p) { display: inline; margin: 0; }
	.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--border); }
	.empty { text-align: center; padding: 3rem 1rem; } .empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; } .empty h3 { margin: 0 0 0.5rem; }
	.modal__body { margin-bottom: 0.5rem; }
	.form-field { margin-bottom: 1rem; } .form-field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
	.form-field select, .form-field textarea { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.required { color: #dc3545; }

	.chip--accent { background: rgba(99, 102, 241, 0.15); color: var(--accent); }

	/* Claim bar */
	.claim-bar { margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.claim-badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
	.claim-badge--claimed { background: rgba(59, 130, 246, 0.12); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.25); }
	.claim-badge--unclaimed { background: rgba(107, 114, 128, 0.1); color: var(--muted); border: 1px solid var(--border); }
	.btn--claim { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #3b82f6; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn--claim:hover { background: rgba(59, 130, 246, 0.2); }

	/* Edit indicator */
	.edit-indicator { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; margin-bottom: 1rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px; font-size: 0.8rem; font-weight: 500; color: #fbbf24; }
	.chip--new { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px dashed rgba(245, 158, 11, 0.4); }
	.chip--sm { font-size: 0.75rem; padding: 0.15rem 0.45rem; }
	.data-item { margin-top: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border, rgba(255,255,255,0.08)); }
	.data-item:last-child { border-bottom: none; padding-bottom: 0; }
	.data-item__children .data-item { border-bottom: none; padding-bottom: 0; }
	.data-item__desc { margin: 0.15rem 0 0 0.6rem; font-size: 0.85rem; color: var(--muted); line-height: 1.4; }
	.data-item__desc :global(p) { margin: 0.15rem 0; }
	.data-item__desc :global(a) { color: var(--accent); text-decoration: underline; }
	.data-item__exc { margin: 0.1rem 0 0 0.6rem; font-size: 0.8rem; color: #f59e0b; line-height: 1.4; }
	.data-item__exc :global(p) { margin: 0.1rem 0; display: inline; }
	.data-item__fixed { display: inline-block; margin-left: 0.6rem; font-size: 0.75rem; color: var(--accent); }
	.data-item__children { margin-left: 1rem; border-left: 2px solid var(--border); padding-left: 0.75rem; }
	.involve-list { margin: 0.35rem 0 0; padding-left: 1.25rem; font-size: 0.85rem; line-height: 1.6; }
	.status-bar--info { background: rgba(59, 130, 246, 0.08); color: #3b82f6; }
</style>
