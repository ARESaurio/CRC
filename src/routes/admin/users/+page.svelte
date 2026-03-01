<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';

	let checking = $state(true);
	let myRole = $state<any>(null);
	let users = $state<any[]>([]);
	let games = $state<{ game_id: string; game_name: string }[]>([]);
	let loading = $state(true);
	let searchQuery = $state('');
	let roleFilter = $state('all');
	let currentPage = $state(1);
	let expandedId = $state<string | null>(null);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	const PAGE_SIZE = 25;

	// Role management state
	let roleChanging = $state(false);
	let selectedNewRole = $state('');
	let selectedGameIds = $state<string[]>([]);
	let confirmingRole = $state(false);

	// Export
	let exporting = $state(false);

	// Role hierarchy
	const ROLE_LEVELS: Record<string, number> = {
		super_admin: 4, admin: 3, moderator: 2, verifier: 1, user: 0
	};
	const ROLE_META: Record<string, { icon: string; label: string; color: string }> = {
		super_admin: { icon: '⭐', label: 'Super Admin', color: '#ef4444' },
		admin:       { icon: '🛡️', label: 'Admin',       color: '#f59e0b' },
		moderator:   { icon: '🔰', label: 'Moderator',   color: '#8b5cf6' },
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
		} else {
			expandedId = userId;
			selectedNewRole = '';
			selectedGameIds = [];
			confirmingRole = false;
		}
	}

	function toggleGameId(gid: string) {
		if (selectedGameIds.includes(gid)) {
			selectedGameIds = selectedGameIds.filter(id => id !== gid);
		} else {
			selectedGameIds = [...selectedGameIds, gid];
		}
	}

	async function handleAssignRole(user: any) {
		if (!user || !selectedNewRole) return;
		roleChanging = true;
		toast = null;

		const payload: Record<string, any> = {
			target_user_id: user.user_id,
			new_role: selectedNewRole
		};
		if (selectedNewRole === 'verifier' && selectedGameIds.length > 0) {
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
			confirmingRole = false;
			selectedNewRole = '';
			selectedGameIds = [];
		} else {
			toast = { type: 'error', text: result.message };
			confirmingRole = false;
		}
		roleChanging = false;
		setTimeout(() => toast = null, 4000);
	}

	// ── Bulk Export (admin+ only) ─────────────────────────────────────────────
	function exportCSV() {
		const header = 'Runner ID,Display Name,Role,Status,Created';
		const rows = users.map(u => {
			const role = getEffectiveRole(u);
			return `"${u.runner_id || ''}","${u.display_name || ''}","${ROLE_META[role]?.label || role}","${u.status || ''}","${u.created_at || ''}"`;
		});
		downloadFile(header + '\n' + rows.join('\n'), 'crc-users.csv', 'text/csv');
	}
	function exportJSON() {
		const safe = users.map(u => ({
			runner_id: u.runner_id,
			display_name: u.display_name,
			role: getEffectiveRole(u),
			status: u.status,
			created_at: u.created_at,
			location: u.location,
			pronouns: u.pronouns,
		}));
		downloadFile(JSON.stringify(safe, null, 2), 'crc-users.json', 'application/json');
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

<svelte:head><title>👥 Users & Roles | Admin | CRC</title></svelte:head>
<div class="page-width">
	<p class="back"><a href="/admin">← Dashboard</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Verifying access...</p></div>
	{:else if !myRole?.admin && !myRole?.moderator}
		<div class="center"><h2>🔒 Access Denied</h2><p class="muted">Moderator or higher privileges required.</p><a href="/" class="btn">Go Home</a></div>
	{:else}
		<h1>👥 Users & Roles</h1>
		<p class="muted mb-2">Manage users, assign staff roles, and view membership.</p>

		{#if toast}
			<div class="toast toast--{toast.type}">{toast.text}</div>
		{/if}

		<!-- Filters -->
		<div class="filters card">
			<div class="filters__row">
				<div class="filters__tabs">
					<button class="filter-tab" class:active={roleFilter === 'all'} onclick={() => { roleFilter = 'all'; currentPage = 1; }}>
						All <span class="filter-tab__count">{users.length}</span>
					</button>
					<button class="filter-tab" class:active={roleFilter === 'staff'} onclick={() => { roleFilter = 'staff'; currentPage = 1; }}>
						Staff <span class="filter-tab__count">{staffCount}</span>
					</button>
					<button class="filter-tab" class:active={roleFilter === 'admins'} onclick={() => { roleFilter = 'admins'; currentPage = 1; }}>
						Admins
					</button>
					<button class="filter-tab" class:active={roleFilter === 'moderators'} onclick={() => { roleFilter = 'moderators'; currentPage = 1; }}>
						Moderators
					</button>
					<button class="filter-tab" class:active={roleFilter === 'verifiers'} onclick={() => { roleFilter = 'verifiers'; currentPage = 1; }}>
						Verifiers
					</button>
					<button class="filter-tab" class:active={roleFilter === 'pending'} onclick={() => { roleFilter = 'pending'; currentPage = 1; }}>
						Pending <span class="filter-tab__count">{pendingCount}</span>
					</button>
				</div>
				<button class="btn btn--small" onclick={loadUsers} disabled={loading}>↻ Refresh</button>
			</div>
			<div class="filters__advanced">
				<div class="filter-group filter-group--search">
					<label class="filter-label">Search</label>
					<input type="text" class="filter-input" bind:value={searchQuery} placeholder="Runner ID or display name..." oninput={() => currentPage = 1} />
				</div>
				{#if searchQuery || roleFilter !== 'all'}
					<button class="btn btn--small" onclick={() => { searchQuery = ''; roleFilter = 'all'; currentPage = 1; }}>✕ Clear</button>
				{/if}
			</div>
		</div>

		<!-- Users List -->
		{#if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">Loading users...</p></div></div>
		{:else if filteredUsers.length === 0}
			<div class="card">
				<div class="empty"><span class="empty__icon">🔍</span><h3>No users found</h3><p class="muted">Try adjusting your search or filters.</p></div>
			</div>
		{:else}
			<div class="users-list">
				{#each pageUsers as user (user.user_id || user.runner_id)}
					{@const effectiveRole = getEffectiveRole(user)}
					{@const meta = ROLE_META[effectiveRole]}
					{@const isExpanded = expandedId === user.user_id}
					<div class="user-card" class:expanded={isExpanded}>
						<button class="user-card__header" onclick={() => toggleUser(user.user_id)}>
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
						</button>

						{#if isExpanded}
							<div class="user-card__body">
								<!-- User Details -->
								<div class="user-details">
									<div class="user-detail"><span class="user-detail__label">Runner ID</span><span class="user-detail__value"><a href="/runners/{user.runner_id}">{user.runner_id}</a></span></div>
									<div class="user-detail"><span class="user-detail__label">Display Name</span><span class="user-detail__value">{user.display_name || '—'}</span></div>
									<div class="user-detail"><span class="user-detail__label">Role</span><span class="user-detail__value"><span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span></span></div>
									<div class="user-detail"><span class="user-detail__label">Status</span><span class="user-detail__value">{user.status || '—'}</span></div>
									<div class="user-detail"><span class="user-detail__label">Joined</span><span class="user-detail__value">{fmtDate(user.created_at)}</span></div>
									{#if user.location}<div class="user-detail"><span class="user-detail__label">Location</span><span class="user-detail__value">{user.location}</span></div>{/if}
									{#if user.pronouns}<div class="user-detail"><span class="user-detail__label">Pronouns</span><span class="user-detail__value">{user.pronouns}</span></div>{/if}
								</div>

								<!-- Role Management -->
								{#if canModifyUser(user)}
									<div class="role-section">
										<h3>🔧 Change Role</h3>
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
													onclick={() => { selectedNewRole = selectedNewRole === role ? '' : role; confirmingRole = false; selectedGameIds = []; }}
													disabled={effectiveRole === role}
												>
													<span class="role-option__icon">{rm.icon}</span>
													<div class="role-option__info">
														<span class="role-option__name">{rm.label}</span>
														{#if effectiveRole === role}<span class="role-option__note">Current role</span>{/if}
													</div>
													<span class="role-option__dot" style="background:{rm.color}"></span>
												</button>
											{/each}
										</div>

										<!-- Game picker for verifier -->
										{#if selectedNewRole === 'verifier'}
											<div class="game-picker">
												<label class="game-picker__label">Assign to games (optional):</label>
												<div class="game-picker__list">
													{#each games as game}
														<label class="game-picker__item">
															<input type="checkbox" checked={selectedGameIds.includes(game.game_id)} onchange={() => toggleGameId(game.game_id)} />
															<span>{game.game_name}</span>
														</label>
													{/each}
													{#if games.length === 0}
														<p class="muted" style="font-size:0.8rem;">No games found.</p>
													{/if}
												</div>
												{#if selectedGameIds.length > 0}
													<p class="muted" style="font-size:0.8rem; margin-top:0.5rem;">{selectedGameIds.length} game{selectedGameIds.length === 1 ? '' : 's'} selected</p>
												{/if}
											</div>
										{/if}

										<!-- Confirm -->
										{#if selectedNewRole}
											{#if !confirmingRole}
												<button class="btn btn--primary mt-2" onclick={() => confirmingRole = true}>
													Change to {ROLE_META[selectedNewRole].icon} {ROLE_META[selectedNewRole].label}
												</button>
											{:else}
												<div class="confirm-box">
													<p>
														Change <strong>{user.display_name || user.runner_id}</strong> from
														<span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span>
														to
														<span class="role-badge" style="background:{ROLE_META[selectedNewRole].color}">{ROLE_META[selectedNewRole].icon} {ROLE_META[selectedNewRole].label}</span>?
													</p>
													<div class="confirm-box__actions">
														<button class="btn btn--danger" onclick={() => handleAssignRole(user)} disabled={roleChanging}>
															{roleChanging ? 'Applying...' : 'Confirm Change'}
														</button>
														<button class="btn" onclick={() => confirmingRole = false} disabled={roleChanging}>Cancel</button>
													</div>
												</div>
											{/if}
										{/if}
									</div>
								{:else}
									<div class="role-section role-section--locked">
										<h3>🔧 Role Management</h3>
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
									<a href="/runners/{user.runner_id}" class="btn btn--small" target="_blank">View Profile ↗</a>
									{#if isAdmin}
										<button class="btn btn--small" onclick={() => exportUserData(user)} disabled={userExporting}>
											{userExporting ? 'Exporting...' : '📥 Export User Data'}
										</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="pagination">
					<button class="btn btn--small" disabled={currentPage <= 1} onclick={() => currentPage--}>← Previous</button>
					<span class="muted">Page {currentPage} of {totalPages} · {filteredUsers.length} users</span>
					<button class="btn btn--small" disabled={currentPage >= totalPages} onclick={() => currentPage++}>Next →</button>
				</div>
			{/if}
		{/if}

		<!-- Export -->
		{#if isAdmin}
			<div class="card mt-3">
				<h2>📥 Export</h2>
				<div class="export-section">
					<div class="export-block">
						<h3>Bulk User List</h3>
						<p class="muted">Overview of all users (runner ID, display name, role, status, join date). Does not contain personal data.</p>
						<div class="export-actions">
							<button class="btn btn--small" onclick={exportCSV}>📄 CSV</button>
							<button class="btn btn--small" onclick={exportJSON}>📋 JSON</button>
						</div>
					</div>
					<div class="export-block">
						<h3>Individual User Data (GDPR/CCPA)</h3>
						<p class="muted">Full data export for a specific user — includes profile, runs, achievements, linked accounts, support tickets, and all associated records. Use the <strong>📥 Export User Data</strong> button on any expanded user card above.</p>
					</div>
				</div>
				<p class="muted mt-1" style="font-size:0.8rem;">⚠️ Exports are logged. Only export for legitimate purposes (data subject requests, backups).</p>
			</div>
		{:else}
			<div class="card mt-3">
				<h2>📥 Export User Data</h2>
				<p class="muted">User data exports are available to admins only. If you need an export for a data subject request, please contact an admin.</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mt-1 { margin-top: 0.5rem; } .mt-2 { margin-top: 0.75rem; } .mt-3 { margin-top: 1.5rem; }
	.center { text-align: center; padding: 4rem 0; }
	.center-sm { text-align: center; padding: 2rem; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; font-family: inherit; gap: 0.35rem; }
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn--danger { background: #ef4444; color: #fff; border-color: #ef4444; }
	.btn--danger:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn:disabled { opacity: 0.4; cursor: not-allowed; }

	/* Toast */
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

	/* Filters */
	.filters { padding: 1rem; margin-bottom: 1.5rem; }
	.filters__row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
	.filters__tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	.filter-tab { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; color: var(--muted); cursor: pointer; transition: all 0.15s; font-family: inherit; }
	.filter-tab:hover { border-color: var(--fg); color: var(--fg); }
	.filter-tab.active { background: var(--accent); color: white; border-color: var(--accent); }
	.filter-tab__count { display: inline-block; background: rgba(255,255,255,0.25); padding: 0 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; font-weight: 700; }
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
	.user-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.user-card__header { display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.25rem; cursor: pointer; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; gap: 1rem; transition: background 0.1s; }
	.user-card__header:hover { background: rgba(255,255,255,0.02); }
	.user-card__info { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; min-width: 0; }
	.user-card__name { font-weight: 600; font-size: 1rem; }
	.user-card__runner-id { font-size: 0.8rem; color: var(--muted); font-family: monospace; }
	.user-card__meta { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
	.user-card__date { font-size: 0.8rem; white-space: nowrap; }

	/* Role badges */
	.role-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.55rem; font-size: 0.7rem; font-weight: 600; border-radius: 4px; color: white; white-space: nowrap; }

	/* User card body */
	.user-card__body { border-top: 1px solid var(--border); padding: 1.25rem; }
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
	.game-picker__list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
	.game-picker__item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; padding: 0.25rem 0.35rem; border-radius: 4px; }
	.game-picker__item:hover { background: rgba(255,255,255,0.05); }
	.game-picker__item input { accent-color: var(--accent); }

	/* Confirm */
	.confirm-box { margin-top: 0.75rem; padding: 0.85rem; background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; }
	.confirm-box p { margin: 0 0 0.75rem; font-size: 0.9rem; line-height: 1.6; }
	.confirm-box__actions { display: flex; gap: 0.5rem; }

	/* Pagination */
	.pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem; padding: 1rem; }

	/* Export */
	.export-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
	.export-section { display: flex; flex-direction: column; gap: 1rem; }
	.export-block { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.export-block h3 { font-size: 0.95rem; margin: 0 0 0.35rem; }
	.export-block p { margin: 0 0 0.5rem; font-size: 0.85rem; }
	.export-block .export-actions { margin-top: 0.5rem; }

	@media (max-width: 640px) {
		.filters__row { flex-direction: column; align-items: stretch; }
		.user-card__header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
		.user-card__meta { width: 100%; justify-content: space-between; }
		.user-details { grid-template-columns: 1fr 1fr; }
	}
</style>
