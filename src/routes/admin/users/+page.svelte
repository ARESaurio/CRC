<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, Search, Save } from 'lucide-svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Checkbox from '$lib/components/ui/checkbox/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';

	let checking = $state(true);
	let myRole = $state<any>(null);
	let users = $state<any[]>([]);
	let games = $state<{ game_id: string; game_name: string }[]>([]);
	let loading = $state(true);
	let searchInput = $state('');
	let searchQuery = $state('');
	let roleFilter = $state('all');
	let currentPage = $state(1);
	let expandedId = $state<string | null>(null);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	const PAGE_SIZE = 10;

	// Role management state
	let roleChanging = $state(false);
	let selectedNewRole = $state('');
	let selectedGameIds = $state<string[]>([]);
	let confirmingRole = $state(false);
	let gamePickerSearch = $state('');
	let editingGames = $state(false);
	let savingGames = $state(false);

	// Filtered + sorted games for the picker (selected games float to top)
	const pickerGames = $derived.by(() => {
		const q = gamePickerSearch.toLowerCase();
		const filtered = games.filter(g => !q || g.game_name.toLowerCase().includes(q));
		return [...filtered].sort((a, b) => {
			const aSelected = selectedGameIds.includes(a.game_id) ? 0 : 1;
			const bSelected = selectedGameIds.includes(b.game_id) ? 0 : 1;
			return aSelected - bSelected;
		});
	});
	const pickerHasResults = $derived(pickerGames.length > 0);

	// Cache of user game assignments: user_id → { verifier: game_id[], moderator: game_id[] }
	let userGameAssignments = $state<Record<string, { verifier: string[]; moderator: string[] }>>({});
	let loadingAssignments = $state(false);

	// Export

	// Debounce search input (300ms) to avoid re-filtering on every keystroke
	$effect(() => {
		const value = searchInput;
		if (!value) { searchQuery = ''; return; }
		const timer = setTimeout(() => { searchQuery = value; }, 300);
		return () => clearTimeout(timer);
	});

	// Role hierarchy
	const ROLE_LEVELS: Record<string, number> = {
		super_admin: 4, admin: 3, moderator: 2, verifier: 1, user: 0
	};
	const ROLE_META: Record<string, { icon: string; label: string; color: string }> = {
		super_admin: { icon: '⭐', label: 'Super Admin', color: '#ef4444' },
		admin:       { icon: '🛡️', label: 'Admin',       color: '#f59e0b' },
		moderator:   { icon: 'ðŸ”°', label: 'Moderator',   color: '#8b5cf6' },
		verifier:    { icon: '✅', label: 'Verifier',     color: '#3b82f6' },
		user:        { icon: '👤', label: 'User',         color: '#6b7280' },
	};

	function getEffectiveRole(u: any): string {
		if (u.is_super_admin) return 'super_admin';
		if (u.is_admin) return 'admin';
		if (u.role === 'moderator') return 'moderator';
		if (u.role === 'verifier') return 'verifier';
		return 'user';
	}

	function getMyLevel(): number {
		if (!myRole) return 0;
		if (myRole.superAdmin) return 4;
		if (myRole.admin) return 3;
		if (myRole.moderator) return 2;
		return 0;
	}

	const isAdmin = $derived(myRole?.admin || myRole?.superAdmin);

	// Roles the current user can assign (strictly below their own level)
	const assignableRoles = $derived.by(() => {
		const myLevel = getMyLevel();
		return Object.entries(ROLE_LEVELS)
			.filter(([, level]) => level < myLevel && level < 4) // never assign super_admin
			.map(([role]) => role)
			.sort((a, b) => ROLE_LEVELS[b] - ROLE_LEVELS[a]);
	});

	function canModifyUser(u: any): boolean {
		if (!myRole) return false;
		const myLevel = getMyLevel();
		const targetLevel = ROLE_LEVELS[getEffectiveRole(u)] ?? 0;
		return myLevel > targetLevel && myLevel >= 2;
	}

	// ── Data ──────────────────────────────────────────────────────────────────
	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/users'); return; }
				myRole = await checkAdminRole();
				const hasAccess = myRole?.admin || myRole?.moderator;
				checking = false;
				if (hasAccess) await Promise.all([loadUsers(), loadGames()]);
			}
		});
		return unsub;
	});

	async function loadUsers() {
		loading = true;
		try {
			const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
			if (error) throw error;
			users = data || [];
		} catch { users = []; }
		loading = false;
	}

	async function loadGames() {
		try {
			const { data } = await supabase.from('games').select('game_id, game_name').order('game_name');
			games = data || [];
		} catch { games = []; }
	}

	// ── Filtering ─────────────────────────────────────────────────────────────
	const filteredUsers = $derived.by(() => {
		let result = [...users];
		if (roleFilter === 'admins') result = result.filter(u => u.is_admin || u.is_super_admin);
		else if (roleFilter === 'moderators') result = result.filter(u => u.role === 'moderator');
		else if (roleFilter === 'verifiers') result = result.filter(u => u.role === 'verifier');
		else if (roleFilter === 'staff') result = result.filter(u => u.is_admin || u.is_super_admin || u.role === 'moderator' || u.role === 'verifier');
		else if (roleFilter === 'pending') result = result.filter(u => u.status === 'pending');
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			result = result.filter(u =>
				(u.runner_id||'').toLowerCase().includes(q) ||
				(u.display_name||'').toLowerCase().includes(q)
			);
		}
		return result;
	});

	const pageUsers = $derived(filteredUsers.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE));
	const totalPages = $derived(Math.ceil(filteredUsers.length / PAGE_SIZE) || 1);

	let staffCount = $derived(users.filter(u => u.is_admin || u.is_super_admin || u.role === 'moderator' || u.role === 'verifier').length);
	let pendingCount = $derived(users.filter(u => u.status === 'pending').length);

	function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }

	// ── User Expand & Role Management ─────────────────────────────────────────
	function toggleUser(userId: string) {
		if (expandedId === userId) {
			expandedId = null;
			selectedNewRole = '';
			selectedGameIds = [];
			confirmingRole = false;
			gamePickerSearch = '';
			editingGames = false;
		} else {
			expandedId = userId;
			selectedNewRole = '';
			selectedGameIds = [];
			confirmingRole = false;
			gamePickerSearch = '';
			editingGames = false;
			// Fetch current game assignments if not cached
			if (!userGameAssignments[userId]) {
				loadUserGameAssignments(userId);
			}
		}
	}

	async function loadUserGameAssignments(userId: string) {
		loadingAssignments = true;
		try {
			const [vRes, mRes] = await Promise.all([
				supabase.from('role_game_verifiers').select('game_id').eq('user_id', userId),
				supabase.from('role_game_moderators').select('game_id').eq('user_id', userId)
			]);
			userGameAssignments[userId] = {
				verifier: (vRes.data || []).map((r: any) => r.game_id),
				moderator: (mRes.data || []).map((r: any) => r.game_id)
			};
			userGameAssignments = { ...userGameAssignments };
		} catch {
			userGameAssignments[userId] = { verifier: [], moderator: [] };
			userGameAssignments = { ...userGameAssignments };
		}
		loadingAssignments = false;
	}

	function toggleGameId(gid: string) {
		if (selectedGameIds.includes(gid)) {
			selectedGameIds = selectedGameIds.filter(id => id !== gid);
		} else {
			selectedGameIds = [...selectedGameIds, gid];
		}
	}

	function startEditGames(user: any) {
		const role = getEffectiveRole(user);
		const assignments = userGameAssignments[user.user_id];
		if (!assignments) return;
		// Pre-populate with current games for their role
		if (role === 'moderator') {
			selectedGameIds = [...assignments.moderator];
		} else if (role === 'verifier') {
			selectedGameIds = [...assignments.verifier];
		}
		editingGames = true;
		gamePickerSearch = '';
		selectedNewRole = '';
		confirmingRole = false;
	}

	function cancelEditGames() {
		editingGames = false;
		selectedGameIds = [];
		gamePickerSearch = '';
	}

	async function handleSaveGames(user: any) {
		const role = getEffectiveRole(user);
		if (role !== 'moderator' && role !== 'verifier') return;
		if (role === 'moderator' && selectedGameIds.length === 0) return;

		savingGames = true;
		toast = null;

		const payload: Record<string, any> = {
			target_user_id: user.user_id,
			new_role: role,
			game_ids: selectedGameIds
		};

		const result = await adminAction('/assign-role', payload);
		if (result.ok) {
			toast = { type: 'success', text: `Game assignments updated for ${user.display_name || user.runner_id}` };
			// Refresh cached game assignments
			delete userGameAssignments[user.user_id];
			userGameAssignments = { ...userGameAssignments };
			await loadUserGameAssignments(user.user_id);
			editingGames = false;
			selectedGameIds = [];
			gamePickerSearch = '';
		} else {
			toast = { type: 'error', text: result.message };
		}
		savingGames = false;
		setTimeout(() => toast = null, 4000);
	}

	async function handleAssignRole(user: any) {
		if (!user || !selectedNewRole) return;
		roleChanging = true;
		toast = null;

		const payload: Record<string, any> = {
			target_user_id: user.user_id,
			new_role: selectedNewRole
		};
		if ((selectedNewRole === 'verifier' || selectedNewRole === 'moderator') && selectedGameIds.length > 0) {
			payload.game_ids = selectedGameIds;
		}

		const result = await adminAction('/assign-role', payload);
		if (result.ok) {
			toast = { type: 'success', text: `${user.display_name || user.runner_id} updated to ${ROLE_META[selectedNewRole].label}` };
			const idx = users.findIndex(u => u.user_id === user.user_id);
			if (idx >= 0) {
				const updated = { ...users[idx] };
				switch (selectedNewRole) {
					case 'admin':
						updated.is_admin = true; updated.is_super_admin = false; updated.role = 'admin'; break;
					case 'moderator':
						updated.is_admin = false; updated.is_super_admin = false; updated.role = 'moderator'; break;
					case 'verifier':
						updated.is_admin = false; updated.is_super_admin = false; updated.role = 'verifier'; break;
					case 'user':
						updated.is_admin = false; updated.is_super_admin = false; updated.role = null; break;
				}
				users[idx] = updated;
				users = [...users];
			}
			// Refresh cached game assignments
			delete userGameAssignments[user.user_id];
			userGameAssignments = { ...userGameAssignments };
			loadUserGameAssignments(user.user_id);
			confirmingRole = false;
			selectedNewRole = '';
			selectedGameIds = [];
			gamePickerSearch = '';
		} else {
			toast = { type: 'error', text: result.message };
			confirmingRole = false;
		}
		roleChanging = false;
		setTimeout(() => toast = null, 4000);
	}


	// ── Per-User Full Data Export (GDPR/CCPA compliance) ──────────────────────
	let userExporting = $state(false);
	let userExportError = $state('');

	async function exportUserData(user: any) {
		if (!isAdmin) return;
		userExporting = true;
		userExportError = '';

		const userId = user.user_id;
		const runnerId = user.runner_id;

		try {
			// Fetch all user-related data in parallel
			const [
				profileRes,
				pendingProfileRes,
				runsRes,
				pendingRunsRes,
				achievementsRes,
				linkedAccountsRes,
				ticketsRes,
				messagesRes,
				gameUpdatesRes,
				pendingGamesRes,
				reportsRes,
				verifierRolesRes,
				moderatorRolesRes,
				profileAuditRes,
			] = await Promise.all([
				supabase.from('profiles').select('*').eq('user_id', userId),
				supabase.from('pending_profiles').select('*').eq('user_id', userId),
				runnerId ? supabase.from('runs').select('*').eq('runner_id', runnerId) : { data: [], error: null },
				supabase.from('pending_runs').select('*').eq('submitted_by', userId),
				runnerId ? supabase.from('game_achievements').select('*').eq('runner_id', runnerId) : { data: [], error: null },
				supabase.from('linked_accounts').select('*').eq('user_id', userId),
				supabase.from('support_tickets').select('*').eq('submitted_by', userId),
				supabase.from('support_messages').select('*').eq('sender_id', userId),
				supabase.from('game_update_requests').select('*').eq('user_id', userId),
				supabase.from('pending_games').select('*').eq('submitted_by', userId),
				supabase.from('user_reports').select('*').eq('reported_by', userId),
				supabase.from('role_game_verifiers').select('*').eq('user_id', userId),
				supabase.from('role_game_moderators').select('*').eq('user_id', userId),
				supabase.from('audit_profile_log').select('*').eq('user_id', userId),
			]);

			const exportData = {
				export_metadata: {
					exported_at: new Date().toISOString(),
					exported_by: 'CRC Admin Panel',
					user_id: userId,
					runner_id: runnerId || null,
					reason: 'Data subject access request (Privacy Policy Section 8)',
				},
				profile: profileRes.data || [],
				pending_profiles: pendingProfileRes.data || [],
				runs: runsRes.data || [],
				pending_runs: pendingRunsRes.data || [],
				achievements: achievementsRes.data || [],
				linked_accounts: linkedAccountsRes.data || [],
				support_tickets: ticketsRes.data || [],
				support_messages: messagesRes.data || [],
				game_update_requests: gameUpdatesRes.data || [],
				pending_games: pendingGamesRes.data || [],
				user_reports_filed: reportsRes.data || [],
				role_assignments: {
					verifier: verifierRolesRes.data || [],
					moderator: moderatorRolesRes.data || [],
				},
				profile_audit_log: profileAuditRes.data || [],
			};

			const filename = `crc-user-export-${runnerId || userId}-${new Date().toISOString().slice(0,10)}.json`;
			downloadFile(JSON.stringify(exportData, null, 2), filename, 'application/json');
			toast = { type: 'success', text: `Full data export generated for ${user.display_name || runnerId}` };
			setTimeout(() => toast = null, 4000);
		} catch (e: any) {
			userExportError = e.message || 'Export failed';
			toast = { type: 'error', text: 'Failed to generate user data export' };
			setTimeout(() => toast = null, 4000);
		}
		userExporting = false;
	}
	function downloadFile(content: string, filename: string, type: string) {
		const blob = new Blob([content], { type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>{m.admin_users_title()}</title></svelte:head>
<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>â† {m.admin_dashboard()}</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_verifying_access()}</p></div>
	{:else if !myRole?.admin && !myRole?.moderator}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_moderator_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>{m.admin_users_heading()}</h1>
		<p class="muted mb-2">{m.admin_users_heading()}</p>

		{#if toast}
			<div class="toast toast--{toast.type}">{toast.text}</div>
		{/if}

		<!-- Filters -->
		<div class="filters card">
			<div class="filters__row">
				<div class="filters__tabs">
					<ToggleGroup.Root class="filter-tabs" bind:value={roleFilter} onValueChange={(v: string) => { currentPage = 1; }}>
						<ToggleGroup.Item value="all">
							All <span class="filter-tab__count">{users.length}</span>
						</ToggleGroup.Item>
						<ToggleGroup.Item value="staff">
							Staff <span class="filter-tab__count">{staffCount}</span>
						</ToggleGroup.Item>
						<ToggleGroup.Item value="admins">
							Admins
						</ToggleGroup.Item>
						<ToggleGroup.Item value="moderators">
							Moderators
						</ToggleGroup.Item>
						<ToggleGroup.Item value="verifiers">
							Verifiers
						</ToggleGroup.Item>
						<ToggleGroup.Item value="pending">
							Pending <span class="filter-tab__count">{pendingCount}</span>
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<Button.Root size="sm" onclick={loadUsers} disabled={loading}>â†» Refresh</Button.Root>
			</div>
			<div class="filters__advanced">
				<div class="filter-group filter-group--search">
					<label class="filter-label">{m.admin_users_search()}</label>
					<input type="text" class="filter-input" bind:value={searchInput} placeholder="Runner ID or display name..." oninput={() => currentPage = 1} />
				</div>
				{#if searchInput || roleFilter !== 'all'}
					<Button.Root size="sm" onclick={() => { searchInput = ''; searchQuery = ''; roleFilter = 'all'; currentPage = 1; }}>✕ Clear</Button.Root>
				{/if}
			</div>
		</div>

		<!-- Users List -->
		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">{m.admin_loading_users()}</p></div></div>
		{:else if filteredUsers.length === 0}
			<div class="card">
				<div class="empty"><span class="empty__icon">ðŸ”</span><h3>{m.admin_users_no_users()}</h3><p class="muted">{m.admin_users_try_filters()}</p></div>
			</div>
		{:else}
			<div class="users-list">
				{#each pageUsers as user (user.user_id || user.runner_id)}
					{@const effectiveRole = getEffectiveRole(user)}
					{@const meta = ROLE_META[effectiveRole]}
					<Collapsible.Root open={expandedId === user.user_id} onOpenChange={(isOpen: boolean) => {
						if (isOpen && expandedId !== user.user_id) {
							expandedId = user.user_id;
							selectedNewRole = '';
							selectedGameIds = [];
							confirmingRole = false;
							gamePickerSearch = '';
							editingGames = false;
							if (!userGameAssignments[user.user_id]) loadUserGameAssignments(user.user_id);
						} else if (!isOpen && expandedId === user.user_id) {
							expandedId = null;
							selectedNewRole = '';
							selectedGameIds = [];
							confirmingRole = false;
							gamePickerSearch = '';
							editingGames = false;
						}
					}} class="user-card">
						<Collapsible.Trigger class="user-card__header">
							<div class="user-card__info">
								<span class="user-card__name">{user.display_name || user.runner_id || '—'}</span>
								{#if user.display_name && user.runner_id}
									<span class="user-card__runner-id">{user.runner_id}</span>
								{/if}
							</div>
							<div class="user-card__meta">
								<span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span>
								<span class="user-card__date muted">{fmtDate(user.created_at)}</span>
							</div>
						</Collapsible.Trigger>

						<Collapsible.Content class="user-card__body">
								<!-- User Details -->
								<div class="user-details">
									<div class="user-detail"><span class="user-detail__label">{m.admin_users_runner_id()}</span><span class="user-detail__value"><a href={localizeHref(`/runners/${user.runner_id}`)}>{user.runner_id}</a></span></div>
									<div class="user-detail"><span class="user-detail__label">{m.admin_users_display_name()}</span><span class="user-detail__value">{user.display_name || '—'}</span></div>
									<div class="user-detail"><span class="user-detail__label">{m.admin_users_role()}</span><span class="user-detail__value"><span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span></span></div>
									<div class="user-detail"><span class="user-detail__label">{m.admin_users_status()}</span><span class="user-detail__value">{user.status || '—'}</span></div>
									<div class="user-detail"><span class="user-detail__label">{m.admin_users_joined()}</span><span class="user-detail__value">{fmtDate(user.created_at)}</span></div>
									{#if user.location}<div class="user-detail"><span class="user-detail__label">{m.admin_users_location()}</span><span class="user-detail__value">{user.location}</span></div>{/if}
									{#if user.pronouns}<div class="user-detail"><span class="user-detail__label">{m.admin_users_pronouns()}</span><span class="user-detail__value">{user.pronouns}</span></div>{/if}
								</div>

								<!-- Current Game Assignments -->
								{@const assignments = userGameAssignments[user.user_id]}
								{#if editingGames && expandedId === user.user_id}
									<div class="game-assignments game-assignments--editing">
										<div class="game-assignments__header">
											<span class="game-assignments__label">Edit Game Assignments — {effectiveRole === 'moderator' ? 'ðŸ”° Moderator' : '✅ Verifier'}</span>
										</div>
										<input type="text" class="filter-input" bind:value={gamePickerSearch} placeholder="Search games..." style="margin-bottom:0.5rem;" />
										<div class="game-picker__list">
											{#each pickerGames as game}
												<div class="game-picker__item">
													<Checkbox.Root checked={selectedGameIds.includes(game.game_id)} onCheckedChange={() => toggleGameId(game.game_id)} />
													<span>{game.game_name}</span>
												</div>
											{/each}
											{#if !pickerHasResults && gamePickerSearch}
												<p class="muted" style="font-size:0.8rem;">No games matching "{gamePickerSearch}"</p>
											{:else if games.length === 0}
												<p class="muted" style="font-size:0.8rem;">{m.admin_users_no_games()}</p>
											{/if}
										</div>
										{#if selectedGameIds.length > 0}
											<div class="game-picker__footer">
												<p class="muted" style="font-size:0.8rem;">{selectedGameIds.length} game{selectedGameIds.length === 1 ? '' : 's'} selected</p>
												<button class="btn btn--small" onclick={() => { selectedGameIds = []; }}>Clear all</button>
												<button class="btn btn--small" onclick={() => { selectedGameIds = games.map(g => g.game_id); }}>Select all</button>
											</div>
										{:else}
											<div class="game-picker__footer">
												<p class="muted" style="font-size:0.8rem;">No games selected</p>
												<button class="btn btn--small" onclick={() => { selectedGameIds = games.map(g => g.game_id); }}>Select all</button>
											</div>
										{/if}
										{#if effectiveRole === 'moderator' && selectedGameIds.length === 0}
											<p class="muted" style="font-size:0.8rem; margin-top:0.25rem; color: #ef4444;">Moderators require at least one game.</p>
										{/if}
										<div class="game-assignments__actions">
											<Button.Root variant="accent" size="sm" onclick={() => handleSaveGames(user)} disabled={savingGames || (effectiveRole === 'moderator' && selectedGameIds.length === 0)}>
												{savingGames ? 'Saving...' : '💾 Save Games'}
											</Button.Root>
											<Button.Root size="sm" onclick={cancelEditGames} disabled={savingGames}>Cancel</Button.Root>
										</div>
									</div>
								{:else if assignments && (assignments.verifier.length > 0 || assignments.moderator.length > 0)}
									<div class="game-assignments">
										<div class="game-assignments__header">
											<span class="game-assignments__label">Game Assignments</span>
											{#if canModifyUser(user) && (effectiveRole === 'moderator' || effectiveRole === 'verifier')}
												<button class="btn btn--small" onclick={() => startEditGames(user)}>âœï¸ Edit Games</button>
											{/if}
										</div>
										{#if assignments.moderator.length > 0}
											<div class="game-assignments__group">
												<span class="game-assignments__role">ðŸ”° Moderator:</span>
												<div class="game-assignments__tags">
													{#each assignments.moderator as gid}
														{@const gameName = games.find(g => g.game_id === gid)?.game_name || gid}
														<span class="game-tag game-tag--mod">{gameName}</span>
													{/each}
												</div>
											</div>
										{/if}
										{#if assignments.verifier.length > 0}
											{@const verifierOnly = assignments.verifier.filter((gid: string) => !assignments.moderator.includes(gid))}
											{#if verifierOnly.length > 0}
												<div class="game-assignments__group">
													<span class="game-assignments__role">✅ Verifier only:</span>
													<div class="game-assignments__tags">
														{#each verifierOnly as gid}
															{@const gameName = games.find(g => g.game_id === gid)?.game_name || gid}
															<span class="game-tag game-tag--ver">{gameName}</span>
														{/each}
													</div>
												</div>
											{/if}
										{/if}
									</div>
								{:else if loadingAssignments && expandedId === user.user_id}
									<p class="muted" style="font-size:0.8rem; margin-top:0.5rem;">Loading game assignmentsâ€¦</p>
								{:else if canModifyUser(user) && (effectiveRole === 'moderator' || effectiveRole === 'verifier')}
									<div class="game-assignments">
										<div class="game-assignments__header">
											<span class="game-assignments__label">Game Assignments</span>
											<button class="btn btn--small" onclick={() => startEditGames(user)}>âœï¸ Add Games</button>
										</div>
										<p class="muted" style="font-size:0.8rem;">No games assigned yet.</p>
									</div>
								{/if}

								<!-- Role Management -->
								{#if canModifyUser(user)}
									<div class="role-section">
										<h3>ðŸ”§ Change Role</h3>
										<p class="muted" style="font-size:0.85rem; margin-bottom:0.75rem;">
											Assign a new role. You can only assign roles below your own.
										</p>

										<div class="role-options">
											{#each assignableRoles as role}
												{@const rm = ROLE_META[role]}
												<button
													class="role-option"
													class:role-option--selected={selectedNewRole === role}
													class:role-option--current={effectiveRole === role}
													onclick={() => {
														if (selectedNewRole === role) {
															selectedNewRole = '';
															selectedGameIds = [];
														} else {
															selectedNewRole = role;
															// Pre-populate with current game assignments
															const assignments = userGameAssignments[user.user_id];
															if (assignments && (role === 'verifier' || role === 'moderator')) {
																const currentGames = role === 'moderator' ? assignments.moderator : assignments.verifier;
																selectedGameIds = [...currentGames];
															} else {
																selectedGameIds = [];
															}
														}
														confirmingRole = false;
														gamePickerSearch = '';
													}}
													disabled={effectiveRole === role}
												>
													<span class="role-option__icon">{rm.icon}</span>
													<div class="role-option__info">
														<span class="role-option__name">{rm.label}</span>
														{#if effectiveRole === role}<span class="role-option__note">{m.admin_users_current_role()}</span>{/if}
													</div>
													<span class="role-option__dot" style="background:{rm.color}"></span>
												</button>
											{/each}
										</div>

											<!-- Game picker for verifier/moderator -->
										{#if selectedNewRole === 'verifier' || selectedNewRole === 'moderator'}
											<div class="game-picker">
												<label class="game-picker__label">
													{m.admin_users_assign_games()}
													{#if selectedNewRole === 'moderator'}<span style="color:#ef4444;"> *required</span>{/if}
												</label>
												{#if selectedNewRole === 'moderator'}
													<p class="muted" style="font-size:0.8rem; margin-bottom:0.5rem;">Moderator also grants verifier privileges for the selected games.</p>
												{/if}
												<input type="text" class="filter-input" bind:value={gamePickerSearch} placeholder="Search games..." style="margin-bottom:0.5rem;" />
												<div class="game-picker__list">
													{#each pickerGames as game}
														<div class="game-picker__item">
															<Checkbox.Root checked={selectedGameIds.includes(game.game_id)} onCheckedChange={() => toggleGameId(game.game_id)} />
															<span>{game.game_name}</span>
														</div>
													{/each}
													{#if !pickerHasResults && gamePickerSearch}
														<p class="muted" style="font-size:0.8rem;">No games matching "{gamePickerSearch}"</p>
													{:else if games.length === 0}
														<p class="muted" style="font-size:0.8rem;">{m.admin_users_no_games()}</p>
													{/if}
												</div>
												{#if selectedGameIds.length > 0}
													<div class="game-picker__footer">
														<p class="muted" style="font-size:0.8rem;">{selectedGameIds.length} game{selectedGameIds.length === 1 ? '' : 's'} selected</p>
														<button class="btn btn--small" onclick={() => { selectedGameIds = []; }}>Clear all</button>
														<button class="btn btn--small" onclick={() => { selectedGameIds = games.map(g => g.game_id); }}>Select all</button>
													</div>
												{:else}
													<div class="game-picker__footer">
														<p class="muted" style="font-size:0.8rem;">No games selected</p>
														<button class="btn btn--small" onclick={() => { selectedGameIds = games.map(g => g.game_id); }}>Select all</button>
													</div>
												{/if}
											</div>
										{/if}

										<!-- Confirm -->
										{#if selectedNewRole}
											{@const needsGames = selectedNewRole === 'moderator' && selectedGameIds.length === 0}
											{#if !confirmingRole}
												<Button.Root variant="accent" class="mt-2" onclick={() => confirmingRole = true} disabled={needsGames}>
													Change to {ROLE_META[selectedNewRole].icon} {ROLE_META[selectedNewRole].label}
												</Button.Root>
												{#if needsGames}
													<p class="muted" style="font-size:0.8rem; margin-top:0.25rem;">Select at least one game to assign moderator.</p>
												{/if}
											{:else}
												<div class="confirm-box">
													<p>
														Change <strong>{user.display_name || user.runner_id}</strong> from
														<span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span>
														to
														<span class="role-badge" style="background:{ROLE_META[selectedNewRole].color}">{ROLE_META[selectedNewRole].icon} {ROLE_META[selectedNewRole].label}</span>?
													</p>
													<div class="confirm-box__actions">
														<Button.Root variant="danger" onclick={() => handleAssignRole(user)} disabled={roleChanging}>
															{roleChanging ? 'Applying...' : 'Confirm Change'}
														</Button.Root>
														<Button.Root onclick={() => confirmingRole = false} disabled={roleChanging}>{m.admin_cancel()}</Button.Root>
													</div>
												</div>
											{/if}
										{/if}
									</div>
								{:else}
									<div class="role-section role-section--locked">
										<h3>ðŸ”§ Role Management</h3>
										<p class="muted" style="font-size:0.85rem;">
											{#if effectiveRole === 'super_admin'}
												Super Admin roles cannot be changed via this panel.
											{:else if ROLE_LEVELS[effectiveRole] >= getMyLevel()}
												You cannot modify users at or above your own role level.
											{:else}
												You do not have permission to manage roles.
											{/if}
										</p>
									</div>
								{/if}

								<div class="user-card__footer">
									<a href={localizeHref(`/runners/${user.runner_id}`)} class="btn btn--small" target="_blank">{m.admin_users_view_profile()}</a>
									{#if isAdmin}
										<Button.Root size="sm" onclick={() => exportUserData(user)} disabled={userExporting}>
											{userExporting ? 'Exporting...' : 'ðŸ“¥ Export User Data'}
										</Button.Root>
									{/if}
								</div>
						</Collapsible.Content>
					</Collapsible.Root>
				{/each}
			</div>

			<!-- Pagination -->
			<div class="pagination-bar">
				{#if totalPages > 1}
					<Pagination.Root bind:page={currentPage} count={filteredUsers.length} perPage={PAGE_SIZE} class="pagination">
						<Pagination.PrevButton>â† Previous</Pagination.PrevButton>
						<span class="muted">Page {currentPage} of {totalPages} · {filteredUsers.length} users</span>
						<Pagination.NextButton>{m.admin_users_next()}</Pagination.NextButton>
					</Pagination.Root>
				{:else}
					<span class="muted pagination-count">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
				{/if}
			</div>
		{/if}

		<!-- Export -->
		{#if isAdmin}
			<div class="card mt-3">
				<h2>{m.admin_users_export()}</h2>
				<div class="export-section">
					<div class="export-block">
						<h3>{m.admin_users_export_individual()}</h3>
						<p class="muted">{m.admin_users_export_desc()}</p>
					</div>
				</div>
				<p class="muted mt-1" style="font-size:0.8rem;">⚠ï¸ Exports are logged. Only export for legitimate purposes (data subject requests, backups).</p>
			</div>
		{:else}
			<div class="card mt-3">
				<h2>{m.admin_users_export_data()}</h2>
				<p class="muted">{m.admin_users_export_admin_only()}</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mt-1 { margin-top: 0.5rem; } .mt-2 { margin-top: 0.75rem; } .mt-3 { margin-top: 1.5rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; font-family: inherit; gap: 0.35rem; }
	.btn--danger { background: #ef4444; color: #fff; border-color: #ef4444; }
	.btn--danger:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Toast */
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

	/* Filters */
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
	.filter-group--search { flex: 1; min-width: 200px; }
	.filter-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.filter-input { padding: 0.35rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; width: 100%; }
	.filter-input:focus { border-color: var(--accent); outline: none; }

	/* Empty */
	.empty { text-align: center; padding: 3rem 1rem; }
	.empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
	.empty h3 { margin: 0 0 0.5rem; }

	/* User cards */
	.users-list { display: flex; flex-direction: column; gap: 0.5rem; }
	:global(.user-card) { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	:global(.user-card .user-card__header) { display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.25rem; cursor: pointer; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; gap: 1rem; transition: background 0.1s; }
	:global(.user-card .user-card__header:hover) { background: rgba(255,255,255,0.02); }
	.user-card__info { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; min-width: 0; }
	.user-card__name { font-weight: 600; font-size: 1rem; }
	.user-card__runner-id { font-size: 0.8rem; color: var(--muted); font-family: monospace; }
	.user-card__meta { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
	.user-card__date { font-size: 0.8rem; white-space: nowrap; }

	/* Role badges */
	.role-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.55rem; font-size: 0.7rem; font-weight: 600; border-radius: 4px; color: white; white-space: nowrap; }

	/* User card body */
	:global(.user-card__body) { border-top: 1px solid var(--border); padding: 1.25rem; }
	.user-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
	.user-detail { display: flex; flex-direction: column; gap: 0.2rem; }
	.user-detail__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
	.user-detail__value { font-weight: 500; word-break: break-word; }
	.user-detail__value a { color: var(--accent); text-decoration: none; }
	.user-detail__value a:hover { text-decoration: underline; }
	.user-card__footer { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem; }

	/* Role management */
	.role-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.role-section h3 { margin: 0 0 0.25rem; font-size: 1rem; }
	.role-section--locked { opacity: 0.5; }

	.role-options { display: flex; flex-direction: column; gap: 0.5rem; }
	.role-option {
		display: flex; align-items: center; gap: 0.65rem;
		padding: 0.65rem 0.85rem; background: var(--bg);
		border: 2px solid var(--border); border-radius: 8px;
		cursor: pointer; text-align: left; color: var(--fg);
		font-family: inherit; transition: border-color 0.15s;
	}
	.role-option:hover:not(:disabled) { border-color: var(--accent); }
	.role-option--selected { border-color: var(--accent); background: rgba(99, 102, 241, 0.05); }
	.role-option--current { opacity: 0.4; cursor: not-allowed; }
	.role-option:disabled { cursor: not-allowed; }
	.role-option__icon { font-size: 1.25rem; flex-shrink: 0; }
	.role-option__info { flex: 1; }
	.role-option__name { font-weight: 600; font-size: 0.9rem; }
	.role-option__note { font-size: 0.7rem; color: var(--muted); display: block; }
	.role-option__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

	/* Game picker */
	.game-picker { margin-top: 0.75rem; padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.game-picker__label { font-size: 0.85rem; font-weight: 600; color: var(--muted); display: block; margin-bottom: 0.5rem; }
	.game-picker__list { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
	.game-picker__item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; padding: 0.25rem 0.35rem; border-radius: 4px; }
	.game-picker__item:hover { background: rgba(255,255,255,0.05); }
	.game-picker__footer { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }

	/* Game assignment badges */
	.game-assignments { margin-top: 0.75rem; padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.game-assignments--editing { border-color: var(--accent); }
	.game-assignments__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
	.game-assignments__label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
	.game-assignments__actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.game-assignments__group { margin-bottom: 0.5rem; }
	.game-assignments__group:last-child { margin-bottom: 0; }
	.game-assignments__role { font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.35rem; }
	.game-assignments__tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.game-tag { display: inline-block; padding: 0.2rem 0.55rem; font-size: 0.75rem; border-radius: 4px; font-weight: 500; }
	.game-tag--mod { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3); }
	.game-tag--ver { background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); }

	/* Confirm */
	.confirm-box { margin-top: 0.75rem; padding: 0.85rem; background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; }
	.confirm-box p { margin: 0 0 0.75rem; font-size: 0.9rem; line-height: 1.6; }
	.confirm-box__actions { display: flex; gap: 0.5rem; }

	/* Pagination */
	.pagination-bar { text-align: center; padding: 1rem; }
	.pagination-count { font-size: 0.85rem; }
	:global(.pagination.ui-pagination) { display: flex; justify-content: center; align-items: center; gap: 1rem; }

	/* Export */
	.export-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
	.export-section { display: flex; flex-direction: column; gap: 1rem; }
	.export-block { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.export-block h3 { font-size: 0.95rem; margin: 0 0 0.35rem; }
	.export-block p { margin: 0 0 0.5rem; font-size: 0.85rem; }

	@media (max-width: 640px) {
		.filters__row { flex-direction: column; align-items: stretch; }
		.user-card__header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
		.user-card__meta { width: 100%; justify-content: space-between; }
		.user-details { grid-template-columns: 1fr 1fr; }
	}
</style>
