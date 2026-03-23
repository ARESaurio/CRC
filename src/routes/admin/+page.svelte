<script lang="ts">
	import { onMount } from 'svelte';
	import { session, user, isLoading } from '$stores/auth';
	import { debugRole } from '$stores/debug';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { realRoleToDebugId, canAccessRoute } from '$lib/permissions';
	import type { DebugRoleId } from '$stores/debug';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import {
		Users, Gamepad2, FileEdit, Timer, Flag,
		User, Wrench, FileText, Newspaper, MessageSquare,
		BookOpen, Bug, HeartPulse, DollarSign, Settings,
		Lock, Star, Shield, ShieldCheck, CheckCircle
	} from 'lucide-svelte';

	let role = $state<{ admin: boolean; superAdmin: boolean; moderator: boolean; verifier: boolean; runnerId: string | null } | null>(null);
	let realRoleId = $state<DebugRoleId>('user');
	let checking = $state(true);
	let counts = $state<Record<string, number>>({});
	let countsLoading = $state(true);
	let activeTab = $state('queue');

	// Effective role for UI filtering
	let effectiveRole = $derived($debugRole ?? realRoleId);

	onMount(() => {
		const unsub = isLoading.subscribe(async (loading) => {
			if (!loading) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) {
					goto('/sign-in?redirect=/admin');
					return;
				}

				const fullRole = await checkAdminRole();
				role = fullRole;
				realRoleId = realRoleToDebugId(fullRole);
				checking = false;

				if (fullRole?.admin || fullRole?.verifier || fullRole?.moderator) {
					await loadCounts();
				}
			}
		});
		return unsub;
	});

	async function loadCounts() {
		countsLoading = true;
		try {
			const [profiles, games, runs, gameUpdates, reports] = await Promise.all([
				supabase.from('pending_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
				supabase.from('pending_games').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
				supabase.from('pending_runs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
				supabase.from('game_update_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
				supabase.from('user_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
			]);
			counts = {
				pendingProfiles: profiles.count ?? 0,
				pendingGames: games.count ?? 0,
				pendingRuns: runs.count ?? 0,
				pendingUpdates: gameUpdates.count ?? 0,
				pendingReports: reports.count ?? 0
			};
		} catch (err) {
			console.error('Failed to load counts:', err);
		}
		countsLoading = false;
	}

	// Navigation sections grouped by tab
	const NAV_SECTIONS: { key: string; icon: any; title: string; desc: string; href: string; countKey?: string; group: string }[] = [
		// Review Queue (Profiles → Games → Updates → Runs → Reports)
		{ key: 'profiles',     icon: Users,        title: m.admin_nav_profiles(),         desc: m.admin_nav_profiles_desc(),     href: '/admin/profiles',     countKey: 'pendingProfiles', group: 'queue' },
		{ key: 'games',        icon: Gamepad2,      title: m.admin_nav_games(),            desc: m.admin_nav_games_desc(),        href: '/admin/games',        countKey: 'pendingGames',   group: 'queue' },
		{ key: 'game-updates', icon: FileEdit,      title: m.admin_nav_game_updates(),     desc: m.admin_nav_game_updates_desc(), href: '/admin/game-updates', countKey: 'pendingUpdates', group: 'queue' },
		{ key: 'runs',         icon: Timer,         title: m.admin_nav_runs(),             desc: m.admin_nav_runs_desc(),         href: '/admin/runs',         countKey: 'pendingRuns',    group: 'queue' },
		{ key: 'reports',      icon: Flag,          title: m.admin_nav_reports(),          desc: m.admin_nav_reports_desc(),      href: '/admin/reports',      countKey: 'pendingReports', group: 'queue' },

		// Tools (Users → Game Editor → Contributions → News → Rule Suggestions → Staff Guides → Debug)
		{ key: 'users',            icon: User,            title: m.admin_nav_users(),         desc: m.admin_nav_users_desc(),          href: '/admin/users',            group: 'tools' },
		{ key: 'game-editor',      icon: Wrench,          title: m.admin_nav_game_editor(),   desc: m.admin_nav_game_editor_desc(),    href: '/admin/game-editor',      group: 'tools' },
		{ key: 'contributions',    icon: FileText,        title: 'Contributions',             desc: 'Edit runner contributions & guides', href: '/admin/contributions', group: 'tools' },
		{ key: 'news',             icon: Newspaper,       title: 'News',                      desc: 'Create and manage news posts',    href: '/admin/news',             group: 'tools' },
		{ key: 'rule-suggestions', icon: MessageSquare,   title: 'Rule Suggestions',          desc: 'Community rule change proposals', href: '/admin/rule-suggestions', group: 'tools' },
		{ key: 'staff-guides',     icon: BookOpen,        title: m.admin_nav_staff_guides(),  desc: m.admin_nav_staff_guides_desc(),   href: '/admin/staff-guides',     group: 'tools' },
		{ key: 'debug',            icon: Bug,             title: m.admin_nav_debug(),         desc: m.admin_nav_debug_desc(),          href: '/admin/debug',            group: 'tools' },

		// System
		{ key: 'health',        icon: HeartPulse,  title: m.admin_nav_health(),       desc: m.admin_nav_health_desc(),                  href: '/admin/health',        group: 'system' },
		{ key: 'financials',    icon: DollarSign,  title: m.admin_nav_financials(),   desc: m.admin_nav_financials_desc(),              href: '/admin/financials',    group: 'system' },
		{ key: 'site-settings', icon: Settings,    title: 'Site Settings',            desc: 'Default rules template and global config', href: '/admin/site-settings', group: 'system' },
	];

	// Filter nav cards based on effective role AND active tab
	let visibleSections = $derived(
		NAV_SECTIONS
			.filter(s => canAccessRoute(effectiveRole, s.href))
			.filter(s => s.group === activeTab)
	);

	// Total pending count for the Queue tab badge
	let totalPending = $derived(
		(counts.pendingGames ?? 0) +
		(counts.pendingProfiles ?? 0) +
		(counts.pendingRuns ?? 0) +
		(counts.pendingUpdates ?? 0) +
		(counts.pendingReports ?? 0)
	);

	// Only show System tab if user has access to at least one system route
	let showSystemTab = $derived(
		['super_admin', 'admin'].includes(effectiveRole)
	);

	// Tab definitions
	let dashTabs = $derived([
		{ id: 'queue', label: 'Review Queue', badge: totalPending },
		{ id: 'tools', label: 'Tools', badge: 0 },
		...(showSystemTab ? [{ id: 'system', label: 'System', badge: 0 }] : []),
	]);

	// Admin+ can see profile/game pending counts; lower roles only see runs + updates
	let isAdminPlus = $derived(
		effectiveRole === 'super_admin' || effectiveRole === 'admin'
	);
</script>

<svelte:head><title>{m.admin_panel()} | Challenge Run Community</title></svelte:head>

<div class="page-width">
	{#if checking || $isLoading}
		<div class="admin-loading">
			<div class="spinner"></div>
			<p class="muted">{m.admin_checking_permissions()}</p>
		</div>
	{:else if !role?.admin && !role?.verifier && !role?.moderator}
		<div class="admin-denied">
			<h1><Lock size={24} class="inline-icon" /> {m.admin_access_denied()}</h1>
			<p class="muted">{m.admin_denied_message()}</p>
			<a href={localizeHref("/")} class="btn btn--outline">{m.error_go_home()}</a>
		</div>
	{:else}
		<div class="dash">
			<!-- Header -->
			<div class="dash-header">
				<div class="dash-header__info">
					<h1>{m.admin_panel()}</h1>
					<p class="muted">
						{#if effectiveRole === 'super_admin'}<Star size={14} class="inline-icon" /> Super Admin
						{:else if effectiveRole === 'admin'}<Shield size={14} class="inline-icon" /> Admin
						{:else if effectiveRole === 'moderator'}<ShieldCheck size={14} class="inline-icon" /> Moderator
						{:else if effectiveRole === 'verifier'}<CheckCircle size={14} class="inline-icon" /> Verifier
						{:else}<User size={14} class="inline-icon" /> User{/if}
						{#if $debugRole}<span style="font-size: 0.75rem; opacity: 0.6;">(debug)</span>{/if}
					</p>
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

			<!-- Stats row (matches Review Queue order: Profiles → Games → Updates → Runs) -->
			<div class="dash-stats">
				{#if isAdminPlus}
					<div class="dash-stat" class:dash-stat--alert={counts.pendingProfiles > 0}>
						<span class="dash-stat__value">{countsLoading ? '…' : counts.pendingProfiles ?? 0}</span>
						<span class="dash-stat__label">{m.admin_pending_profiles()}</span>
					</div>
					<div class="dash-stat" class:dash-stat--alert={counts.pendingGames > 0}>
						<span class="dash-stat__value">{countsLoading ? '…' : counts.pendingGames ?? 0}</span>
						<span class="dash-stat__label">{m.admin_pending_games()}</span>
					</div>
				{/if}
				<div class="dash-stat" class:dash-stat--alert={(counts.pendingUpdates ?? 0) > 0}>
					<span class="dash-stat__value">{countsLoading ? '…' : counts.pendingUpdates ?? 0}</span>
					<span class="dash-stat__label">{m.admin_pending_game_updates()}</span>
				</div>
				<div class="dash-stat" class:dash-stat--alert={counts.pendingRuns > 0}>
					<span class="dash-stat__value">{countsLoading ? '…' : counts.pendingRuns ?? 0}</span>
					<span class="dash-stat__label">{m.admin_pending_runs()}</span>
				</div>
			</div>

			<!-- Tabs -->
			<nav class="game-tabs tabs--flush" aria-label="Admin sections">
				{#each dashTabs as tab}
					<button
						type="button"
						class="game-tab"
						class:game-tab--active={activeTab === tab.id}
						onclick={() => activeTab = tab.id}
					>
						{tab.label}
						{#if tab.badge > 0}
							<span class="dash-tab-badge">{tab.badge}</span>
						{/if}
					</button>
				{/each}
			</nav>

			<!-- Tab content: navigation grid -->
			<div class="tab-body">
				<div class="dash-nav">
					{#each visibleSections as sec (sec.key)}
						{@const Icon = sec.icon}
						<a class="dash-nav-card" href={sec.href}>
							<span class="dash-nav-card__icon"><Icon size={22} /></span>
							<span class="dash-nav-card__title">
								{sec.title}
								{#if sec.countKey && (counts[sec.countKey] ?? 0) > 0}
									<span class="dash-nav-card__badge">{counts[sec.countKey]}</span>
								{/if}
							</span>
							<p class="dash-nav-card__desc">{sec.desc}</p>
						</a>
					{/each}
					{#if visibleSections.length === 0}
						<p class="muted" style="grid-column: 1 / -1; text-align: center; padding: 2rem 0;">No items in this section for your role.</p>
					{/if}
				</div>
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
		gap: 1rem; margin-bottom: 1.5rem;
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

	/* Tab badge (pending count inside tab button) */
	.dash-tab-badge {
		display: inline-flex; align-items: center; justify-content: center;
		min-width: 18px; height: 18px; padding: 0 5px;
		border-radius: 9px; font-size: 0.7rem; font-weight: 700;
		background: #ef4444; color: #fff;
		margin-left: 0.35rem;
	}

	/* Nav grid — 2 columns */
	.dash-nav {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
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
	.dash-nav-card__icon { display: block; margin-bottom: 0.5rem; color: var(--accent); }

	/* Inline icon utility — vertically aligns Lucide SVGs with text */
	:global(.inline-icon) { display: inline-block; vertical-align: -0.125em; }
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
