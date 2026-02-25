<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { session, user } from '$stores/auth';
	import { debugRole, debugHidesAuth, debugHidesAdmin } from '$stores/debug';
	import { toggleTheme, theme } from '$stores/theme';
	import { supabase, signOut as doSignOut } from '$lib/supabase';
	import { fetchPending } from '$lib/admin';

	let moreOpen = $state(false);
	let userMenuOpen = $state(false);
	let mobileOpen = $state(false);
	let searchQuery = $state('');
	let adminPanelOpen = $state(false);
	let adminCounts = $state<Record<string, number>>({});

	// ─── Profile info (fetched client-side when signed in) ────
	let profileInfo = $state<{
		runner_id: string | null;
		profileState: 'active' | 'pending' | 'none';
		is_admin: boolean;
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
					.select('runner_id, is_admin, is_super_admin, status')
					.eq('user_id', currentUser.id)
					.maybeSingle();

				if (profile?.runner_id && profile.status === 'approved') {
					const { data: verifierRole } = await supabase
						.from('role_game_verifiers')
						.select('id')
						.eq('user_id', currentUser.id)
						.limit(1)
						.maybeSingle();

					profileInfo = {
						runner_id: profile.runner_id,
						profileState: 'active',
						is_admin: profile.is_admin === true || profile.is_super_admin === true,
						is_verifier: !!verifierRole
					};
				} else if (profile?.runner_id) {
					profileInfo = {
						runner_id: profile.runner_id,
						profileState: 'pending',
						is_admin: false,
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
			return { href: '/profile/create', icon: '➕', label: 'Create Profile' };
		}
		if (profileInfo.profileState === 'active' && profileInfo.runner_id) {
			return { href: `/runners/${profileInfo.runner_id}`, icon: '👤', label: 'My Profile' };
		}
		if (profileInfo.profileState === 'pending') {
			return { href: '/profile/status', icon: '⏳', label: 'Profile Status' };
		}
		return { href: '/profile/create', icon: '➕', label: 'Create Profile' };
	});

	let roleLabel = $derived.by(() => {
		if (!profileInfo || profileInfo.profileState === 'none') return 'No Profile';
		if (profileInfo.is_admin) return 'Admin';
		if (profileInfo.is_verifier) return 'Verifier';
		if (profileInfo.profileState === 'pending') return '⏳ Pending';
		return 'Runner';
	});

	let showAdminLink = $derived(
		(profileInfo?.is_admin || profileInfo?.is_verifier) && !$debugHidesAdmin
	);

	let isSuperAdmin = $derived(profileInfo?.is_admin === true && !$debugHidesAdmin);

	// Debug: should we show the signed-in UI or the sign-in link?
	let showAsSignedIn = $derived($session && !$debugHidesAuth);

	// Load admin counts when profile reveals admin/verifier
	$effect(() => {
		if (showAdminLink) {
			loadAdminCounts();
		}
	});

	async function loadAdminCounts() {
		try {
			const [profiles, games, runs] = await Promise.all([
				fetchPending('pending_profiles'),
				fetchPending('pending_games'),
				fetchPending('pending_runs')
			]);
			adminCounts = {
				pendingProfiles: profiles.length,
				pendingGames: games.length,
				pendingRuns: runs.length
			};
		} catch { /* ignore */ }
	}

	function isAdminActive(path: string): boolean {
		const current = $page.url.pathname;
		if (path === '/admin' || path === '/admin/') {
			return current === '/admin' || current === '/admin/';
		}
		return current.startsWith(path);
	}

	function isActive(path: string): boolean {
		return $page.url.pathname.startsWith(path);
	}

	async function signOut() {
		userMenuOpen = false;
		await doSignOut();
	}

	function closeMenus() {
		moreOpen = false;
		userMenuOpen = false;
	}

	function closeAdminPanel() {
		adminPanelOpen = false;
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && searchQuery.trim()) {
			goto(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
			(e.target as HTMLInputElement)?.blur();
		}
	}

	function handleSearchSubmit() {
		if (searchQuery.trim()) {
			goto(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
		}
	}
</script>

<svelte:window onclick={closeMenus} />

<header class="site-header">
	<div class="header-left">
		<a class="brand" href="/" title="Go to Home">CRC</a>

		{#if showAdminLink}
			<button
				type="button"
				class="admin-toggle"
				onclick={(e) => { e.stopPropagation(); adminPanelOpen = !adminPanelOpen; }}
				aria-label="Toggle admin panel"
				title="Admin Panel"
			>
				🛡️
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
			<a href="/games" class:active={isActive('/games')}>Games</a>
			<a href="/runners" class:active={isActive('/runners')}>Runners</a>
			<a href="/teams" class:active={isActive('/teams')}>Teams</a>
			<a href="/submit" class:active={isActive('/submit')}>Submit</a>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="nav-dropdown" onclick={(e) => { e.stopPropagation(); moreOpen = !moreOpen; }}>
				<button type="button" class="nav-dropdown__toggle" aria-expanded={moreOpen}>
					More <span class="nav-dropdown__caret">▾</span>
				</button>
				{#if moreOpen}
					<div class="nav-dropdown__menu">
						<a href="/news" class="nav-dropdown__item">📰 News</a>
						<a href="/rules" class="nav-dropdown__item">📜 Rules</a>
						<a href="/glossary" class="nav-dropdown__item">📖 Glossary</a>
						<a href="/guidelines" class="nav-dropdown__item">📋 Guidelines</a>
						<a href="/support" class="nav-dropdown__item">💬 Support</a>
						<hr class="nav-dropdown__divider" />
						<a href="/feed.xml" class="nav-dropdown__item">📡 RSS Feed</a>
					</div>
				{/if}
			</div>
		</div>

		<!-- Center: Search -->
		<div class="nav-search-wrap">
			<div class="nav-search-bar">
				<input
					type="search"
					class="nav-search-input"
					placeholder="Search games, runners..."
					bind:value={searchQuery}
					onkeydown={handleSearchKeydown}
				/>
				<button
					type="button"
					class="nav-search-go"
					onclick={handleSearchSubmit}
					aria-label="Search"
					title="Search"
				>🔍</button>
			</div>
		</div>

		<!-- Right: User -->
		<div class="nav-group nav-user">
			{#if showAsSignedIn}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="nav-user__wrap" onclick={(e) => { e.stopPropagation(); userMenuOpen = !userMenuOpen; }}>
					<button type="button" class="nav-user__avatar-btn" aria-label="Account menu">
						<img
							class="nav-user__avatar"
							src={$user?.user_metadata?.avatar_url || '/img/site/default-runner.png'}
							alt=""
						/>
						{#if showAdminLink}
							<span class="nav-user__admin-indicator"></span>
						{/if}
					</button>
					{#if userMenuOpen}
						<div class="nav-user__menu">
							<div class="nav-user__menu-header">
								<img
									class="nav-user__menu-avatar"
									src={$user?.user_metadata?.avatar_url || '/img/site/default-runner.png'}
									alt=""
								/>
								<div class="nav-user__menu-info">
									<span class="nav-user__menu-name">
										{$user?.user_metadata?.full_name || $user?.email || 'User'}
									</span>
									{#if profileLoaded}
										<span class="nav-user__menu-status">{roleLabel}</span>
									{/if}
								</div>
							</div>
							<div class="nav-user__menu-items">
								<a href={profileLink.href} class="nav-user__menu-item">
									{profileLink.icon} {profileLink.label}
								</a>
								{#if profileInfo?.profileState === 'active'}
									<a href="/profile/edit" class="nav-user__menu-item">✏️ Edit Profile</a>
								{/if}
								<a href="/profile/theme" class="nav-user__menu-item">🎨 Theme</a>
								<a href="/profile/settings" class="nav-user__menu-item">⚙️ Settings</a>
								<hr class="nav-user__menu-divider" />
								<button
									type="button"
									class="nav-user__menu-item"
									onclick={(e) => { e.stopPropagation(); toggleTheme(); }}
								>
									{$theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
								</button>
								<hr class="nav-user__menu-divider" />
								<button type="button" class="nav-user__menu-item nav-user__menu-item--signout" onclick={signOut}>
									🚪 Sign Out
								</button>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<button
					type="button"
					class="theme-toggle"
					onclick={toggleTheme}
					title="Toggle theme"
					aria-label="Toggle theme"
				>
					{$theme === 'dark' ? '☀️' : '🌙'}
				</button>
				<a href="/sign-in" class="nav-user__signin">Login</a>
			{/if}
		</div>
	</nav>
</header>

<!-- Admin Panel (slides from left) -->
{#if showAdminLink && adminPanelOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="admin-backdrop" onclick={closeAdminPanel}></div>
	<aside class="admin-panel">
		<div class="admin-panel__header">
			<span class="admin-panel__title">
				<span class="admin-panel__role-badge">
					{isSuperAdmin ? 'Super Admin' : profileInfo?.is_admin ? 'Admin' : 'Verifier'}
				</span>
				Moderation
			</span>
			<button type="button" class="admin-panel__close" onclick={closeAdminPanel}>&times;</button>
		</div>

		<nav class="admin-panel__nav">
			<a href="/admin" class="admin-panel__item" class:is-active={isAdminActive('/admin')} onclick={closeAdminPanel}>
				<span class="admin-panel__icon">📊</span>
				<span class="admin-panel__text">Dashboard</span>
			</a>

			{#if isSuperAdmin}
				<hr class="admin-panel__divider" />
				<div class="admin-panel__section-title">Super Admin</div>
				<a href="/admin/health" class="admin-panel__item" class:is-active={isAdminActive('/admin/health')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">💚</span><span class="admin-panel__text">Site Health</span>
				</a>
				<a href="/admin/financials" class="admin-panel__item" class:is-active={isAdminActive('/admin/financials')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">💰</span><span class="admin-panel__text">Financials</span>
				</a>
				<a href="/admin/users" class="admin-panel__item" class:is-active={isAdminActive('/admin/users')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">👤</span><span class="admin-panel__text">Users</span>
				</a>
				<a href="/admin/debug" class="admin-panel__item" class:is-active={isAdminActive('/admin/debug')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">🔧</span><span class="admin-panel__text">Debug Tools</span>
				</a>
			{/if}

			{#if profileInfo?.is_admin}
				<hr class="admin-panel__divider" />
				<div class="admin-panel__section-title">Admin</div>
				<a href="/admin/profiles" class="admin-panel__item" class:is-active={isAdminActive('/admin/profiles')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">👥</span>
					<span class="admin-panel__text">Pending Profiles</span>
					{#if adminCounts.pendingProfiles > 0}<span class="admin-panel__badge">{adminCounts.pendingProfiles}</span>{/if}
				</a>
				<a href="/admin/games" class="admin-panel__item" class:is-active={isAdminActive('/admin/games')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">🎮</span>
					<span class="admin-panel__text">Pending Games</span>
					{#if adminCounts.pendingGames > 0}<span class="admin-panel__badge">{adminCounts.pendingGames}</span>{/if}
				</a>
				<a href="/admin/runs" class="admin-panel__item" class:is-active={isAdminActive('/admin/runs')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">🏃</span>
					<span class="admin-panel__text">Pending Runs</span>
					{#if adminCounts.pendingRuns > 0}<span class="admin-panel__badge">{adminCounts.pendingRuns}</span>{/if}
				</a>
				<a href="/admin/staff-guides" class="admin-panel__item" class:is-active={isAdminActive('/admin/staff-guides')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">📖</span><span class="admin-panel__text">Staff Guides</span>
				</a>
			{/if}

			{#if profileInfo?.is_verifier}
				<hr class="admin-panel__divider" />
				<div class="admin-panel__section-title">Verifier</div>
				<a href="/admin/game-updates" class="admin-panel__item" class:is-active={isAdminActive('/admin/game-updates')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">📝</span><span class="admin-panel__text">Game Updates</span>
				</a>
				<a href="/admin/runs-queue" class="admin-panel__item" class:is-active={isAdminActive('/admin/runs-queue')} onclick={closeAdminPanel}>
					<span class="admin-panel__icon">✅</span><span class="admin-panel__text">Runs in Queue</span>
				</a>
			{/if}
		</nav>

		<div class="admin-panel__footer">
			<a href="/legal/privacy">Privacy</a>
			<a href="/legal/terms">Terms</a>
		</div>
	</aside>
{/if}

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
	.nav-user__wrap {
		position: relative;
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
		background: none;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.25rem 0.4rem;
		cursor: pointer;
		font-size: 2rem;
		line-height: 1;
		transition: border-color 0.15s, background 0.15s;
	}
	.admin-toggle:hover {
		border-color: var(--accent);
		background: var(--surface);
	}

	/* ── Admin panel (left slide) ──────────── */
	.admin-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.5);
	}
	.admin-panel {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 1001;
		width: 280px;
		max-width: 85vw;
		background: var(--bg);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		animation: adminSlideIn 0.2s ease-out;
	}
	@keyframes adminSlideIn {
		from { transform: translateX(-100%); }
		to { transform: translateX(0); }
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
	.admin-panel__close {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--muted);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
	}
	.admin-panel__close:hover { color: var(--fg); }
	.admin-panel__nav {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem 0;
	}
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
	.admin-panel__divider {
		border: none;
		border-top: 1px solid var(--border);
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
</style>
