<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { session, user } from '$stores/auth';
	import { debugRole, debugHidesAuth } from '$stores/debug';
	import { toggleTheme, theme } from '$stores/theme';
	import { supabase, signOut as doSignOut } from '$lib/supabase';
	import { fetchPending } from '$lib/admin';
	import LanguageSwitcher from '$components/LanguageSwitcher.svelte';
	import NotificationBell from '$components/NotificationBell.svelte';
	import MessagePanel from '$components/MessagePanel.svelte';
	import AuthPopup from '$components/auth/AuthPopup.svelte';
	import ReportModal from '$components/ReportModal.svelte';
	import { loadNotifications } from '$stores/notifications';
	import { loadUnreadCount, unreadMessages } from '$stores/messages';
	import { reportOpen } from '$stores/report';
	import { localizeHref, deLocalizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Separator from '$lib/components/ui/separator/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as ScrollArea from '$lib/components/ui/scroll-area/index.js';
	import {
		Newspaper, ScrollText, BookOpen, ClipboardList, MessageSquare, Rss,
		Search, Sun, Moon, BarChart3, Users, Gamepad2, FileEdit, Timer, Flag,
		User, Wrench, Bug, HeartPulse, DollarSign, Settings, Pencil, Palette,
		LogOut, UserPlus, Plus, FileText
	} from 'lucide-svelte';

	let moreOpen = $state(false);
	let notifOpen = $state(false);
	let langOpen = $state(false);
	let profilePanelOpen = $state(false);
	let mobileOpen = $state(false);
	let messagePanelOpen = $state(false);

	// Only one dropdown open at a time
	$effect(() => { if (moreOpen) { notifOpen = false; langOpen = false; } });
	$effect(() => { if (notifOpen) { moreOpen = false; langOpen = false; } });
	$effect(() => { if (langOpen) { moreOpen = false; notifOpen = false; } });
	let searchQuery = $state('');
	let adminPanelOpen = $state(false);
	let authPopupOpen = $state(false);
	let adminCounts = $state<Record<string, number>>({});

	// ─── Profile info (fetched client-side when signed in) ────
	let profileInfo = $state<{
		runner_id: string | null;
		profileState: 'active' | 'pending' | 'none';
		is_admin: boolean;
		is_moderator: boolean;
		is_verifier: boolean;
	} | null>(null);
	let profileLoaded = $state(false);

	$effect(() => {
		const currentUser = $user;
		if (!currentUser) {
			profileInfo = null;
			profileLoaded = false;
			return;
		}

		(async () => {
			try {
				const { data: profile } = await supabase
					.from('profiles')
					.select('runner_id, is_admin, is_super_admin, role, status')
					.eq('user_id', currentUser.id)
					.maybeSingle();

				if (profile?.runner_id && profile.status === 'approved') {
					const [{ data: verifierRole }, { data: moderatorRole }] = await Promise.all([
						supabase
							.from('role_game_verifiers')
							.select('id')
							.eq('user_id', currentUser.id)
							.limit(1)
							.maybeSingle(),
						supabase
							.from('role_game_moderators')
							.select('id')
							.eq('user_id', currentUser.id)
							.limit(1)
							.maybeSingle()
					]);

					profileInfo = {
						runner_id: profile.runner_id,
						profileState: 'active',
						is_admin: profile.is_admin === true || profile.is_super_admin === true,
						is_moderator: profile.role === 'moderator' || !!moderatorRole,
						is_verifier: !!verifierRole
					};
				} else if (profile?.runner_id) {
					profileInfo = {
						runner_id: profile.runner_id,
						profileState: 'pending',
						is_admin: false,
						is_moderator: false,
						is_verifier: false
					};
				} else {
					const { data: pending } = await supabase
						.from('pending_profiles')
						.select('id, has_profile')
						.eq('user_id', currentUser.id)
						.maybeSingle();

					profileInfo = {
						runner_id: null,
						profileState: (pending?.has_profile) ? 'pending' : 'none',
						is_admin: false,
						is_moderator: false,
						is_verifier: false
					};
				}
			} catch {
				profileInfo = null;
			}
			profileLoaded = true;
		})();
	});

	// ─── Derived ───────────────────────────────────────────────
	let profileLink = $derived.by(() => {
		if (!profileInfo || profileInfo.profileState === 'none') {
			return { href: '/profile/create', icon: 'plus', label: m.user_menu_create_profile() };
		}
		if (profileInfo.profileState === 'active' && profileInfo.runner_id) {
			return { href: `/runners/${profileInfo.runner_id}`, icon: 'user', label: m.user_menu_my_profile() };
		}
		if (profileInfo.profileState === 'pending') {
			return { href: '/profile/status', icon: 'hourglass', label: m.user_menu_profile_status() };
		}
		return { href: '/profile/create', icon: 'plus', label: m.user_menu_create_profile() };
	});

	let roleLabel = $derived.by(() => {
		if (!profileInfo || profileInfo.profileState === 'none') return m.role_no_profile();
		if (profileInfo.is_admin) return m.role_admin();
		if (profileInfo.is_moderator) return m.role_moderator();
		if (profileInfo.is_verifier) return m.role_verifier();
		if (profileInfo.profileState === 'pending') return `⏳ ${m.role_pending()}`;
		return m.role_runner();
	});

	// ─── Sidebar visibility (respects debug mode) ────────────
	let showAdminLink = $derived(
		$debugRole
			? ['super_admin', 'admin', 'moderator', 'verifier'].includes($debugRole)
			: !!(profileInfo?.is_admin || profileInfo?.is_moderator || profileInfo?.is_verifier)
	);

	let isSuperAdmin = $derived(
		$debugRole
			? $debugRole === 'super_admin'
			: profileInfo?.is_admin === true
	);

	let sidebarIsAdmin = $derived(
		$debugRole
			? ['super_admin', 'admin'].includes($debugRole)
			: profileInfo?.is_admin === true
	);

	let sidebarIsModerator = $derived(
		$debugRole
			? ['super_admin', 'admin', 'moderator'].includes($debugRole)
			: !!(profileInfo?.is_admin || profileInfo?.is_moderator)
	);

	let sidebarIsVerifier = $derived(
		$debugRole
			? ['super_admin', 'admin', 'moderator', 'verifier'].includes($debugRole)
			: !!(profileInfo?.is_verifier || profileInfo?.is_admin || profileInfo?.is_moderator)
	);

	let sidebarRoleBadge = $derived.by(() => {
		if ($debugRole) {
			const labels: Record<string, string> = {
				super_admin: 'Super Admin', admin: 'Admin', moderator: 'Moderator', verifier: 'Verifier'
			};
			return labels[$debugRole] ?? '';
		}
		return isSuperAdmin ? m.admin_sidebar_super_admin() : profileInfo?.is_admin ? m.admin_sidebar_admin() : profileInfo?.is_moderator ? m.admin_sidebar_moderator() : m.admin_sidebar_verifier();
	});

	// Debug: should we show the signed-in UI or the sign-in link?
	let showAsSignedIn = $derived($session && !$debugHidesAuth);

	// Load admin counts when profile reveals admin/verifier
	$effect(() => {
		if (showAdminLink) {
			loadAdminCounts();
		}
	});

	// Load notifications and unread message count when user is signed in
	$effect(() => {
		if (profileLoaded && $session) {
			loadNotifications();
			loadUnreadCount();
		}
	});

	async function loadAdminCounts() {
		try {
			const [profiles, games, runs] = await Promise.all([
				fetchPending('pending_profiles'),
				fetchPending('pending_games'),
				fetchPending('pending_runs')
			]);
			// game_update_requests uses created_at, not submitted_at — query directly
			let pendingUpdates = 0;
			try {
				const { count } = await supabase
					.from('game_update_requests')
					.select('id', { count: 'exact', head: true })
					.eq('status', 'pending');
				pendingUpdates = count ?? 0;
			} catch { /* ignore */ }
			adminCounts = {
				pendingProfiles: profiles.length,
				pendingGames: games.length,
				pendingRuns: runs.length,
				pendingUpdates
			};
		} catch { /* ignore */ }
	}

	function isAdminActive(path: string): boolean {
		const current = deLocalizeHref($page.url.pathname);
		if (path === '/admin' || path === '/admin/') {
			return current === '/admin' || current === '/admin/';
		}
		return current.startsWith(path);
	}

	function isActive(path: string): boolean {
		const current = deLocalizeHref($page.url.pathname);
		return current.startsWith(path);
	}

	async function signOut() {
		profilePanelOpen = false;
		await doSignOut();
	}

	function closeProfilePanel() {
		profilePanelOpen = false;
	}

	function closeAdminPanel() {
		adminPanelOpen = false;
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && searchQuery.trim()) {
			goto(localizeHref(`/search?q=${encodeURIComponent(searchQuery.trim())}`));
			(e.target as HTMLInputElement)?.blur();
		}
	}

	function handleSearchSubmit() {
		if (searchQuery.trim()) {
			goto(localizeHref(`/search?q=${encodeURIComponent(searchQuery.trim())}`));
		}
	}
</script>

<header class="site-header">
	<div class="header-left">
		<a class="brand" href={localizeHref('/')} title="Go to Home">CRC</a>

		{#if showAdminLink}
			<button
				type="button"
				class="admin-toggle"
				onclick={(e) => { e.stopPropagation(); adminPanelOpen = !adminPanelOpen; }}
				aria-label="Toggle admin panel"
				title="Admin Panel"
			>
				Admin
			</button>
		{/if}

		<button
			class="mobile-toggle"
			class:active={mobileOpen}
			onclick={() => mobileOpen = !mobileOpen}
			aria-label="Toggle navigation"
		>
			<span></span><span></span><span></span>
		</button>
	</div>

	<nav class="nav" class:nav--open={mobileOpen} aria-label="Primary navigation">
		<div class="nav-group nav-links">
			<a href={localizeHref('/')} class:active={deLocalizeHref($page.url.pathname) === '/'}>{m.nav_home()}</a>
			<a href={localizeHref('/games')} class:active={isActive('/games')}>{m.nav_games()}</a>
			<a href={localizeHref('/runners')} class:active={isActive('/runners')}>{m.nav_runners()}</a>
			<a href={localizeHref('/news')} class:active={isActive('/news')}>{m.nav_news()}</a>
			<a href={localizeHref('/submit')} class:active={isActive('/submit')}>{m.nav_submit()}</a>

			<Popover.Root bind:open={moreOpen}>
				<Popover.Trigger class="nav-dropdown__toggle" aria-expanded={moreOpen}>
					{m.nav_more()} <span class="nav-dropdown__caret">▾</span>
				</Popover.Trigger>
				<Popover.Content class="nav-dropdown__menu" sideOffset={6} align="start">
					<a href={localizeHref('/rules')} class="nav-dropdown__item" onclick={() => moreOpen = false}><ScrollText size={14} /> {m.nav_rules()}</a>
					<a href={localizeHref('/glossary')} class="nav-dropdown__item" onclick={() => moreOpen = false}><BookOpen size={14} /> {m.nav_glossary()}</a>
					<a href={localizeHref('/guidelines')} class="nav-dropdown__item" onclick={() => moreOpen = false}><ClipboardList size={14} /> {m.nav_guidelines()}</a>
					<a href={localizeHref('/support')} class="nav-dropdown__item" onclick={() => moreOpen = false}><MessageSquare size={14} /> {m.nav_support()}</a>
					<div class="nav-dropdown__divider"></div>
					<a href="/feed.xml" class="nav-dropdown__item" onclick={() => moreOpen = false}><Rss size={14} /> {m.nav_rss_feed()}</a>
				</Popover.Content>
			</Popover.Root>
		</div>

		<!-- Center: Search -->
		<div class="nav-search-wrap">
			<div class="nav-search-bar">
				<input
					type="search"
					class="nav-search-input"
					placeholder={m.search_placeholder()}
					bind:value={searchQuery}
					onkeydown={handleSearchKeydown}
				/>
				<button
					type="button"
					class="nav-search-go"
					onclick={handleSearchSubmit}
					aria-label="Search"
					title="Search"
				><Search size={16} /></button>
			</div>
		</div>

		<!-- Right: User -->
		<div class="nav-group nav-user">
			<LanguageSwitcher bind:open={langOpen} />
			{#if showAsSignedIn}
				<NotificationBell bind:open={notifOpen} />
				<button
					type="button"
					class="nav-user__avatar-btn"
					aria-label="Account menu"
					onclick={(e) => { e.stopPropagation(); profilePanelOpen = !profilePanelOpen; }}
				>
					<img
						class="nav-user__avatar"
						src={$user?.user_metadata?.avatar_url || '/img/site/default-runner.png'}
						alt=""
					/>
					{#if showAdminLink}
						<span class="nav-user__admin-indicator"></span>
					{/if}
				</button>
			{:else}
				<button
					type="button"
					class="theme-toggle"
					onclick={toggleTheme}
					title="Toggle theme"
					aria-label="Toggle theme"
				>
					{#if $theme === 'dark'}<Sun size={16} />{:else}<Moon size={16} />{/if}
				</button>
				<a href={localizeHref('/sign-in')} class="nav-user__signin" onclick={(e) => { e.preventDefault(); authPopupOpen = true; }}>{m.nav_login()}</a>
			{/if}
		</div>
	</nav>
</header>

<!-- Auth Popup -->
<AuthPopup bind:open={authPopupOpen} />

<!-- Admin Panel (slides from left) -->
{#if showAdminLink}
<Sheet.Root bind:open={adminPanelOpen}>
	<Sheet.Portal>
		<Sheet.Overlay />
		<Sheet.Content side="left" class="admin-panel">
			<Sheet.Title class="sr-only">Admin Panel</Sheet.Title>
			<Sheet.Description class="sr-only">Site administration navigation</Sheet.Description>
			<div class="admin-panel__header">
				<span class="admin-panel__title">
					<span class="admin-panel__role-badge">
						{sidebarRoleBadge}
					</span>
					{m.admin_sidebar_panel()}
				</span>
				<Sheet.Close>&times;</Sheet.Close>
			</div>

			<nav class="admin-panel__nav">
				<ScrollArea.Root class="admin-panel__scroll">
				<a href={localizeHref("/admin")} class="admin-panel__item" class:is-active={isAdminActive('/admin')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon"><BarChart3 size={14} /></span>
					<span class="admin-panel__text">{m.admin_dashboard()}</span>
				</a>

				<!-- Review Queue -->
				<Separator.Root class="admin-panel__divider" />
				<div class="admin-panel__section-title">Review Queue</div>
				{#if sidebarIsAdmin}
					<a href={localizeHref("/admin/profiles")} class="admin-panel__item" class:is-active={isAdminActive('/admin/profiles')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Users size={14} /></span>
						<span class="admin-panel__text">{m.admin_nav_profiles()}</span>
						{#if adminCounts.pendingProfiles > 0}<span class="admin-panel__badge">{adminCounts.pendingProfiles}</span>{/if}
					</a>
					<a href={localizeHref("/admin/games")} class="admin-panel__item" class:is-active={isAdminActive('/admin/games')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Gamepad2 size={14} /></span>
						<span class="admin-panel__text">{m.admin_nav_games()}</span>
						{#if adminCounts.pendingGames > 0}<span class="admin-panel__badge">{adminCounts.pendingGames}</span>{/if}
					</a>
				{/if}
				{#if sidebarIsVerifier}
					<a href={localizeHref("/admin/game-updates")} class="admin-panel__item" class:is-active={isAdminActive('/admin/game-updates')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><FileEdit size={14} /></span>
						<span class="admin-panel__text">{m.admin_nav_game_updates()}</span>
						{#if adminCounts.pendingUpdates > 0}<span class="admin-panel__badge">{adminCounts.pendingUpdates}</span>{/if}
					</a>
					<a href={localizeHref("/admin/runs")} class="admin-panel__item" class:is-active={isAdminActive('/admin/runs')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Timer size={14} /></span>
						<span class="admin-panel__text">{m.admin_nav_runs()}</span>
						{#if adminCounts.pendingRuns > 0}<span class="admin-panel__badge">{adminCounts.pendingRuns}</span>{/if}
					</a>
				{/if}
				{#if sidebarIsModerator}
					<a href={localizeHref("/admin/reports")} class="admin-panel__item" class:is-active={isAdminActive('/admin/reports')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Flag size={14} /></span><span class="admin-panel__text">{m.admin_nav_reports()}</span>
					</a>
				{/if}

				<!-- Tools -->
				<Separator.Root class="admin-panel__divider" />
				<div class="admin-panel__section-title">Tools</div>
				{#if sidebarIsModerator}
					<a href={localizeHref("/admin/users")} class="admin-panel__item" class:is-active={isAdminActive('/admin/users')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><User size={14} /></span><span class="admin-panel__text">{m.admin_nav_users()}</span>
					</a>
					<a href={localizeHref("/admin/game-editor")} class="admin-panel__item" class:is-active={isAdminActive('/admin/game-editor')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Wrench size={14} /></span><span class="admin-panel__text">{m.admin_nav_game_editor()}</span>
					</a>
				{/if}
				{#if sidebarIsAdmin}
					<a href={localizeHref("/admin/news")} class="admin-panel__item" class:is-active={isAdminActive('/admin/news')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Newspaper size={14} /></span><span class="admin-panel__text">{m.admin_nav_news()}</span>
					</a>
					<a href={localizeHref("/admin/contributions")} class="admin-panel__item" class:is-active={isAdminActive('/admin/contributions')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><FileText size={14} /></span><span class="admin-panel__text">Contributions</span>
					</a>
					<a href={localizeHref("/admin/tooltips")} class="admin-panel__item" class:is-active={isAdminActive('/admin/tooltips')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><BookOpen size={14} /></span><span class="admin-panel__text">Glossary Tooltips</span>
					</a>
				{/if}
				{#if sidebarIsModerator}
					<a href={localizeHref("/admin/rule-suggestions")} class="admin-panel__item" class:is-active={isAdminActive('/admin/rule-suggestions')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><MessageSquare size={14} /></span><span class="admin-panel__text">Rule Suggestions</span>
					</a>
				{/if}
				<a href={localizeHref("/admin/staff-guides")} class="admin-panel__item" class:is-active={isAdminActive('/admin/staff-guides')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon"><BookOpen size={14} /></span><span class="admin-panel__text">{m.admin_nav_staff_guides()}</span>
				</a>
				{#if sidebarIsModerator}
					<a href={localizeHref("/admin/debug")} class="admin-panel__item" class:is-active={isAdminActive('/admin/debug')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Bug size={14} /></span><span class="admin-panel__text">{m.admin_nav_debug()}</span>
					</a>
				{/if}

				<!-- System -->
				{#if isSuperAdmin}
					<Separator.Root class="admin-panel__divider" />
					<div class="admin-panel__section-title">System</div>
					<a href={localizeHref("/admin/health")} class="admin-panel__item" class:is-active={isAdminActive('/admin/health')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><HeartPulse size={14} /></span><span class="admin-panel__text">{m.admin_nav_health()}</span>
					</a>
					<a href={localizeHref("/admin/financials")} class="admin-panel__item" class:is-active={isAdminActive('/admin/financials')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><DollarSign size={14} /></span><span class="admin-panel__text">{m.admin_nav_financials()}</span>
					</a>
					<a href={localizeHref("/admin/site-settings")} class="admin-panel__item" class:is-active={isAdminActive('/admin/site-settings')} onclick={closeAdminPanel}>
						<span class="admin-panel__icon"><Settings size={14} /></span><span class="admin-panel__text">Site Settings</span>
					</a>
				{/if}
				</ScrollArea.Root>
			</nav>

			<div class="admin-panel__footer">
				<a href={localizeHref("/legal/privacy")}>Privacy</a>
				<a href={localizeHref("/legal/terms")}>Terms</a>
			</div>
		</Sheet.Content>
	</Sheet.Portal>
</Sheet.Root>
{/if}

<!-- Profile Panel (slides from right) -->
{#if showAsSignedIn}
<Sheet.Root bind:open={profilePanelOpen}>
	<Sheet.Portal>
		<Sheet.Overlay />
		<Sheet.Content side="right" class="profile-panel">
			<Sheet.Title class="sr-only">Profile Menu</Sheet.Title>
			<Sheet.Description class="sr-only">Your account navigation</Sheet.Description>
			<div class="profile-panel__header">
				<div class="profile-panel__user">
					<img
						class="profile-panel__avatar"
						src={$user?.user_metadata?.avatar_url || '/img/site/default-runner.png'}
						alt=""
					/>
					<div class="profile-panel__info">
						<span class="profile-panel__name">{$user?.user_metadata?.full_name || $user?.email || 'User'}</span>
						{#if profileLoaded}
							<span class="profile-panel__role">{roleLabel}</span>
						{/if}
					</div>
				</div>
				<Sheet.Close>&times;</Sheet.Close>
			</div>

			<nav class="profile-panel__nav">
				<ScrollArea.Root class="profile-panel__scroll">
				<!-- My Profile -->
				<div class="profile-panel__section-title">{m.user_menu_my_profile()}</div>
				<a href={localizeHref(profileLink.href)} class="profile-panel__item" onclick={closeProfilePanel}>
					<span class="profile-panel__icon">{#if profileLink.icon === 'plus'}<UserPlus size={14} />{:else if profileLink.icon === 'user'}<User size={14} />{:else if profileLink.icon === 'hourglass'}<Timer size={14} />{:else}{profileLink.icon}{/if}</span>
					<span class="profile-panel__text">{profileLink.label}</span>
				</a>
				{#if profileInfo?.profileState === 'active'}
					<a href={localizeHref('/profile/edit')} class="profile-panel__item" onclick={closeProfilePanel}>
						<span class="profile-panel__icon"><Pencil size={14} /></span>
						<span class="profile-panel__text">{m.user_menu_edit_profile()}</span>
					</a>
				{/if}
				<a href={localizeHref('/profile/theme')} class="profile-panel__item" onclick={closeProfilePanel}>
					<span class="profile-panel__icon"><Palette size={14} /></span>
					<span class="profile-panel__text">{m.user_menu_theme()}</span>
				</a>

				<Separator.Root class="profile-panel__divider" />

				<!-- Messaging -->
				<div class="profile-panel__section-title">{m.msg_heading()}</div>
				<button type="button" class="profile-panel__item" onclick={() => { closeProfilePanel(); messagePanelOpen = true; }}>
					<span class="profile-panel__icon"><MessageSquare size={14} /></span>
					<span class="profile-panel__text">{m.msg_heading()}</span>
					{#if $unreadMessages > 0}<span class="profile-panel__badge">{$unreadMessages}</span>{/if}
				</button>
				<a href={localizeHref('/profile/submissions')} class="profile-panel__item" onclick={closeProfilePanel}>
					<span class="profile-panel__icon"><ClipboardList size={14} /></span>
					<span class="profile-panel__text">{m.user_menu_submissions()}</span>
				</a>

				<Separator.Root class="profile-panel__divider" />

				<!-- Settings -->
				<div class="profile-panel__section-title">{m.user_menu_settings()}</div>
				<button type="button" class="profile-panel__item" onclick={() => { toggleTheme(); }}>
					<span class="profile-panel__icon">{#if $theme === 'dark'}<Sun size={16} />{:else}<Moon size={16} />{/if}</span>
					<span class="profile-panel__text">{$theme === 'dark' ? m.user_menu_light_mode() : m.user_menu_dark_mode()}</span>
				</button>
				<a href={localizeHref('/profile/settings')} class="profile-panel__item" onclick={closeProfilePanel}>
					<span class="profile-panel__icon"><Settings size={14} /></span>
					<span class="profile-panel__text">{m.user_menu_settings()}</span>
				</a>
				<button type="button" class="profile-panel__item profile-panel__item--report" onclick={() => { closeProfilePanel(); $reportOpen = true; }}>
					<span class="profile-panel__icon"><Flag size={14} /></span>
					<span class="profile-panel__text">Report an Issue</span>
				</button>

				<Separator.Root class="profile-panel__divider" />

				<button type="button" class="profile-panel__item profile-panel__item--signout" onclick={signOut}>
					<span class="profile-panel__icon"><LogOut size={14} /></span>
					<span class="profile-panel__text">{m.user_menu_sign_out()}</span>
				</button>
				</ScrollArea.Root>
			</nav>
		</Sheet.Content>
	</Sheet.Portal>
</Sheet.Root>
{/if}

<MessagePanel bind:open={messagePanelOpen} />
<ReportModal bind:open={$reportOpen} />

<style>
	.theme-toggle {
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
	}
	.theme-toggle:hover {
		border-color: var(--border-hover, var(--accent));
	}
	.nav-user__signin {
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: none;
		color: var(--fg);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}
	.nav-user__signin:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* ── Search bar ──────────────────────────── */
	.nav-search-bar {
		display: flex;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 6px);
		overflow: hidden;
		transition: border-color 0.15s ease;
	}
	.nav-search-bar:focus-within {
		border-color: var(--accent);
	}
	.nav-search-input {
		min-height: var(--tap, 36px);
		width: 220px;
		padding: 0.35rem 0.75rem;
		border: none;
		background: var(--surface);
		color: var(--fg);
		font-size: 0.9rem;
		outline: none;
		font-family: inherit;
	}
	.nav-search-input::placeholder {
		color: var(--placeholder, var(--text-muted));
	}
	.nav-search-go {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.6rem;
		min-height: var(--tap, 36px);
		background: var(--surface);
		border: none;
		border-left: 1px solid var(--border);
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--text-muted, var(--muted));
		transition: background 0.15s, color 0.15s;
	}
	.nav-search-go:hover {
		background: var(--panel);
		color: var(--accent);
	}

	/* ── Mobile ─────────────────────────────── */
	.header-left {
		display: contents;
	}
	.mobile-toggle {
		display: none;
		flex-direction: column;
		gap: 4px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
	}
	.mobile-toggle span {
		display: block;
		width: 20px;
		height: 2px;
		background: var(--fg);
		transition: 0.2s;
	}
	@media (max-width: 768px) {
		.header-left {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			width: 100%;
			justify-content: space-between;
		}
		.mobile-toggle { display: flex; }
		.nav {
			display: none;
			flex-direction: column;
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			background: var(--surface);
			border-bottom: 1px solid var(--border);
			padding: 1rem;
			z-index: 100;
			gap: 0.75rem;
		}
		.nav--open { display: flex; }
		.nav-links { flex-direction: column; }
		.nav-search-wrap { order: -1; }
		.nav-search-input { width: 100% !important; }
		.nav-search-bar { width: 100%; }
		.nav-user { justify-content: flex-end; }
	}

	/* ── Admin toggle button (next to CRC) ── */
	.admin-toggle {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap, 36px);
		padding: 0.35rem 0.65rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm, 6px);
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 600;
		font-family: inherit;
		color: var(--fg);
		line-height: 1;
		transition: border-color 0.15s, background 0.15s;
	}
	.admin-toggle:hover {
		border-color: var(--accent);
		background: var(--surface);
		color: var(--accent);
	}

	/* ── Admin panel (left slide) ──────────── */
	/* ── Admin panel (left slide via Sheet) ──────── */
	:global(.admin-panel) {
		width: 280px;
	}
	.admin-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.admin-panel__title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 0.95rem;
	}
	.admin-panel__role-badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 10px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: rgba(99, 102, 241, 0.15);
		color: var(--accent);
	}
	.admin-panel__nav {
		flex: 1;
		min-height: 0;
	}
	:global(.admin-panel__scroll) { height: 100%; }
	:global(.admin-panel__scroll .ui-scroll-area__viewport) { padding: 0.75rem 0; }
	.admin-panel__item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1.25rem;
		color: var(--fg);
		text-decoration: none;
		font-size: 0.9rem;
		transition: background 0.1s;
	}
	.admin-panel__item:hover { background: var(--surface); }
	.admin-panel__item.is-active {
		background: var(--surface);
		color: var(--accent);
		font-weight: 600;
	}
	.admin-panel__icon {
		font-size: 1rem;
		width: 1.5rem;
		text-align: center;
		flex-shrink: 0;
	}
	.admin-panel__text { flex: 1; }
	.admin-panel__badge {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.1rem 0.5rem;
		border-radius: 10px;
		min-width: 1.25rem;
		text-align: center;
	}
	:global(.admin-panel__divider) {
		margin: 0.5rem 1.25rem;
	}
	.admin-panel__section-title {
		padding: 0.25rem 1.25rem 0.35rem;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.admin-panel__footer {
		padding: 0.75rem 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		gap: 1rem;
		font-size: 0.8rem;
	}
	.admin-panel__footer a {
		color: var(--muted);
		text-decoration: none;
	}
	.admin-panel__footer a:hover { color: var(--accent); }

	/* ── Profile panel (right slide via Sheet) ──────── */
	:global(.profile-panel) {
		width: 300px;
	}
	.profile-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.profile-panel__user {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}
	.profile-panel__avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid var(--border);
		flex-shrink: 0;
	}
	.profile-panel__info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.profile-panel__name {
		font-weight: 600;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.profile-panel__role {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.profile-panel__nav {
		flex: 1;
		min-height: 0;
	}
	:global(.profile-panel__scroll) { height: 100%; }
	:global(.profile-panel__scroll .ui-scroll-area__viewport) { padding: 0.75rem 0; }
	.profile-panel__item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1.25rem;
		color: var(--fg);
		text-decoration: none;
		font-size: 0.9rem;
		transition: background 0.1s;
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
	}
	.profile-panel__item:hover { background: var(--surface); }
	.profile-panel__item--signout { color: #ef4444; }
	.profile-panel__item--signout:hover { background: rgba(239, 68, 68, 0.06); }
	.profile-panel__item--report { color: #eab308; }
	.profile-panel__item--report:hover { background: rgba(234, 179, 8, 0.06); }
	.profile-panel__icon {
		font-size: 1rem;
		width: 1.5rem;
		text-align: center;
		flex-shrink: 0;
	}
	.profile-panel__text { flex: 1; }
	.profile-panel__badge {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.1rem 0.5rem;
		border-radius: 10px;
		min-width: 1.25rem;
		text-align: center;
	}
	:global(.profile-panel__divider) {
		margin: 0.5rem 1.25rem;
	}
	.profile-panel__section-title {
		padding: 0.25rem 1.25rem 0.35rem;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
</style>
