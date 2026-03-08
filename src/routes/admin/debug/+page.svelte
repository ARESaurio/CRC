<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { debugRole } from '$stores/debug';
	import { getDebugableRoles, realRoleToDebugId } from '$lib/permissions';
	import { supabase } from '$lib/supabase';
	import type { DebugRoleId } from '$stores/debug';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let checking = $state(true);
	let authorized = $state(false);
	let activeTab = $state<'simulation' | 'permissions' | 'session'>('simulation');
	
	let actualRoleId = $state<DebugRoleId>('user');
	let runnerId = $state('—');
	let userId = $state('—');

	// ── Game picker for mod/verifier simulation ──
	let allGames = $state<{ game_id: string; game_name: string }[]>([]);
	let gameSearch = $state('');
	let selectedGame = $state<string | null>(null);
	let gameDropdownOpen = $state(false);
	let filteredGames = $derived.by(() => {
		if (!gameSearch.trim()) return allGames;
		const q = gameSearch.toLowerCase();
		return allGames.filter(g =>
			g.game_name.toLowerCase().includes(q) || g.game_id.toLowerCase().includes(q)
		);
	});

	async function loadGames() {
		try {
			const { data } = await supabase
				.from('games')
				.select('game_id, game_name')
				.order('game_name');
			if (data) allGames = data;
		} catch { /* ignore */ }
	}

	function selectGame(game: { game_id: string; game_name: string }) {
		selectedGame = game.game_id;
		gameSearch = game.game_name;
		gameDropdownOpen = false;
	}

	function clearGame() {
		selectedGame = null;
		gameSearch = '';
	}



	const ROLES_META: Record<string, { icon: string; name: string; desc: string }> = {
		admin:     { icon: '🛡️', name: 'Admin',                desc: 'Pending profiles, games, runs (view-only unless game mod). Users. Staff Guides.' },
		moderator: { icon: '🔰', name: 'Moderator',            desc: 'Runs queue for assigned games. Users. Debug (verifier only). Staff Guides.' },
		verifier:  { icon: '✅', name: 'Verifier',             desc: 'Runs queue for assigned games only. Staff Guides.' },
		user:      { icon: '👤', name: 'User',                 desc: 'No dashboard access. Sees public site + own profile/submissions.' },
		non_user:  { icon: '🚫', name: 'Non-User (Logged Out)', desc: 'No account. Public pages only — useful to check sign-up flow.' },
	};

	// Roles this user can simulate — based on effective perspective
	// When debugging as moderator, you see what a moderator would see on this page
	let effectiveRoleId = $derived($debugRole ?? actualRoleId);
	let debuggableRoles = $derived(getDebugableRoles(effectiveRoleId));

	// Permissions matrix — columns: [Capability, Super Admin, Admin, Moderator, Verifier, User, Non-User]
	const permMatrix: [string, boolean, boolean, boolean, boolean, boolean, boolean][] = [
		// ── User capabilities ──
		['Submit runs',                   true,  true,  true,  true,  true,  false],
		['Submit games',                  true,  true,  true,  true,  true,  false],
		['Edit own profile',              true,  true,  true,  true,  true,  false],
		// ── Verifier capabilities ──
		['View runs queue',               true,  true,  true,  true,  false, false],
		['Approve runs (assigned games)', true,  true,  true,  true,  false, false],
		['View game updates',             true,  true,  true,  true,  false, false],
		['Staff guides',                  true,  true,  true,  true,  false, false],
		// ── Moderator capabilities ──
		['Game editor (assigned games)',  true,  true,  true,  false, false, false],
		['Users & roles',                 true,  true,  true,  false, false, false],
		['Debug tools',                   true,  true,  true,  false, false, false],
		// ── Admin capabilities ──
		['Review pending profiles',       true,  true,  false, false, false, false],
		['Review pending games',          true,  true,  false, false, false, false],
		['Approve runs (all games)',      true,  true,  false, false, false, false],
		['Game editor (all games)',       true,  true,  false, false, false, false],
		['Review profile themes',         true,  true,  false, false, false, false],
		['Freeze / unfreeze games',       true,  true,  false, false, false, false],
		// ── Super Admin capabilities ──
		['Financials',                    true,  false, false, false, false, false],
		['Site health',                   true,  false, false, false, false, false],
	];

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/debug'); return; }
				const role = await checkAdminRole();
				actualRoleId = realRoleToDebugId(role);
				// Accessible by super_admin, admin, moderator
				authorized = !!(role?.superAdmin || role?.admin || role?.moderator);
				runnerId = role?.runnerId || '—';
				userId = sess?.user?.id || '—';
				checking = false;
				if (authorized) loadGames();
			}
		});
		return unsub;
	});

	function activateDebug(role: string) {
		debugRole.set(role as DebugRoleId);
	}
	function exitDebug() {
		debugRole.set(null);
	}


</script>

<svelte:head><title>🔧 Debug & Diagnostics | Admin | CRC</title></svelte:head>
<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>← {m.admin_dashboard()}</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access...</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 {m.admin_access_denied()}</h2><p class="muted">{m.admin_moderator_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>🔧 Debug & Diagnostics</h1>
		<p class="muted mb-3">Role simulation and system diagnostics.</p>

		<nav class="debug-tabs">
			<button class="debug-tab" class:debug-tab--active={activeTab === 'simulation'} onclick={() => activeTab = 'simulation'}>👁️ Role Simulation</button>
			<button class="debug-tab" class:debug-tab--active={activeTab === 'permissions'} onclick={() => activeTab = 'permissions'}>🔐 Permissions</button>
			<button class="debug-tab" class:debug-tab--active={activeTab === 'session'} onclick={() => activeTab = 'session'}>📋 Current Session</button>
		</nav>

		{#if activeTab === 'simulation'}
			<div class="card">
				<h2>👁️ Role Simulation</h2>
				<p class="muted mb-2">Select a role below to activate debug mode. A navigation bar will appear at the top of <strong>every page</strong> on the site, letting you browse as that role. Submissions are disabled during debug mode.</p>
				{#if debuggableRoles.length === 0}
					<p class="muted">No roles available to simulate.</p>
				{:else}
					<div class="role-cards">
						{#each debuggableRoles as roleId}
							{@const meta = ROLES_META[roleId]}
							{#if meta}
								<button
									class="role-card"
									class:role-card--active={$debugRole === roleId}
									onclick={() => $debugRole === roleId ? exitDebug() : activateDebug(roleId)}
								>
									<span class="role-card__icon">{meta.icon}</span>
									<div class="role-card__info">
										<div class="role-card__name">{meta.name}</div>
										<div class="role-card__desc">{meta.desc}</div>
									</div>
									{#if $debugRole === roleId}<span class="role-card__badge">ACTIVE</span>{/if}
								</button>
							{/if}
						{/each}
					</div>
				{/if}
				{#if $debugRole}
					<p class="muted mt-2" style="font-size:0.85rem">Tip: Use the <strong>🗺️ Navigate</strong> button in the debug bar above to quickly jump to any page on the site.</p>
				{/if}
				{#if $debugRole === 'verifier' || $debugRole === 'moderator'}
					<div class="game-picker mt-2">
						<h3 class="game-picker__title">🎮 Assigned Game (Optional)</h3>
						<p class="muted" style="font-size:0.85rem; margin-bottom:0.5rem">Simulate being assigned to a specific game. This helps verify that game-based restrictions display correctly.</p>
						<div class="game-picker__input-wrap">
							<input
								type="text"
								class="game-picker__input"
								placeholder="Search games..."
								bind:value={gameSearch}
								onfocus={() => gameDropdownOpen = true}
								oninput={() => { gameDropdownOpen = true; selectedGame = null; }}
							/>
							{#if selectedGame}
								<button class="game-picker__clear" onclick={clearGame} title="Clear selection">✕</button>
							{/if}
						</div>
						{#if gameDropdownOpen && !selectedGame && filteredGames.length > 0}
							<div class="game-picker__dropdown">
								{#each filteredGames.slice(0, 10) as game}
									<button class="game-picker__option" onclick={() => selectGame(game)}>
										<span class="game-picker__option-name">{game.game_name}</span>
										<span class="game-picker__option-id">{game.game_id}</span>
									</button>
								{/each}
								{#if filteredGames.length > 10}
									<div class="game-picker__more">{filteredGames.length - 10} more — type to narrow</div>
								{/if}
							</div>
						{/if}
						{#if selectedGame}
							<p class="game-picker__selected">Simulating assignment to <strong>{gameSearch}</strong> <span class="mono">({selectedGame})</span></p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if activeTab === 'permissions'}
			<div class="card">
				<h2>🔐 Permissions Matrix</h2>
				<p class="muted mb-2">What each role can access:</p>
				<div class="table-wrap">
					<table class="perm-table">
						<thead><tr><th>Capability</th><th>Super Admin</th><th>Admin</th><th>Moderator</th><th>Verifier</th><th>User</th><th>Non-User</th></tr></thead>
						<tbody>
							{#each permMatrix as [cap, ...perms]}
								<tr><td>{cap}</td>{#each perms as p}<td class={p ? 'perm-yes' : 'perm-no'}>{p ? '✅' : '❌'}</td>{/each}</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		{#if activeTab === 'session'}
			<div class="card">
				<h2>📋 Current Session</h2>
				<div class="session-grid">
					<div class="sr"><span class="sk">Actual Role</span><span class="sv">{actualRoleId}</span></div>
					<div class="sr"><span class="sk">Effective Role</span><span class="sv">{$debugRole || actualRoleId}</span></div>
					<div class="sr"><span class="sk">Debug Mode</span><span class="sv">{$debugRole ? 'On' : 'Off'}</span></div>
					<div class="sr"><span class="sk">Runner ID</span><span class="sv">{runnerId}</span></div>
					<div class="sr"><span class="sk">User ID</span><span class="sv" style="word-break:break-all">{userId}</span></div>
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
	.btn { display: inline-block; padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 6px; color: var(--fg); background: transparent; cursor: pointer; font-size: 0.85rem; text-decoration: none; }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mb-3 { margin-bottom: 1.5rem; } .mt-2 { margin-top: 1rem; }

	.debug-tabs {
		display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem;
		overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none;
	}
	.debug-tabs::-webkit-scrollbar { display: none; }
	.debug-tab {
		appearance: none; cursor: pointer; font: inherit;
		padding: 0.75rem 1.25rem; background: none; border: none;
		border-bottom: 2px solid transparent; color: var(--text-muted);
		white-space: nowrap; font-size: 0.9rem; transition: color 0.15s, border-color 0.15s;
	}
	.debug-tab:hover { color: var(--fg); }
	.debug-tab--active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

	.role-cards { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
	.role-card { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; text-align: left; color: var(--fg); width: 100%; transition: border-color 0.15s; }
	.role-card:hover { border-color: var(--accent); }
	.role-card--active { border-color: #f0ad4e; background: rgba(245,158,11,0.05); }
	.role-card__icon { font-size: 1.5rem; flex-shrink: 0; }
	.role-card__info { flex: 1; }
	.role-card__name { font-weight: 600; margin-bottom: 0.15rem; }
	.role-card__desc { font-size: 0.8rem; color: var(--text-muted); }
	.role-card__badge { font-size: 0.65rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; background: #f0ad4e; color: #000; text-transform: uppercase; }

	.table-wrap { overflow-x: auto; }
	.perm-table { width: 100%; border-collapse: collapse; }
	.perm-table th, .perm-table td { padding: 0.5rem 0.75rem; text-align: center; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
	.perm-table th { background: var(--bg); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); }
	.perm-table td:first-child { text-align: left; }

	.session-grid { display: flex; flex-direction: column; gap: 0; }
	.sr { display: flex; padding: 0.5rem 0; border-bottom: 1px solid var(--border); } .sr:last-child { border-bottom: none; }
	.sk { flex: 0 0 130px; font-weight: 600; color: var(--text-muted); font-size: 0.85rem; }
	.sv { flex: 1; font-size: 0.9rem; }


	/* Game picker */
	.game-picker { border-top: 1px solid var(--border); padding-top: 1rem; }
	.game-picker__title { font-size: 0.95rem; margin: 0 0 0.25rem; }
	.game-picker__input-wrap { position: relative; max-width: 400px; }
	.game-picker__input { width: 100%; padding: 0.5rem 2rem 0.5rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.game-picker__input:focus { border-color: var(--accent); outline: none; }
	.game-picker__clear { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.85rem; padding: 0.25rem; }
	.game-picker__clear:hover { color: var(--fg); }
	.game-picker__dropdown { position: absolute; z-index: 10; width: 100%; max-width: 400px; max-height: 240px; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-top: none; border-radius: 0 0 6px 6px; }
	.game-picker__option { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0.5rem 0.75rem; background: none; border: none; border-bottom: 1px solid var(--border); color: var(--fg); cursor: pointer; text-align: left; font-family: inherit; font-size: 0.85rem; gap: 0.5rem; }
	.game-picker__option:last-child { border-bottom: none; }
	.game-picker__option:hover { background: rgba(255,255,255,0.04); }
	.game-picker__option-name { font-weight: 500; }
	.game-picker__option-id { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; }
	.game-picker__more { padding: 0.4rem 0.75rem; font-size: 0.8rem; color: var(--text-muted); text-align: center; }
	.game-picker__selected { font-size: 0.85rem; margin-top: 0.5rem; color: var(--accent); }
	.mono { font-family: monospace; font-size: 0.8rem; }
</style>
