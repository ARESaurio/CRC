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
	let searchFilter = $state('all');
	let currentPage = $state(1);
	let viewingUser = $state<any>(null);
	const PAGE_SIZE = 20;

	// Role management state
	let roleChanging = $state(false);
	let roleMsg = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let selectedNewRole = $state('');
	let selectedGameIds = $state<string[]>([]);
	let confirmingRole = $state(false);

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
		if (myRole.verifier) return 1;
		return 0;
	}

	// Roles the current user can assign (strictly below their own level)
	const assignableRoles = $derived.by(() => {
		const myLevel = getMyLevel();
		return Object.entries(ROLE_LEVELS)
			.filter(([, level]) => level < myLevel && level < 4) // never assign super_admin
			.map(([role]) => role)
			.sort((a, b) => ROLE_LEVELS[b] - ROLE_LEVELS[a]);
	});

	// Can the current user modify a given user's role?
	function canModifyUser(u: any): boolean {
		if (!myRole) return false;
		const myLevel = getMyLevel();
		const targetLevel = ROLE_LEVELS[getEffectiveRole(u)] ?? 0;
		return myLevel > targetLevel && myLevel >= 2; // at least moderator
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/users'); return; }
				myRole = await checkAdminRole();
				const hasAccess = myRole?.admin || myRole?.moderator;
				checking = false;
				if (hasAccess) {
					await Promise.all([loadUsers(), loadGames()]);
				}
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

	const filteredUsers = $derived.by(() => {
		let result = [...users];
		if (searchFilter === 'admins') result = result.filter(u => u.is_admin || u.is_super_admin);
		else if (searchFilter === 'moderators') result = result.filter(u => u.role === 'moderator');
		else if (searchFilter === 'verifiers') result = result.filter(u => u.role === 'verifier');
		else if (searchFilter === 'pending') result = result.filter(u => u.status === 'pending');
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			result = result.filter(u =>
				(u.runner_id||'').toLowerCase().includes(q) ||
				(u.display_name||'').toLowerCase().includes(q) ||
				(myRole?.superAdmin && (u.email||'').toLowerCase().includes(q))
			);
		}
		return result;
	});

	const pageUsers = $derived(filteredUsers.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE));
	const totalPages = $derived(Math.ceil(filteredUsers.length / PAGE_SIZE) || 1);

	function search() { currentPage = 1; }
	function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString() : '-'; }

	function openUserModal(user: any) {
		viewingUser = user;
		selectedNewRole = '';
		selectedGameIds = [];
		roleMsg = null;
		confirmingRole = false;
	}

	function closeModal() {
		viewingUser = null;
		selectedNewRole = '';
		selectedGameIds = [];
		roleMsg = null;
		confirmingRole = false;
	}

	function toggleGameId(gid: string) {
		if (selectedGameIds.includes(gid)) {
			selectedGameIds = selectedGameIds.filter(id => id !== gid);
		} else {
			selectedGameIds = [...selectedGameIds, gid];
		}
	}

	async function handleAssignRole() {
		if (!viewingUser || !selectedNewRole) return;
		roleChanging = true;
		roleMsg = null;

		const payload: Record<string, any> = {
			target_user_id: viewingUser.user_id,
			new_role: selectedNewRole
		};
		if (selectedNewRole === 'verifier' && selectedGameIds.length > 0) {
			payload.game_ids = selectedGameIds;
		}

		const result = await adminAction('/assign-role', payload);
		if (result.ok) {
			roleMsg = { type: 'success', text: result.message };
			// Update local data to reflect the change
			const idx = users.findIndex(u => u.user_id === viewingUser.user_id);
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
				viewingUser = updated;
			}
			confirmingRole = false;
			selectedNewRole = '';
			selectedGameIds = [];
		} else {
			roleMsg = { type: 'error', text: result.message };
			confirmingRole = false;
		}
		roleChanging = false;
	}

	// Export (super admin only)
	function exportCSV() {
		const csv = 'Email\n' + users.filter(u => u.email).map(u => u.email).join('\n');
		downloadFile(csv, 'crc-user-emails.csv', 'text/csv');
	}
	function exportJSON() { downloadFile(JSON.stringify(users, null, 2), 'crc-users.json', 'application/json'); }
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
		<div class="page-header">
			{#if myRole.superAdmin}
				<span class="level-badge level-badge--super">🔒 Super Admin</span>
			{:else if myRole.admin}
				<span class="level-badge level-badge--admin">🛡️ Admin</span>
			{:else}
				<span class="level-badge level-badge--mod">🔰 Moderator</span>
			{/if}
			<h1>👥 Users & Roles</h1>
			<p class="muted">Manage users and assign staff roles.</p>
		</div>

		{#if myRole.superAdmin}
			<div class="warning-banner">
				<span class="warning-icon">⚠️</span>
				<div><strong>Sensitive Information</strong><p>This page contains personal user data including email addresses. Handle with care.</p></div>
			</div>
		{/if}

		<!-- Search -->
		<div class="card mt-4">
			<h2>🔍 Search Users</h2>
			<div class="search-row">
				<input type="text" bind:value={searchQuery} placeholder={myRole.superAdmin ? "Search by runner ID, email, or name..." : "Search by runner ID or name..."} class="form-input" />
				<select bind:value={searchFilter} class="form-input form-select">
					<option value="all">All Users</option>
					<option value="admins">Admins</option>
					<option value="moderators">Moderators</option>
					<option value="verifiers">Verifiers</option>
					<option value="pending">Pending Profiles</option>
				</select>
				<button class="btn btn--primary" onclick={search}>Search</button>
			</div>
		</div>

		<!-- Users Table -->
		<div class="card mt-4">
			<div class="table-header"><h2>👥 Users</h2><span class="user-count">{filteredUsers.length} users</span></div>
			<div class="table-wrap">
				<table class="user-table">
					<thead>
						<tr>
							<th>Runner ID</th>
							<th>Display Name</th>
							{#if myRole.superAdmin}<th>Email</th>{/if}
							<th>Role</th>
							<th>Created</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							<tr><td colspan={myRole.superAdmin ? 6 : 5} class="muted">Loading...</td></tr>
						{:else if pageUsers.length === 0}
							<tr><td colspan={myRole.superAdmin ? 6 : 5} class="muted">No users found</td></tr>
						{:else}
							{#each pageUsers as user}
								{@const effectiveRole = getEffectiveRole(user)}
								{@const meta = ROLE_META[effectiveRole]}
								<tr>
									<td><a href="/runners/{user.runner_id}">{user.runner_id}</a></td>
									<td>{user.display_name || '-'}</td>
									{#if myRole.superAdmin}<td class="email-cell">{user.email || 'N/A'}</td>{/if}
									<td><span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span></td>
									<td>{fmtDate(user.created_at)}</td>
									<td><button class="btn btn--sm" onclick={() => openUserModal(user)}>View</button></td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
			<div class="pagination">
				<button class="btn btn--sm" disabled={currentPage <= 1} onclick={() => currentPage--}>← Previous</button>
				<span class="muted">Page {currentPage} of {totalPages}</span>
				<button class="btn btn--sm" disabled={currentPage >= totalPages} onclick={() => currentPage++}>Next →</button>
			</div>
		</div>

		<!-- Export (super admin only) -->
		{#if myRole.superAdmin}
			<div class="card mt-4">
				<h2>📥 Export Data</h2>
				<p class="muted mb-2">Export user data for compliance or backup.</p>
				<div class="export-actions">
					<button class="btn" onclick={exportCSV}>Export CSV (emails)</button>
					<button class="btn" onclick={exportJSON}>Export JSON (all data)</button>
				</div>
				<p class="muted mt-1" style="font-size:0.8rem;">⚠️ Exports are logged. Only export for legitimate purposes.</p>
			</div>
		{/if}

		<!-- User Detail + Role Management Modal -->
		{#if viewingUser}
			{@const effectiveRole = getEffectiveRole(viewingUser)}
			{@const meta = ROLE_META[effectiveRole]}
			<div class="modal-overlay" onclick={closeModal}>
				<div class="modal" onclick={(e) => e.stopPropagation()}>
					<div class="modal__header">
						<h2>User Details</h2>
						<button class="modal__close" onclick={closeModal}>&times;</button>
					</div>
					<div class="modal__body">
						<!-- User info -->
						<div class="detail-section">
							{#each [
								['Runner ID', viewingUser.runner_id],
								['Display Name', viewingUser.display_name || '-'],
								...(myRole.superAdmin ? [['Email', viewingUser.email || 'N/A'], ['Provider', viewingUser.provider || '-']] : []),
								['Created', viewingUser.created_at ? new Date(viewingUser.created_at).toLocaleString() : '-']
							] as [label, value]}
								<div class="detail-row"><span class="detail-key">{label}</span><span class="detail-val">{value}</span></div>
							{/each}
							<div class="detail-row">
								<span class="detail-key">Current Role</span>
								<span class="detail-val"><span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span></span>
							</div>
						</div>

						<!-- Role Management -->
						{#if canModifyUser(viewingUser)}
							<div class="role-management">
								<h3>🔧 Role Management</h3>

								{#if roleMsg}
									<div class="role-msg role-msg--{roleMsg.type}">{roleMsg.text}</div>
								{/if}

								<p class="muted" style="font-size:0.85rem; margin-bottom:0.75rem;">
									Assign a new role to this user. You can only assign roles below your own.
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
												{#if effectiveRole === role}
													<span class="role-option__note">Current role</span>
												{/if}
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
													<input
														type="checkbox"
														checked={selectedGameIds.includes(game.game_id)}
														onchange={() => toggleGameId(game.game_id)}
													/>
													<span>{game.game_name}</span>
												</label>
											{/each}
											{#if games.length === 0}
												<p class="muted" style="font-size:0.8rem;">No games found. Game assignments can be added later.</p>
											{/if}
										</div>
										{#if selectedGameIds.length > 0}
											<p class="muted" style="font-size:0.8rem; margin-top:0.5rem;">{selectedGameIds.length} game{selectedGameIds.length === 1 ? '' : 's'} selected</p>
										{/if}
									</div>
								{/if}

								<!-- Confirm & Apply -->
								{#if selectedNewRole}
									{#if !confirmingRole}
										<button class="btn btn--primary mt-3" onclick={() => confirmingRole = true}>
											Change to {ROLE_META[selectedNewRole].icon} {ROLE_META[selectedNewRole].label}
										</button>
									{:else}
										<div class="confirm-box">
											<p>
												Change <strong>{viewingUser.display_name || viewingUser.runner_id}</strong> from
												<span class="role-badge" style="background:{meta.color}">{meta.icon} {meta.label}</span>
												to
												<span class="role-badge" style="background:{ROLE_META[selectedNewRole].color}">{ROLE_META[selectedNewRole].icon} {ROLE_META[selectedNewRole].label}</span>?
											</p>
											<div class="confirm-box__actions">
												<button class="btn btn--danger" onclick={handleAssignRole} disabled={roleChanging}>
													{roleChanging ? 'Applying...' : 'Confirm Change'}
												</button>
												<button class="btn" onclick={() => confirmingRole = false} disabled={roleChanging}>Cancel</button>
											</div>
										</div>
									{/if}
								{/if}
							</div>
						{:else}
							<div class="role-management role-management--locked">
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
					</div>
					<div class="modal__footer">
						<a href="/runners/{viewingUser.runner_id}" class="btn btn--sm" target="_blank">View Profile ↗</a>
						<button class="btn" onclick={closeModal}>Close</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--text-muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	.center { text-align: center; padding: 4rem 0; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn { display: inline-flex; align-items: center; padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 6px; color: var(--fg); background: transparent; cursor: pointer; font-size: 0.85rem; text-decoration: none; font-family: inherit; gap: 0.35rem; }
	.btn--primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
	.btn--danger { background: #ef4444; color: #fff; border-color: #ef4444; }
	.btn--danger:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn--sm { font-size: 0.8rem; padding: 0.3rem 0.75rem; }
	.mt-3 { margin-top: 0.75rem; } .mt-4 { margin-top: 1.5rem; } .mt-1 { margin-top: 0.5rem; } .mb-2 { margin-bottom: 1rem; }

	.level-badge { display: inline-block; font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.75rem; border-radius: 4px; margin-bottom: 0.5rem; color: white; }
	.level-badge--super { background: #9b59b6; }
	.level-badge--admin { background: #f59e0b; color: #000; }
	.level-badge--mod { background: #8b5cf6; }
	.page-header { margin-bottom: 1.5rem; } .page-header h1 { margin-bottom: 0.25rem; }

	.warning-banner { display: flex; gap: 1rem; padding: 1rem 1.25rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; }
	.warning-icon { font-size: 1.5rem; } .warning-banner strong { display: block; margin-bottom: 0.25rem; color: #ef4444; } .warning-banner p { margin: 0; font-size: 0.9rem; color: var(--text-muted); }

	.search-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }
	.form-input { flex: 1; min-width: 200px; padding: 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.form-select { flex: 0 0 170px; }

	.table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
	.user-count { font-size: 0.9rem; color: var(--text-muted); }
	.table-wrap { overflow-x: auto; }
	.user-table { width: 100%; border-collapse: collapse; }
	.user-table th, .user-table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
	.user-table th { background: var(--bg); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); }
	.user-table tr:hover td { background: var(--bg); }
	.user-table a { color: var(--accent); text-decoration: none; } .user-table a:hover { text-decoration: underline; }
	.email-cell { font-family: monospace; font-size: 0.85rem; }

	.role-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.55rem; font-size: 0.7rem; font-weight: 600; border-radius: 4px; color: white; white-space: nowrap; }

	.pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.export-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }

	/* Modal */
	.modal-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); padding: 1rem; }
	.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; width: 100%; max-width: 560px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
	.modal__header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
	.modal__header h2 { font-size: 1.1rem; margin: 0; }
	.modal__close { background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; }
	.modal__body { padding: 1.25rem; overflow-y: auto; }
	.modal__footer { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.5rem; }

	.detail-section { margin-bottom: 0.5rem; }
	.detail-row { display: flex; padding: 0.4rem 0; border-bottom: 1px solid var(--border); }
	.detail-row:last-child { border-bottom: none; }
	.detail-key { flex: 0 0 110px; font-weight: 600; color: var(--text-muted); font-size: 0.8rem; }
	.detail-val { flex: 1; font-size: 0.85rem; word-break: break-all; display: flex; align-items: center; }

	/* Role management */
	.role-management { margin-top: 0.75rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.role-management h3 { margin: 0 0 0.5rem; font-size: 1rem; }
	.role-management--locked { opacity: 0.6; }

	.role-msg { padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.75rem; }
	.role-msg--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.role-msg--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

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
	.role-option__note { font-size: 0.7rem; color: var(--text-muted); display: block; }
	.role-option__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

	/* Game picker */
	.game-picker { margin-top: 0.75rem; padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.game-picker__label { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 0.5rem; }
	.game-picker__list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
	.game-picker__item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; padding: 0.25rem 0.35rem; border-radius: 4px; }
	.game-picker__item:hover { background: rgba(255,255,255,0.05); }
	.game-picker__item input { accent-color: var(--accent); }

	/* Confirmation */
	.confirm-box {
		margin-top: 0.75rem; padding: 0.85rem;
		background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 8px;
	}
	.confirm-box p { margin: 0 0 0.75rem; font-size: 0.9rem; line-height: 1.6; }
	.confirm-box__actions { display: flex; gap: 0.5rem; }
</style>
