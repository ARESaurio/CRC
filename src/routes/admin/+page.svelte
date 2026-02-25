<script lang="ts">
	import { onMount } from 'svelte';
	import { session, user, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';

	let role = $state<{ admin: boolean; verifier: boolean; runnerId: string | null } | null>(null);
	let checking = $state(true);
	let counts = $state<Record<string, number>>({});
	let countsLoading = $state(true);

	onMount(() => {
		const unsub = isLoading.subscribe(async (loading) => {
			if (!loading) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) {
					goto('/sign-in?redirect=/admin');
					return;
				}

				role = await checkAdminRole();
				checking = false;

				if (role?.admin || role?.verifier) {
					await loadCounts();
				}
			}
		});
		return unsub;
	});

	async function loadCounts() {
		countsLoading = true;
		try {
			const [profiles, games, runs, runsQueue] = await Promise.all([
				supabase.from('pending_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
				supabase.from('pending_games').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
				supabase.from('pending_runs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
				supabase.from('pending_runs').select('id', { count: 'exact', head: true }).eq('status', 'pending')
			]);
			counts = {
				pendingProfiles: profiles.count ?? 0,
				pendingGames: games.count ?? 0,
				pendingRuns: runs.count ?? 0,
				pendingRunsQueue: runsQueue.count ?? 0
			};
		} catch (err) {
			console.error('Failed to load counts:', err);
		}
		countsLoading = false;
	}

	// Navigation sections — order matters
	// adminOnly = admins only | staffOnly = admin staff mgmt | verifierOnly = verifiers only | none = all staff
	const NAV_SECTIONS = [
		{ key: 'profiles',     icon: '👥', title: 'Pending Profiles', desc: 'Review runner profile applications.',          href: '/admin/profiles',    countKey: 'pendingProfiles',  adminOnly: true },
		{ key: 'games',        icon: '🎮', title: 'Pending Games',    desc: 'Review new game submissions.',                href: '/admin/games',       countKey: 'pendingGames',     adminOnly: true },
		{ key: 'runs',         icon: '🏃', title: 'Approved Runs',    desc: 'Manage and view all approved runs.',          href: '/admin/runs',        countKey: 'pendingRuns',      adminOnly: true },
		{ key: 'runs-queue',   icon: '📋', title: 'Runs Queue',       desc: 'Review, approve, or reject submitted runs.',  href: '/admin/runs-queue',  countKey: 'pendingRunsQueue', verifierOnly: true },
		{ key: 'game-updates', icon: '📝', title: 'Game Updates',     desc: 'Review user-submitted game page corrections.', href: '/admin/game-updates', verifierOnly: true },
		{ key: 'users',        icon: '👥', title: 'Users & Roles',    desc: 'Manage users and assign staff roles.',        href: '/admin/users',       staffOnly: true },
		{ key: 'financials',   icon: '💰', title: 'Financials',       desc: 'Track site income and expenses.',             href: '/admin/financials',  adminOnly: true },
		{ key: 'health',       icon: '💚', title: 'Site Health',      desc: 'Performance, storage, and system status.',   href: '/admin/health',      adminOnly: true },
		{ key: 'staff-guides', icon: '📖', title: 'Staff Guides',     desc: 'Internal documentation for staff.',           href: '/admin/staff-guides' },
		{ key: 'debug',        icon: '🔧', title: 'Debug Tools',      desc: 'Role simulation, system diagnostics.',        href: '/admin/debug',       adminOnly: true }
	];

	let visibleSections = $derived(
		NAV_SECTIONS.filter(s => {
			if (s.adminOnly)    return role?.admin;
			if (s.staffOnly)    return role?.admin;
			if ((s as any).verifierOnly) return role?.verifier;
			return role?.admin || role?.verifier; // staff-guides: all staff
		})
	);

	let totalPending = $derived(
		(counts.pendingProfiles ?? 0) + (counts.pendingGames ?? 0) + (counts.pendingRuns ?? 0)
	);
</script>

<svelte:head><title>Admin Dashboard | Challenge Run Community</title></svelte:head>

<div class="page-width">
	{#if checking || $isLoading}
		<div class="admin-loading">
			<div class="spinner"></div>
			<p class="muted">Checking permissions...</p>
		</div>
	{:else if !role?.admin && !role?.verifier}
		<div class="admin-denied">
			<h1>🔒 Access Denied</h1>
			<p class="muted">You need verifier, admin, or super admin privileges to access the dashboard.</p>
			<a href="/" class="btn btn--outline">Go Home</a>
		</div>
	{:else}
		<div class="dash">
			<!-- Header -->
			<div class="dash-header">
				<div class="dash-header__info">
					<h1>Dashboard</h1>
					<p class="muted">{role.admin ? '🛡️ Admin' : '✅ Verifier'}</p>
				</div>
				{#if $user}
					<div class="dash-header__user">
						{#if $user.user_metadata?.avatar_url}
							<img class="dash-header__avatar" src={$user.user_metadata.avatar_url} alt="" />
						{/if}
						<span>{$user.user_metadata?.full_name || $user.user_metadata?.name || 'Staff'}</span>
					</div>
				{/if}
			</div>

			<!-- Stats row -->
			<div class="dash-stats">
				<div class="dash-stat" class:dash-stat--alert={counts.pendingProfiles > 0}>
					<span class="dash-stat__value">{countsLoading ? '…' : counts.pendingProfiles ?? 0}</span>
					<span class="dash-stat__label">Pending Profiles</span>
				</div>
				<div class="dash-stat" class:dash-stat--alert={counts.pendingGames > 0}>
					<span class="dash-stat__value">{countsLoading ? '…' : counts.pendingGames ?? 0}</span>
					<span class="dash-stat__label">Pending Games</span>
				</div>
				<div class="dash-stat" class:dash-stat--alert={counts.pendingRuns > 0}>
					<span class="dash-stat__value">{countsLoading ? '…' : counts.pendingRuns ?? 0}</span>
					<span class="dash-stat__label">Pending Runs</span>
				</div>
				<div class="dash-stat">
					<span class="dash-stat__value">{totalPending}</span>
					<span class="dash-stat__label">Total Pending</span>
				</div>
			</div>

			<!-- Navigation grid -->
			<div class="dash-nav">
				{#each visibleSections as sec}
					<a class="dash-nav-card" href={sec.href}>
						<span class="dash-nav-card__icon">{sec.icon}</span>
						<span class="dash-nav-card__title">
							{sec.title}
							{#if sec.countKey && (counts[sec.countKey] ?? 0) > 0}
								<span class="dash-nav-card__badge">{counts[sec.countKey]}</span>
							{/if}
						</span>
						<p class="dash-nav-card__desc">{sec.desc}</p>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.admin-loading, .admin-denied { text-align: center; padding: 4rem 0; }
	.spinner {
		width: 36px; height: 36px;
		border: 3px solid var(--border); border-top-color: var(--accent);
		border-radius: 50%; margin: 0 auto 1rem;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn--outline {
		display: inline-block; padding: 0.5rem 1.25rem;
		border: 1px solid var(--border); border-radius: 6px;
		color: var(--fg); text-decoration: none;
	}

	.dash { max-width: 960px; margin: 0 auto; }

	/* Header */
	.dash-header {
		display: flex; justify-content: space-between; align-items: flex-start;
		margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;
	}
	.dash-header h1 { margin: 0; font-size: 1.5rem; }
	.dash-header__user {
		display: flex; align-items: center; gap: 0.75rem;
		font-size: 0.9rem; color: var(--muted);
	}
	.dash-header__avatar {
		width: 36px; height: 36px; border-radius: 50%;
		object-fit: cover; background: var(--surface);
	}

	/* Stats row */
	.dash-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 1rem; margin-bottom: 2rem;
	}
	.dash-stat {
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 12px; padding: 1.25rem; text-align: center;
	}
	.dash-stat--alert {
		background: rgba(239, 68, 68, 0.06);
		border-color: rgba(239, 68, 68, 0.25);
	}
	.dash-stat__value {
		display: block; font-size: 2rem; font-weight: 700;
		line-height: 1.2; color: var(--fg);
	}
	.dash-stat--alert .dash-stat__value { color: #ef4444; }
	.dash-stat__label {
		display: block; font-size: 0.8rem; font-weight: 500;
		color: var(--muted); margin-top: 0.25rem;
	}

	/* Nav grid */
	.dash-nav {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1rem;
	}
	.dash-nav-card {
		display: block; padding: 1.25rem;
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 12px; text-decoration: none; color: var(--fg);
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.dash-nav-card:hover {
		border-color: var(--accent);
		box-shadow: 0 2px 12px rgba(99, 102, 241, 0.1);
	}
	.dash-nav-card__icon { font-size: 1.5rem; display: block; margin-bottom: 0.5rem; }
	.dash-nav-card__title {
		font-size: 1rem; font-weight: 700; display: flex;
		align-items: center; gap: 0.5rem;
	}
	.dash-nav-card__badge {
		display: inline-flex; align-items: center; justify-content: center;
		min-width: 22px; height: 22px; padding: 0 6px;
		border-radius: 11px; font-size: 0.75rem; font-weight: 700;
		background: #ef4444; color: #fff;
	}
	.dash-nav-card__desc {
		margin: 0.35rem 0 0; font-size: 0.85rem;
		color: var(--muted); line-height: 1.4;
	}

	@media (max-width: 600px) {
		.dash-stats { grid-template-columns: repeat(2, 1fr); }
		.dash-nav { grid-template-columns: 1fr; }
	}
</style>
