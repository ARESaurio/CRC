<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { ArrowLeft, Search, Plus, X, Trash2, Pencil, Save, User, Gamepad2, ClipboardList } from 'lucide-svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';

	// ── Auth ───────────────────────────────────────────────────────────────────
	let checking = $state(true);
	let authorized = $state(false);
	let userRole = $state<any>(null);
	let activeTab = $state('game');

	// ── Toast ──────────────────────────────────────────────────────────────────
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 4000);
	}

	// ── Confirm dialog ─────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmVariant = $state<'danger' | 'default'>('danger');
	let confirmCallback = $state<(() => void) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => void, variant: 'danger' | 'default' = 'danger') {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmVariant = variant; confirmOpen = true;
	}
	function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) confirmCallback();
		confirmCallback = null;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// GAME VIEW STATE
	// ═══════════════════════════════════════════════════════════════════════════
	let games = $state<any[]>([]);
	let gamesLoading = $state(false);
	let gameSearch = $state('');
	let selectedGame = $state<any>(null);

	// Contributions for selected game
	let gameContributions = $state<any[]>([]);
	let gameContribTypes = $state<any[]>([]);
	let gameContribLoading = $state(false);

	// Add runner form
	let addRunnerSearch = $state('');
	let addRunnerResults = $state<any[]>([]);
	let addRunnerSearching = $state(false);

	// Add type form
	let newTypeName = $state('');
	let addingType = $state(false);

	// Inline editing
	let editingId = $state<string | null>(null);
	let editForm = $state<{ type: string; title: string; description: string; url: string }>({ type: '', title: '', description: '', url: '' });
	let savingEdit = $state(false);

	// Adding contribution to existing runner
	let addingForRunner = $state<string | null>(null);
	let addForm = $state<{ type: string; title: string; description: string; url: string }>({ type: 'other', title: '', description: '', url: '' });
	let savingAdd = $state(false);

	const filteredGames = $derived.by(() => {
		if (!gameSearch.trim()) return games;
		const q = gameSearch.toLowerCase();
		return games.filter(g =>
			g.game_name?.toLowerCase().includes(q) ||
			g.game_id?.toLowerCase().includes(q)
		);
	});

	// Group contributions by runner
	const runnerGroups = $derived.by(() => {
		const map = new Map<string, { runner_id: string; contributions: any[] }>();
		for (const c of gameContributions) {
			if (!map.has(c.runner_id)) {
				map.set(c.runner_id, { runner_id: c.runner_id, contributions: [] });
			}
			map.get(c.runner_id)!.contributions.push(c);
		}
		return [...map.values()].sort((a, b) => a.runner_id.localeCompare(b.runner_id));
	});

	async function loadGames() {
		gamesLoading = true;
		let query = supabase
			.from('games')
			.select('game_id, game_name, status, cover')
			.order('game_name');

		// Moderators only see their assigned games
		if (userRole?.moderator && !userRole?.admin) {
			const ids = [...(userRole.gameIds || []), ...(userRole.moderatorGameIds || [])];
			const unique = [...new Set(ids)];
			if (unique.length === 0) { games = []; gamesLoading = false; return; }
			query = query.in('game_id', unique);
		}

		const { data } = await query;
		games = data || [];
		gamesLoading = false;
	}

	async function selectGame(game: any) {
		selectedGame = game;
		await loadGameContributions(game.game_id);
	}

	async function loadGameContributions(gameId: string) {
		gameContribLoading = true;

		const [contribRes, typesRes] = await Promise.all([
			supabase
				.from('contributions')
				.select('*')
				.eq('game_id', gameId)
				.order('runner_id'),
			supabase
				.from('contribution_types')
				.select('*')
				.or(`game_id.is.null,game_id.eq.${gameId}`)
				.order('label'),
		]);

		gameContributions = contribRes.data || [];
		gameContribTypes = typesRes.data || [];
		gameContribLoading = false;
	}

	function clearGame() {
		selectedGame = null;
		gameContributions = [];
		gameContribTypes = [];
		editingId = null;
		addingForRunner = null;
		addRunnerSearch = '';
		addRunnerResults = [];
	}

	// ── Add runner search ──────────────────────────────────────────────────────
	async function searchRunnersToAdd() {
		if (!addRunnerSearch.trim()) return;
		addRunnerSearching = true;
		const { data } = await supabase
			.from('profiles')
			.select('runner_id, display_name, avatar_url')
			.eq('status', 'approved')
			.or(`runner_id.ilike.%${addRunnerSearch}%,display_name.ilike.%${addRunnerSearch}%`)
			.limit(8);
		addRunnerResults = data || [];
		addRunnerSearching = false;
	}

	function startAddForRunner(runnerId: string) {
		addingForRunner = runnerId;
		addForm = { type: 'other', title: '', description: '', url: '' };
		addRunnerResults = [];
		addRunnerSearch = '';
	}

	async function saveNewContribution() {
		if (!selectedGame || !addingForRunner) return;
		savingAdd = true;
		const result = await adminAction('/add-contribution', {
			game_id: selectedGame.game_id,
			runner_id: addingForRunner,
			type: addForm.type,
			title: addForm.title || null,
			description: addForm.description || null,
			url: addForm.url || null,
		});
		if (result.ok) {
			showToast('success', 'Contribution added!');
			addingForRunner = null;
			await loadGameContributions(selectedGame.game_id);
		} else {
			showToast('error', result.message || 'Failed to add contribution');
		}
		savingAdd = false;
	}

	// ── Edit contribution ──────────────────────────────────────────────────────
	function startEdit(c: any) {
		editingId = c.id;
		editForm = { type: c.type || 'other', title: c.title || '', description: c.description || '', url: c.url || '' };
	}

	function cancelEdit() { editingId = null; }

	async function saveEdit() {
		if (!editingId || !selectedGame) return;
		savingEdit = true;
		const result = await adminAction('/edit-contribution', {
			id: editingId,
			type: editForm.type,
			title: editForm.title || null,
			description: editForm.description || null,
			url: editForm.url || null,
		});
		if (result.ok) {
			showToast('success', 'Contribution updated!');
			editingId = null;
			await loadGameContributions(selectedGame.game_id);
		} else {
			showToast('error', result.message || 'Failed to update');
		}
		savingEdit = false;
	}

	// ── Delete contribution ────────────────────────────────────────────────────
	function confirmDelete(c: any) {
		openConfirm('Remove Contribution',
			`Remove "${c.title || c.type}" from ${c.runner_id}?`,
			async () => {
				const result = await adminAction('/delete-contribution', { id: c.id });
				if (result.ok) {
					showToast('success', 'Contribution removed.');
					if (selectedGame) await loadGameContributions(selectedGame.game_id);
				} else {
					showToast('error', result.message || 'Failed to remove');
				}
			}
		);
	}

	// ── Custom types ───────────────────────────────────────────────────────────
	async function addCustomType() {
		if (!newTypeName.trim() || !selectedGame) return;
		addingType = true;
		const result = await adminAction('/add-contribution-type', {
			label: newTypeName.trim(),
			game_id: selectedGame.game_id,
		});
		if (result.ok) {
			showToast('success', `Type "${newTypeName}" added!`);
			newTypeName = '';
			await loadGameContributions(selectedGame.game_id);
		} else {
			showToast('error', result.message || 'Failed to add type');
		}
		addingType = false;
	}

	function confirmDeleteType(ct: any) {
		if (!ct.game_id) { showToast('error', 'Cannot delete global types'); return; }
		openConfirm('Remove Custom Type',
			`Remove "${ct.label}"? Existing contributions using this type will keep their data.`,
			async () => {
				const result = await adminAction('/delete-contribution-type', { id: ct.id });
				if (result.ok) {
					showToast('success', 'Type removed.');
					if (selectedGame) await loadGameContributions(selectedGame.game_id);
				} else {
					showToast('error', result.message || 'Failed to remove');
				}
			}
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// RUNNER VIEW STATE
	// ═══════════════════════════════════════════════════════════════════════════
	let runnerSearch = $state('');
	let runnerSearchResults = $state<any[]>([]);
	let runnerSearchLoading = $state(false);
	let selectedRunnerView = $state<any>(null);
	let runnerContributions = $state<any[]>([]);
	let runnerContribLoading = $state(false);

	// Group runner contributions by game
	const runnerGameGroups = $derived.by(() => {
		const map = new Map<string, { game_id: string; contributions: any[] }>();
		for (const c of runnerContributions) {
			if (!map.has(c.game_id)) {
				map.set(c.game_id, { game_id: c.game_id, contributions: [] });
			}
			map.get(c.game_id)!.contributions.push(c);
		}
		return [...map.values()].sort((a, b) => a.game_id.localeCompare(b.game_id));
	});

	async function searchRunners() {
		if (!runnerSearch.trim()) return;
		runnerSearchLoading = true;
		const { data } = await supabase
			.from('profiles')
			.select('runner_id, display_name, avatar_url')
			.eq('status', 'approved')
			.or(`runner_id.ilike.%${runnerSearch}%,display_name.ilike.%${runnerSearch}%`)
			.limit(10);
		runnerSearchResults = data || [];
		runnerSearchLoading = false;
	}

	async function selectRunnerView(profile: any) {
		selectedRunnerView = profile;
		runnerSearchResults = [];
		runnerSearch = '';
		runnerContribLoading = true;

		const { data } = await supabase
			.from('contributions')
			.select('*')
			.eq('runner_id', profile.runner_id)
			.order('game_id');

		runnerContributions = data || [];
		runnerContribLoading = false;
	}

	function clearRunnerView() {
		selectedRunnerView = null;
		runnerContributions = [];
	}

	function confirmDeleteFromRunner(c: any) {
		openConfirm('Remove Contribution',
			`Remove "${c.title || c.type}" from ${c.game_id}?`,
			async () => {
				const result = await adminAction('/delete-contribution', { id: c.id });
				if (result.ok) {
					showToast('success', 'Contribution removed.');
					runnerContributions = runnerContributions.filter(x => x.id !== c.id);
				} else {
					showToast('error', result.message || 'Failed to remove');
				}
			}
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// INIT
	// ═══════════════════════════════════════════════════════════════════════════
	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/contributions'); return; }
				const role = await checkAdminRole();
				userRole = role;
				authorized = !!(role?.admin || role?.moderator);
				checking = false;
				if (authorized) loadGames();
			}
		});
		return unsub;
	});

	// helper
	function typeLabel(slug: string): string {
		const ct = gameContribTypes.find(t => t.slug === slug);
		return ct?.label || slug;
	}
</script>

<svelte:head><title>Contributions | Admin | CRC</title></svelte:head>

<div class="page-width contributions-page">
	<p class="back"><a href={localizeHref('/admin')}><ArrowLeft size={14} /> Admin</a></p>

	{#if checking}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access…</p></div>
	{:else if !authorized}
		<div class="center"><p class="muted">Redirecting…</p></div>
	{:else}
		<h1>Contributions</h1>
		<p class="muted mb-2">Manage contributor credits across games.</p>

		{#if toast}
			<div class="toast toast--{toast.type}">{toast.text}</div>
		{/if}

		<Tabs.Root bind:value={activeTab}>
			<Tabs.List>
				<Tabs.Trigger value="game"><Gamepad2 size={14} /> By Game</Tabs.Trigger>
				<Tabs.Trigger value="runner"><User size={14} /> By Runner</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- GAME VIEW TAB                                                      -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'game'}
			{#if !selectedGame}
				<!-- Game picker -->
				<div class="search-bar">
					<Search size={14} />
					<input type="text" placeholder="Search games…" bind:value={gameSearch} />
					{#if gameSearch}<button class="search-bar__clear" onclick={() => gameSearch = ''}><X size={14} /></button>{/if}
				</div>

				{#if gamesLoading}
					<div class="center-sm"><div class="spinner"></div></div>
				{:else if filteredGames.length === 0}
					<div class="empty">
						<Gamepad2 size={32} />
						<p class="muted">{gameSearch ? 'No matches.' : 'No games found.'}</p>
					</div>
				{:else}
					<div class="games-list">
						{#each filteredGames as g}
							<button class="game-row" onclick={() => selectGame(g)}>
								{#if g.cover}
									<img class="game-row__cover" src={g.cover} alt="" />
								{:else}
									<div class="game-row__cover game-row__cover--empty"><Gamepad2 size={16} /></div>
								{/if}
								<div class="game-row__info">
									<span class="game-row__name">{g.game_name}</span>
									<span class="game-row__id muted">{g.game_id}</span>
								</div>
								<span class="game-row__status muted">{g.status}</span>
							</button>
						{/each}
					</div>
				{/if}
			{:else}
				<!-- Game selected: contributions dashboard -->
				<div class="dash-header">
					<Button.Root size="sm" onclick={clearGame}><ArrowLeft size={14} /> All Games</Button.Root>
					<div class="dash-game">
						{#if selectedGame.cover}
							<img class="dash-game__cover" src={selectedGame.cover} alt="" />
						{/if}
						<div>
							<strong>{selectedGame.game_name}</strong>
							<span class="muted">{selectedGame.game_id}</span>
						</div>
					</div>
				</div>

				{#if gameContribLoading}
					<div class="center-sm"><div class="spinner"></div></div>
				{:else}
					<!-- Contribution types bar -->
					<div class="section-card">
						<h3>Contribution Types</h3>
						<p class="muted small">Global types apply to all games. Add custom types for this game below.</p>
						<div class="type-chips">
							{#each gameContribTypes as ct}
								<span class="type-chip" class:type-chip--custom={ct.game_id}>
									{ct.label}
									{#if ct.game_id}
										<button class="type-chip__remove" onclick={() => confirmDeleteType(ct)} title="Remove custom type"><X size={10} /></button>
									{/if}
								</span>
							{/each}
						</div>
						<div class="add-type-row">
							<input type="text" bind:value={newTypeName} placeholder="New type name…"
								onkeydown={(e) => { if (e.key === 'Enter') addCustomType(); }} />
							<Button.Root size="sm" onclick={addCustomType} disabled={addingType || !newTypeName.trim()}>
								<Plus size={14} /> Add Type
							</Button.Root>
						</div>
					</div>

					<!-- Contributors table -->
					<div class="section-card">
						<h3>Contributors</h3>

						{#if runnerGroups.length === 0}
							<div class="empty-sm">
								<p class="muted">No contributors yet. Search for a runner to add one.</p>
							</div>
						{:else}
							<div class="contrib-table-wrap">
								<table class="contrib-table">
									<thead>
										<tr>
											<th class="col-runner">Runner</th>
											<th class="col-type">Type</th>
											<th class="col-title">Title</th>
											<th class="col-desc">Description</th>
											<th class="col-actions"></th>
										</tr>
									</thead>
									<tbody>
										{#each runnerGroups as group}
											{#each group.contributions as c, i}
												{#if editingId === c.id}
													<!-- Inline edit row -->
													<tr class="edit-row">
														<td class="col-runner">{#if i === 0}<strong>{c.runner_id}</strong>{/if}</td>
														<td class="col-type">
															<select bind:value={editForm.type}>
																{#each gameContribTypes as ct}
																	<option value={ct.slug}>{ct.label}</option>
																{/each}
															</select>
														</td>
														<td class="col-title"><input type="text" bind:value={editForm.title} placeholder="Title…" /></td>
														<td class="col-desc"><input type="text" bind:value={editForm.description} placeholder="Description…" /></td>
														<td class="col-actions">
															<button class="icon-btn icon-btn--save" onclick={saveEdit} disabled={savingEdit} title="Save"><Save size={14} /></button>
															<button class="icon-btn" onclick={cancelEdit} title="Cancel"><X size={14} /></button>
														</td>
													</tr>
												{:else}
													<tr>
														<td class="col-runner">{#if i === 0}<a href={localizeHref(`/runners/${c.runner_id}`)} target="_blank"><strong>{c.runner_id}</strong></a>{/if}</td>
														<td class="col-type"><span class="type-badge">{typeLabel(c.type)}</span></td>
														<td class="col-title">{c.title || '—'}</td>
														<td class="col-desc">{c.description || '—'}</td>
														<td class="col-actions">
															<button class="icon-btn" onclick={() => startEdit(c)} title="Edit"><Pencil size={14} /></button>
															<button class="icon-btn icon-btn--danger" onclick={() => confirmDelete(c)} title="Remove"><Trash2 size={14} /></button>
														</td>
													</tr>
												{/if}
											{/each}
											<!-- Add row for this runner -->
											{#if addingForRunner === group.runner_id}
												<tr class="add-row">
													<td class="col-runner"></td>
													<td class="col-type">
														<select bind:value={addForm.type}>
															{#each gameContribTypes as ct}
																<option value={ct.slug}>{ct.label}</option>
															{/each}
														</select>
													</td>
													<td class="col-title"><input type="text" bind:value={addForm.title} placeholder="Title…" /></td>
													<td class="col-desc"><input type="text" bind:value={addForm.description} placeholder="Description…" /></td>
													<td class="col-actions">
														<button class="icon-btn icon-btn--save" onclick={saveNewContribution} disabled={savingAdd} title="Save"><Save size={14} /></button>
														<button class="icon-btn" onclick={() => addingForRunner = null} title="Cancel"><X size={14} /></button>
													</td>
												</tr>
											{:else}
												<tr>
													<td colspan="5">
														<button class="btn-inline" onclick={() => startAddForRunner(group.runner_id)}>
															<Plus size={12} /> Add another for {group.runner_id}
														</button>
													</td>
												</tr>
											{/if}
											<tr class="group-divider"><td colspan="5"></td></tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						<!-- Add new runner -->
						<div class="add-runner-section">
							<h4>Add a Runner</h4>
							<div class="search-row">
								<input type="text" bind:value={addRunnerSearch} placeholder="Search by runner ID or name…"
									onkeydown={(e) => { if (e.key === 'Enter') searchRunnersToAdd(); }} />
								<Button.Root size="sm" onclick={searchRunnersToAdd} disabled={addRunnerSearching}>
									{addRunnerSearching ? '…' : 'Search'}
								</Button.Root>
							</div>
							{#if addRunnerResults.length > 0}
								<div class="search-results">
									{#each addRunnerResults as r}
										<button class="search-result" onclick={() => startAddForRunner(r.runner_id)}>
											{#if r.avatar_url}
												<img class="search-result__avatar" src={r.avatar_url} alt="" />
											{:else}
												<div class="search-result__avatar search-result__avatar--placeholder">{(r.display_name || r.runner_id).charAt(0).toUpperCase()}</div>
											{/if}
											<span class="search-result__name">{r.display_name || r.runner_id}</span>
											<span class="muted">{r.runner_id}</span>
										</button>
									{/each}
								</div>
							{/if}

							<!-- Inline add form for new runner (not yet in table) -->
							{#if addingForRunner && !runnerGroups.find(g => g.runner_id === addingForRunner)}
								<div class="new-runner-add">
									<p class="small"><strong>Adding contribution for: {addingForRunner}</strong></p>
									<div class="field-grid">
										<div class="field-row">
											<label>Type</label>
											<select bind:value={addForm.type}>
												{#each gameContribTypes as ct}
													<option value={ct.slug}>{ct.label}</option>
												{/each}
											</select>
										</div>
										<div class="field-row">
											<label>Title</label>
											<input type="text" bind:value={addForm.title} placeholder="e.g., NMG Route Guide" />
										</div>
										<div class="field-row">
											<label>Description</label>
											<input type="text" bind:value={addForm.description} placeholder="Brief description…" />
										</div>
										<div class="field-row">
											<label>URL</label>
											<input type="url" bind:value={addForm.url} placeholder="https://…" />
										</div>
									</div>
									<div class="field-actions">
										<Button.Root size="sm" onclick={saveNewContribution} disabled={savingAdd}>
											{savingAdd ? 'Saving…' : 'Add Contribution'}
										</Button.Root>
										<Button.Root size="sm" variant="outline" onclick={() => addingForRunner = null}>Cancel</Button.Root>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- RUNNER VIEW TAB                                                    -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'runner'}
			{#if !selectedRunnerView}
				<div class="search-box">
					<div class="search-row">
						<input type="text" bind:value={runnerSearch} placeholder="Search by runner ID or display name…"
							onkeydown={(e) => { if (e.key === 'Enter') searchRunners(); }} />
						<Button.Root onclick={searchRunners} disabled={runnerSearchLoading}>
							{runnerSearchLoading ? 'Searching…' : 'Search'}
						</Button.Root>
					</div>

					{#if runnerSearchResults.length > 0}
						<div class="search-results">
							{#each runnerSearchResults as r}
								<button class="search-result" onclick={() => selectRunnerView(r)}>
									{#if r.avatar_url}
										<img class="search-result__avatar" src={r.avatar_url} alt="" />
									{:else}
										<div class="search-result__avatar search-result__avatar--placeholder">{(r.display_name || r.runner_id).charAt(0).toUpperCase()}</div>
									{/if}
									<div>
										<span class="search-result__name">{r.display_name || r.runner_id}</span>
										<span class="search-result__id muted">{r.runner_id}</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<!-- Runner selected: show all contributions across games -->
				<div class="dash-header">
					<Button.Root size="sm" onclick={clearRunnerView}><ArrowLeft size={14} /> Back to Search</Button.Root>
					<div class="dash-game">
						{#if selectedRunnerView.avatar_url}
							<img class="dash-game__cover dash-game__cover--round" src={selectedRunnerView.avatar_url} alt="" />
						{/if}
						<div>
							<strong>{selectedRunnerView.display_name || selectedRunnerView.runner_id}</strong>
							<span class="muted">{selectedRunnerView.runner_id}</span>
						</div>
						<a href={localizeHref(`/runners/${selectedRunnerView.runner_id}`)} target="_blank" class="btn btn--small">View Profile ↗</a>
					</div>
				</div>

				{#if runnerContribLoading}
					<div class="center-sm"><div class="spinner"></div></div>
				{:else if runnerGameGroups.length === 0}
					<div class="empty">
						<ClipboardList size={32} />
						<p class="muted">No contributions found for this runner.</p>
					</div>
				{:else}
					{#each runnerGameGroups as group}
						<div class="section-card">
							<h3><a href={localizeHref(`/games/${group.game_id}`)} target="_blank">{group.game_id}</a></h3>
							<div class="runner-contribs">
								{#each group.contributions as c}
									<div class="runner-contrib-row">
										<span class="type-badge">{c.type}</span>
										<span class="runner-contrib-title">{c.title || '—'}</span>
										{#if c.description}<span class="muted small">{c.description}</span>{/if}
										{#if c.url}<a href={c.url} target="_blank" class="muted small">Link ↗</a>{/if}
										<button class="icon-btn icon-btn--danger" onclick={() => confirmDeleteFromRunner(c)} title="Remove"><Trash2 size={14} /></button>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			{/if}
		{/if}
	{/if}
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class={confirmVariant === 'danger' ? 'btn btn--danger' : 'btn'} onclick={handleConfirmAction}>Confirm</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.contributions-page { max-width: 960px; }
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; }
	.small { font-size: 0.85rem; }

	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
	.toast--error { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

	/* Search */
	.search-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin: 1rem 0; }
	.search-bar input { flex: 1; background: none; border: none; color: var(--fg); font-size: 0.9rem; font-family: inherit; outline: none; }
	.search-bar__clear { appearance: none; background: none; border: none; color: var(--muted); cursor: pointer; padding: 0.25rem; }

	.search-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
	.search-row { display: flex; gap: 0.5rem; }
	.search-row input { flex: 1; padding: 0.6rem 0.8rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.search-row input:focus { border-color: var(--accent); outline: none; }

	.search-results { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; }
	.search-result { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.8rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; width: 100%; text-align: left; font-family: inherit; font-size: inherit; color: var(--fg); }
	.search-result:hover { border-color: var(--accent); }
	.search-result__avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.search-result__avatar--placeholder { display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); font-weight: 700; font-size: 0.8rem; color: var(--muted); }
	.search-result__name { font-weight: 600; }
	.search-result__id { font-size: 0.8rem; margin-left: 0.25rem; }

	/* Game list */
	.games-list { display: flex; flex-direction: column; gap: 0.25rem; }
	.game-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.8rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; width: 100%; text-align: left; font-family: inherit; font-size: inherit; color: var(--fg); }
	.game-row:hover { border-color: var(--accent); }
	.game-row__cover { width: 36px; height: 48px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
	.game-row__cover--empty { display: flex; align-items: center; justify-content: center; background: var(--bg); border: 1px solid var(--border); color: var(--muted); }
	.game-row__info { flex: 1; display: flex; flex-direction: column; }
	.game-row__name { font-weight: 600; font-size: 0.9rem; }
	.game-row__id { font-size: 0.8rem; }
	.game-row__status { font-size: 0.8rem; }

	/* Dashboard header */
	.dash-header { display: flex; flex-direction: column; gap: 0.75rem; margin: 1rem 0; }
	.dash-game { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
	.dash-game__cover { width: 36px; height: 48px; border-radius: 4px; object-fit: cover; }
	.dash-game__cover--round { width: 36px; height: 36px; border-radius: 50%; }
	.dash-game a { margin-left: auto; }

	/* Section cards */
	.section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
	.section-card h3 { font-size: 1rem; margin: 0 0 0.25rem; }
	.section-card h3 a { color: var(--fg); text-decoration: none; }
	.section-card h3 a:hover { color: var(--accent); }

	/* Type chips */
	.type-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.75rem 0; }
	.type-chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.3rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; color: var(--fg); }
	.type-chip--custom { border-color: var(--accent); background: rgba(var(--accent-rgb, 99,102,241), 0.08); }
	.type-chip__remove { appearance: none; background: none; border: none; color: var(--muted); cursor: pointer; padding: 0; line-height: 1; }
	.type-chip__remove:hover { color: #ef4444; }

	.add-type-row { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.add-type-row input { flex: 1; padding: 0.4rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.add-type-row input:focus { border-color: var(--accent); outline: none; }

	/* Contributions table */
	.contrib-table-wrap { overflow-x: auto; margin: 0.75rem 0; }
	.contrib-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
	.contrib-table th { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 2px solid var(--border); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); white-space: nowrap; }
	.contrib-table td { padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
	.contrib-table tr:hover td { background: rgba(var(--accent-rgb, 99,102,241), 0.03); }
	.group-divider td { border-bottom: 2px solid var(--border); padding: 0; height: 2px; }
	.col-runner { min-width: 100px; max-width: 140px; }
	.col-runner a { color: var(--fg); text-decoration: none; }
	.col-runner a:hover { color: var(--accent); }
	.col-type { min-width: 80px; }
	.col-title { min-width: 120px; }
	.col-desc { min-width: 140px; }
	.col-actions { white-space: nowrap; width: 70px; }

	.type-badge { display: inline-block; padding: 0.15rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.78rem; }

	/* Edit / add rows */
	.edit-row td, .add-row td { background: rgba(var(--accent-rgb, 99,102,241), 0.06); }
	.edit-row select, .add-row select,
	.edit-row input, .add-row input { width: 100%; padding: 0.3rem 0.4rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--fg); font-size: 0.82rem; font-family: inherit; }
	.edit-row select:focus, .add-row select:focus,
	.edit-row input:focus, .add-row input:focus { border-color: var(--accent); outline: none; }

	.btn-inline { appearance: none; background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; font-family: inherit; display: flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0; }
	.btn-inline:hover { color: var(--accent); }

	/* Icon buttons */
	.icon-btn { appearance: none; background: none; border: 1px solid transparent; border-radius: 4px; padding: 0.25rem; cursor: pointer; color: var(--muted); line-height: 1; }
	.icon-btn:hover { color: var(--fg); border-color: var(--border); }
	.icon-btn--danger:hover { color: #ef4444; border-color: rgba(239,68,68,0.3); }
	.icon-btn--save { color: var(--accent); }
	.icon-btn--save:hover { color: var(--accent); border-color: var(--accent); }

	/* Add runner section */
	.add-runner-section { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.add-runner-section h4 { margin: 0 0 0.5rem; font-size: 0.9rem; }

	.new-runner-add { margin-top: 0.75rem; padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin: 0.5rem 0; }
	.field-row { display: flex; flex-direction: column; gap: 0.2rem; }
	.field-row label { font-size: 0.78rem; font-weight: 600; color: var(--muted); }
	.field-row input, .field-row select { padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.field-row input:focus, .field-row select:focus { border-color: var(--accent); outline: none; }
	.field-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

	/* Runner view */
	.runner-contribs { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; }
	.runner-contrib-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; flex-wrap: wrap; }
	.runner-contrib-title { font-weight: 500; }

	/* Utility */
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
	.btn--small { padding: 0.3rem 0.6rem; font-size: 0.8rem; }
	.btn--danger { background: rgba(239,68,68,0.1); color: #ef4444; border-color: rgba(239,68,68,0.3); }
	.empty { text-align: center; padding: 2rem; color: var(--muted); }
	.empty-sm { text-align: center; padding: 1rem; }
	.center-sm { text-align: center; padding: 2rem; }

	@media (max-width: 640px) {
		.search-row { flex-direction: column; }
		.field-grid { grid-template-columns: 1fr; }
		.dash-game { flex-wrap: wrap; }
		.contrib-table { font-size: 0.78rem; }
		.col-desc { display: none; }
	}
</style>
