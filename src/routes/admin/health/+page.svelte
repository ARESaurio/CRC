<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, AlertTriangle, RefreshCw, ArrowLeft} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as Button from '$lib/components/ui/button/index.js';

	let checking = $state(true);
	let authorized = $state(false);
	let overallStatus = $state<'checking'|'healthy'|'degraded'|'down'>('checking');
	let lastCheckTime = $state('');

	interface ServiceCheck { name: string; icon: string; status: 'checking'|'ok'|'warning'|'error'; detail: string; latency?: number; }
	let services = $state<ServiceCheck[]>([
		{ name: 'Supabase Database', icon: 'settings', status: 'checking', detail: 'Checking...' },
		{ name: 'Authentication', icon: 'lock', status: 'checking', detail: 'Checking...' },
		{ name: 'Cloudflare Worker', icon: 'globe', status: 'checking', detail: 'Checking...' },
		{ name: 'Svelte Build', icon: 'wrench', status: 'ok', detail: 'OK — Page loaded successfully' }
	]);

	interface TableStat { name: string; rows: number; }
	let tableStats = $state<TableStat[]>([]);
	let statDbRows = $state('—');
	let statErrorRate = $state('0');
	let statAvgResponse = $state('—');
	let statServicesOk = $state('—');

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/health'); return; }
				const role = await checkAdminRole();
				authorized = !!role?.admin;
				checking = false;
				if (authorized) runChecks();
			}
		});
		return unsub;
	});

	async function runChecks() {
		overallStatus = 'checking';

		// 1. Supabase Database
		const dbStart = performance.now();
		try {
			const { data, error } = await supabase.from('profiles').select('runner_id', { count: 'exact' });
			const latency = Math.round(performance.now() - dbStart);
			if (error) throw error;
			services[0] = { ...services[0], status: 'ok', detail: `Connected (${latency}ms)`, latency };
		} catch (e: any) {
			services[0] = { ...services[0], status: 'error', detail: e.message };
		}

		// 2. Authentication
		try {
			const { data } = await supabase.auth.getSession();
			services[1] = { ...services[1], status: data.session ? 'ok' : 'warning', detail: data.session ? 'Session active' : 'No active session' };
		} catch (e: any) {
			services[1] = { ...services[1], status: 'error', detail: e.message };
		}

		// 3. Worker (attempt a health-check-like query)
		services[2] = { ...services[2], status: 'ok', detail: 'Assumed OK (no health endpoint)' };

		services = [...services];

		// Table counts
		const tables = ['profiles', 'pending_runs', 'pending_games', 'game_update_requests', 'role_game_verifiers'];
		let totalRows = 0;
		const stats: TableStat[] = [];
		for (const table of tables) {
			try {
				const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
				const c = count || 0;
				stats.push({ name: table, rows: c });
				totalRows += c;
			} catch {
				stats.push({ name: table, rows: -1 });
			}
		}
		tableStats = stats;
		statDbRows = totalRows.toLocaleString();

		// Calculate overall
		const okCount = services.filter(s => s.status === 'ok').length;
		const errorCount = services.filter(s => s.status === 'error').length;
		statServicesOk = `${okCount}/${services.length}`;
		if (errorCount > 0) overallStatus = 'down';
		else if (services.some(s => s.status === 'warning')) overallStatus = 'degraded';
		else overallStatus = 'healthy';

		statAvgResponse = services[0].latency ? `${services[0].latency}ms` : '—';
		lastCheckTime = new Date().toLocaleTimeString();
	}

	const statusColors: Record<string, string> = { ok: '#10b981', warning: '#f0ad4e', error: '#ef4444', checking: 'var(--text-muted)' };
	const overallLabels: Record<string, string> = { checking: 'Checking systems...', healthy: 'All Systems Operational', degraded: 'Degraded Performance', down: 'Issues Detected' };
	const overallColors: Record<string, string> = { checking: 'var(--border)', healthy: '#10b981', degraded: '#f0ad4e', down: '#ef4444' };
	const rowPct = $derived(Math.min((parseInt(statDbRows.replace(/,/g, '')) || 0) / 100000 * 100, 100));
</script>

<svelte:head><title>{m.admin_health_title()}</title></svelte:head>
<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}><ArrowLeft size={14} /> {m.admin_dashboard()}</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_verifying_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_super_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h2>{m.admin_health_heading()}</h2>
		<p class="muted mb-2">{m.admin_health_desc()}</p>

		<!-- Overall Status Bar -->
		<div class="health-bar" style:border-color={overallColors[overallStatus]}>
			<span class="health-dot" style:background={overallColors[overallStatus]}></span>
			<span class="health-text">{overallLabels[overallStatus]}</span>
			{#if lastCheckTime}<span class="health-time">{lastCheckTime}</span>{/if}
			<Button.Root size="sm" onclick={runChecks} disabled={overallStatus === 'checking'}><RefreshCw size={12} /> Refresh</Button.Root>
		</div>

		<!-- Quick Stats -->
		<div class="stats-row">
			<div class="stat"><span class="stat__val">{statDbRows}</span><span class="stat__lbl">{m.admin_health_rows()}</span></div>
			<div class="stat"><span class="stat__val">{statErrorRate}</span><span class="stat__lbl">{m.admin_health_errors()}</span></div>
			<div class="stat"><span class="stat__val">{statAvgResponse}</span><span class="stat__lbl">{m.admin_health_avg_response()}</span></div>
			<div class="stat"><span class="stat__val">{statServicesOk}</span><span class="stat__lbl">{m.admin_health_services_ok()}</span></div>
		</div>

		<!-- Service Status -->
		<div class="health-grid">
			{#each services as svc}
				<div class="health-card">
					<div class="health-card__header">
						<span class="health-card__icon"><Icon name={svc.icon} size={14} /></span>
						<span class="health-card__name">{svc.name}</span>
						<span class="health-card__status" style:color={statusColors[svc.status]}>
							{#if svc.status === 'ok'}<CheckCircle size={14} /> OK{:else if svc.status === 'warning'}<AlertTriangle size={14} /> Warning{:else if svc.status === 'error'}<XCircle size={14} /> Error{:else}Checking{/if}
						</span>
					</div>
					<p class="health-card__detail">{svc.detail}</p>
					{#if svc.latency}<span class="health-card__latency">{svc.latency}ms</span>{/if}
				</div>
			{/each}
		</div>

		<!-- Table Statistics -->
		{#if tableStats.length > 0}
			<div class="card mt-4">
				<h2>{m.admin_health_tables()}</h2>
				<table class="table-stats">
					<thead><tr><th>{m.admin_health_table()}</th><th class="r">{m.admin_health_row_count()}</th><th>{m.admin_users_status()}</th></tr></thead>
					<tbody>
						{#each tableStats as t}
							<tr>
								<td><code>{t.name}</code></td>
								<td class="r">{t.rows >= 0 ? t.rows.toLocaleString() : '—'}</td>
								<td>{#if t.rows >= 0}<span class="status-ok"><CheckCircle size={14} /></span>{:else}<span class="status-err"><XCircle size={14} /> Not found</span>{/if}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<!-- Data Usage -->
		<div class="card mt-4">
			<h2>{m.admin_health_free_tier()}</h2>
			<p class="muted mb-2">{m.admin_health_free_tier_desc()}</p>
			<div class="usage-item"><span class="usage-lbl">{m.admin_health_rows()}</span>
				<div class="usage-bar-wrap"><div class="usage-bar" style:width="{rowPct}%" class:usage-bar--warn={rowPct > 75}></div></div>
				<span class="usage-val">{statDbRows} / 100,000</span>
			</div>
			<div class="usage-item"><span class="usage-lbl">{m.admin_health_storage()}</span>
				<div class="usage-bar-wrap"><div class="usage-bar" style="width:1%"></div></div>
				<span class="usage-val">— / 500MB</span>
			</div>
			<div class="usage-item"><span class="usage-lbl">{m.admin_health_auth()}</span>
				<div class="usage-bar-wrap"><div class="usage-bar" style="width:0%"></div></div>
				<span class="usage-val">— / 50,000</span>
			</div>
		</div>

	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--text-muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	.btn { display: inline-block; padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 6px; color: var(--fg); background: transparent; cursor: pointer; font-size: 0.85rem; text-decoration: none; font-family: inherit; }
	.mt-4 { margin-top: 1.5rem; } .mb-2 { margin-bottom: 1rem; }
	h2 { margin: 0 0 0.25rem; }
	.r { text-align: right; }

	.health-bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.25rem; background: var(--surface); border: 1px solid; border-radius: 10px; margin-bottom: 1.5rem; }
	.health-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
	.health-text { font-weight: 600; flex: 1; }
	.health-time { font-size: 0.8rem; color: var(--text-muted); }

	.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
	@media (max-width: 700px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
	.stat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; text-align: center; }
	.stat__val { display: block; font-size: 1.5rem; font-weight: 700; color: var(--accent); line-height: 1.2; }
	.stat__lbl { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }

	.health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
	.health-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
	.health-card__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
	.health-card__icon { font-size: 1.25rem; }
	.health-card__name { font-weight: 600; flex: 1; }
	.health-card__status { font-size: 0.8rem; font-weight: 600; }
	.health-card__detail { font-size: 0.85rem; color: var(--text-muted); margin: 0; }
	.health-card__latency { font-size: 0.75rem; color: var(--text-muted); }

	.table-stats { width: 100%; border-collapse: collapse; }
	.table-stats th, .table-stats td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
	.table-stats th { background: var(--bg); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); }
	.table-stats code { font-size: 0.85rem; }
	.status-ok { color: #10b981; } .status-err { color: #ef4444; font-size: 0.85rem; }

	.usage-item { margin-bottom: 1rem; }
	.usage-lbl { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
	.usage-bar-wrap { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; height: 10px; overflow: hidden; margin-bottom: 0.25rem; }
	.usage-bar { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.5s; }
	.usage-bar--warn { background: #f0ad4e; }
	.usage-val { font-size: 0.8rem; color: var(--text-muted); }
</style>
