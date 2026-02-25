<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { debugRole } from '$stores/debug';
	import { getDebugableRoles, realRoleToDebugId } from '$lib/permissions';
	import type { DebugRoleId } from '$stores/debug';

	let checking = $state(true);
	let authorized = $state(false);
	let activeTab = $state('role-sim');
	let actualRoleId = $state<DebugRoleId>('user');
	let runnerId = $state('—');
	let userId = $state('—');

	// System health
	let serviceStatus = $state<Record<string, { ok: boolean; label: string }>>({
		supabase: { ok: false, label: 'Checking...' },
		auth: { ok: false, label: 'Checking...' },
		worker: { ok: false, label: 'Checking...' },
		build: { ok: true, label: 'OK' }
	});
	let lastCheck = $state('—');

	const ROLES_META: Record<string, { icon: string; name: string; desc: string }> = {
		admin:     { icon: '🛡️', name: 'Admin',                desc: 'Pending profiles, games, runs (view-only unless game mod). Users. Staff Guides.' },
		moderator: { icon: '🔰', name: 'Moderator',            desc: 'Runs queue for assigned games. Users. Debug (verifier only). Staff Guides.' },
		verifier:  { icon: '✅', name: 'Verifier',             desc: 'Runs queue for assigned games only. Staff Guides.' },
		user:      { icon: '👤', name: 'User',                 desc: 'No dashboard access. Sees public site + own profile/submissions.' },
		non_user:  { icon: '🚫', name: 'Non-User (Logged Out)', desc: 'No account. Public pages only — useful to check sign-up flow.' },
	};

	// Roles this user can simulate — determined after auth check
	let debuggableRoles = $state<DebugRoleId[]>([]);

	const permMatrix: [string, boolean, boolean, boolean, boolean, boolean, boolean][] = [
		['Approve runs (all games)',      true,  false, false, false, false, false],
		['Approve runs (assigned games)', true,  true,  false, true,  true,  false],
		['View runs queue (any game)',     true,  true,  true,  true,  false, false],
		['Review profiles',               true,  true,  false, false, false, false],
		['Review pending games',          true,  true,  false, false, false, false],
		['Review game updates',           true,  true,  true,  true,  false, false],
		['User management',               true,  false, true,  true,  false, false],
		['Debug tools',                   true,  false, true,  false, false, false],
		['Staff Guides',                  true,  true,  true,  true,  false, false],
		['Financials / Site Health',      true,  false, false, false, false, false],
		['Submit runs',                   true,  true,  true,  true,  true,  false],
		['Submit games',                  true,  true,  true,  true,  true,  false],
		['Edit own profile',              true,  true,  true,  true,  true,  false],
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
				// Determine which roles this user can simulate
				debuggableRoles = getDebugableRoles(actualRoleId);
				checking = false;
				if (authorized) checkServices();
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

	async function checkServices() {
		// Supabase
		try {
			const { error } = await supabase.from('profiles').select('runner_id').limit(1);
			serviceStatus.supabase = error ? { ok: false, label: 'Error: ' + error.message } : { ok: true, label: 'OK' };
		} catch { serviceStatus.supabase = { ok: false, label: 'Unreachable' }; }
		// Auth
		try {
			const { data } = await supabase.auth.getSession();
			serviceStatus.auth = data.session ? { ok: true, label: 'OK' } : { ok: false, label: 'No session' };
		} catch { serviceStatus.auth = { ok: false, label: 'Error' }; }
		// Worker - just mark as unknown since we can't easily ping
		serviceStatus.worker = { ok: true, label: 'Assumed OK' };
		serviceStatus = { ...serviceStatus };
		lastCheck = new Date().toLocaleTimeString();
	}
</script>

<svelte:head><title>🔧 Debug & Diagnostics | Admin | CRC</title></svelte:head>
<div class="page-width">
	<p class="back"><a href="/admin">← Dashboard</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access...</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 Access Denied</h2><p class="muted">Moderator access or higher required.</p><a href="/" class="btn">Go Home</a></div>
	{:else}
		<h1>🔧 Debug & Diagnostics</h1>
		<p class="muted mb-3">Role simulation, system health, and submission testing.</p>

		<nav class="debug-tabs">
			<button class="tab" class:active={activeTab === 'role-sim'} onclick={() => activeTab = 'role-sim'}>👁️ Role Simulation</button>
			<button class="tab" class:active={activeTab === 'system'} onclick={() => activeTab = 'system'}>💚 System Health</button>
			<button class="tab" class:active={activeTab === 'simulators'} onclick={() => activeTab = 'simulators'}>🧪 Submission Testers</button>
		</nav>

		{#if activeTab === 'role-sim'}
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
			</div>

			<div class="card mt-3">
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

			<div class="card mt-3">
				<h2>📋 Current Session</h2>
				<div class="session-grid">
					<div class="sr"><span class="sk">Actual Role</span><span class="sv">{actualRoleId}</span></div>
					<div class="sr"><span class="sk">Effective Role</span><span class="sv">{$debugRole || actualRoleId}</span></div>
					<div class="sr"><span class="sk">Debug Mode</span><span class="sv">{$debugRole ? 'On' : 'Off'}</span></div>
					<div class="sr"><span class="sk">Runner ID</span><span class="sv">{runnerId}</span></div>
					<div class="sr"><span class="sk">User ID</span><span class="sv" style="word-break:break-all">{userId}</span></div>
				</div>
			</div>

		{:else if activeTab === 'system'}
			<div class="system-grid">
				<div class="card">
					<h2>💚 Service Status</h2>
					{#each Object.entries(serviceStatus) as [key, status]}
						<div class="status-item">
							<span class="status-dot" class:ok={status.ok} class:err={!status.ok}></span>
							<span>{key === 'supabase' ? 'Supabase Database' : key === 'auth' ? 'Authentication' : key === 'worker' ? 'Cloudflare Worker' : 'Svelte Build'}</span>
							<span class="status-val">{status.label}</span>
						</div>
					{/each}
					<p class="muted mt-2" style="font-size:0.8rem">Last checked: {lastCheck} <button class="btn btn--sm" onclick={checkServices}>🔄 Recheck</button></p>
				</div>

				<div class="card">
					<h2>💾 Data Usage</h2>
					<p class="muted mb-2">Supabase free tier estimates:</p>
					<div class="usage-item"><span class="usage-label">Database Rows</span><div class="usage-bar-wrap"><div class="usage-bar" style="width:1%"></div></div><span class="usage-val">— / 100k</span></div>
					<div class="usage-item"><span class="usage-label">Storage</span><div class="usage-bar-wrap"><div class="usage-bar" style="width:1%"></div></div><span class="usage-val">— / 500MB</span></div>
					<div class="usage-item"><span class="usage-label">Auth Users</span><div class="usage-bar-wrap"><div class="usage-bar" style="width:0%"></div></div><span class="usage-val">— / 50k</span></div>
				</div>
			</div>

		{:else if activeTab === 'simulators'}
			<div class="card">
				<h2>🧪 Submission Testers</h2>
				<p class="muted mb-2">Test the submission pipeline without affecting production data.</p>
				<div class="placeholder"><span>🧪</span><h3>Coming Soon</h3><p class="muted">Run submission simulator, game submission simulator, and profile creation tester will be available here.</p></div>
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
	.btn--sm { font-size: 0.8rem; padding: 0.3rem 0.75rem; }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mb-3 { margin-bottom: 1.5rem; } .mt-2 { margin-top: 1rem; } .mt-3 { margin-top: 1.5rem; }

	.debug-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; }
	.tab { padding: 0.75rem 1.25rem; color: var(--text-muted); border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent; font-size: 0.9rem; white-space: nowrap; }
	.tab:hover { color: var(--fg); }
	.tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

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

	.system-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }

	.status-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
	.status-item:last-of-type { border-bottom: none; }
	.status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
	.status-dot.ok { background: #10b981; } .status-dot.err { background: #ef4444; }
	.status-val { margin-left: auto; font-size: 0.85rem; color: var(--text-muted); }

	.usage-item { margin-bottom: 1rem; }
	.usage-label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
	.usage-bar-wrap { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; height: 8px; overflow: hidden; }
	.usage-bar { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.3s; }
	.usage-val { font-size: 0.8rem; color: var(--text-muted); }

	.placeholder { text-align: center; padding: 3rem 1rem; }
	.placeholder span { font-size: 3rem; display: block; margin-bottom: 0.75rem; opacity: 0.4; }
	.placeholder h3 { margin: 0 0 0.5rem; }
	.placeholder p { max-width: 400px; margin-inline: auto; }
</style>
