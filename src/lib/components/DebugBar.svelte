<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let debugRole = $state<string | null>(null);
	let navOpen = $state(false);
	let mounted = $state(false);

	const ROLE_META: Record<string, { icon: string; label: string; color: string }> = {
		non_user:    { icon: '🚫', label: 'Non-User (Logged Out)',  color: '#6b7280' },
		user:        { icon: '👤', label: 'User',                   color: '#3b82f6' },
		verifier:    { icon: '✅', label: 'Verifier',               color: '#10b981' },
		moderator:   { icon: '🛡️', label: 'Moderator',             color: '#8b5cf6' },
		admin:       { icon: '🛡️', label: 'Admin',                  color: '#f59e0b' },
		super_admin: { icon: '⭐', label: 'Super Admin',            color: '#ef4444' },
	};

	// Site pages organized by what perspective they represent
	const NAV_GROUPS = [
		{
			label: '🌐 Public Pages',
			desc: 'What anyone (including non-users) can see',
			links: [
				{ href: '/',            label: 'Home' },
				{ href: '/games',       label: 'Games Listing' },
				{ href: '/runners',     label: 'Runners Listing' },
				{ href: '/teams',       label: 'Teams' },
				{ href: '/glossary',    label: 'Glossary' },
				{ href: '/rules',       label: 'Rules' },
				{ href: '/guidelines',  label: 'Guidelines' },
				{ href: '/news',        label: 'News' },
				{ href: '/search',      label: 'Search' },
			]
		},
		{
			label: '🔑 Auth Flow',
			desc: 'Sign in / sign up experience',
			links: [
				{ href: '/sign-in',        label: 'Sign In' },
				{ href: '/profile/setup',  label: 'Profile Setup (Runner ID)' },
				{ href: '/profile/create', label: 'Profile Creation' },
			]
		},
		{
			label: '👤 User Pages',
			desc: 'Authenticated user experience',
			links: [
				{ href: '/profile',          label: 'My Profile (Hub)' },
				{ href: '/profile/edit',     label: 'Edit Profile' },
				{ href: '/profile/theme',    label: 'Theme Editor' },
				{ href: '/profile/settings', label: 'Settings' },
				{ href: '/profile/status',   label: 'Profile Status' },
				{ href: '/submit',           label: 'Submit Run' },
				{ href: '/submit-game',      label: 'Submit Game' },
			]
		},
		{
			label: '🛡️ Staff Pages',
			desc: 'Admin / Verifier dashboard',
			links: [
				{ href: '/admin',             label: 'Dashboard' },
				{ href: '/admin/runs-queue',  label: 'Runs Queue' },
				{ href: '/admin/runs',        label: 'Approved Runs' },
				{ href: '/admin/profiles',    label: 'Pending Profiles' },
				{ href: '/admin/games',       label: 'Pending Games' },
				{ href: '/admin/game-updates',label: 'Game Updates' },
				{ href: '/admin/users',       label: 'Users' },
				{ href: '/admin/financials',  label: 'Financials' },
				{ href: '/admin/health',      label: 'Site Health' },
				{ href: '/admin/staff-guides',label: 'Staff Guides' },
				{ href: '/admin/debug',       label: 'Debug Tools' },
			]
		},
		{
			label: '📜 Legal',
			desc: 'Terms, privacy, cookies',
			links: [
				{ href: '/legal/terms',   label: 'Terms of Service' },
				{ href: '/legal/privacy', label: 'Privacy Policy' },
				{ href: '/legal/cookies', label: 'Cookie Policy' },
				{ href: '/support',       label: 'Support' },
			]
		},
	];

	onMount(() => {
		debugRole = sessionStorage.getItem('crc_debug_role');
		mounted = true;

		// Listen for changes from the debug page
		const handler = () => {
			debugRole = sessionStorage.getItem('crc_debug_role');
		};
		window.addEventListener('storage', handler);

		// Also poll (sessionStorage doesn't fire events in same tab)
		const interval = setInterval(() => {
			const current = sessionStorage.getItem('crc_debug_role');
			if (current !== debugRole) debugRole = current;
		}, 500);

		return () => {
			window.removeEventListener('storage', handler);
			clearInterval(interval);
		};
	});

	function exitDebug() {
		sessionStorage.removeItem('crc_debug_role');
		debugRole = null;
		navOpen = false;
	}

	// Close nav when navigating
	$effect(() => {
		$page.url.pathname; // subscribe to route changes
		navOpen = false;
	});

	const roleMeta = $derived(debugRole ? ROLE_META[debugRole] || ROLE_META.user : null);
	const currentPath = $derived($page.url.pathname);

	// Block form submissions in debug mode
	function handleClick(e: MouseEvent) {
		if (!debugRole) return;
		const target = e.target as HTMLElement;
		// Block submit buttons and form submissions
		const button = target.closest('button[type="submit"], button.btn--primary, input[type="submit"]');
		if (button && !button.closest('.debug-bar')) {
			// Allow navigation links, block action buttons
			const isNav = target.closest('a');
			if (!isNav) {
				e.preventDefault();
				e.stopPropagation();
				showBlockedToast();
			}
		}
	}

	function handleSubmit(e: Event) {
		if (!debugRole) return;
		const form = e.target as HTMLFormElement;
		if (!form.closest('.debug-bar')) {
			e.preventDefault();
			e.stopPropagation();
			showBlockedToast();
		}
	}

	let toastVisible = $state(false);
	let toastTimeout: ReturnType<typeof setTimeout> | null = null;

	function showBlockedToast() {
		toastVisible = true;
		if (toastTimeout) clearTimeout(toastTimeout);
		toastTimeout = setTimeout(() => { toastVisible = false; }, 2500);
	}
</script>

<svelte:document onclick={handleClick} onsubmit={handleSubmit} />

{#if mounted && debugRole && roleMeta}
	<div class="debug-bar" style="--db-color: {roleMeta.color}">
		<div class="debug-bar__inner">
			<div class="debug-bar__left">
				<span class="debug-bar__dot"></span>
				<span class="debug-bar__role">{roleMeta.icon} {roleMeta.label}</span>
				<span class="debug-bar__badge">DEBUG MODE</span>
				<span class="debug-bar__blocked">Submissions Disabled</span>
			</div>
			<div class="debug-bar__right">
				<button class="debug-bar__nav-btn" onclick={() => navOpen = !navOpen}>
					{navOpen ? '✕ Close' : '🗺️ Navigate'}
				</button>
				<button class="debug-bar__exit" onclick={exitDebug}>Exit Debug</button>
			</div>
		</div>

		{#if navOpen}
			<div class="debug-nav">
				<div class="debug-nav__grid">
					{#each NAV_GROUPS as group}
						<div class="debug-nav__group">
							<div class="debug-nav__group-header">
								<span class="debug-nav__group-label">{group.label}</span>
								<span class="debug-nav__group-desc">{group.desc}</span>
							</div>
							<div class="debug-nav__links">
								{#each group.links as link}
									<a
										href={link.href}
										class="debug-nav__link"
										class:debug-nav__link--active={currentPath === link.href}
									>
										{link.label}
										{#if currentPath === link.href}<span class="debug-nav__here">← here</span>{/if}
									</a>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if toastVisible}
		<div class="debug-toast">
			🚫 Submissions are disabled in debug mode
		</div>
	{/if}
{/if}

<style>
	.debug-bar {
		position: sticky; top: 0; z-index: 9999;
		background: rgba(0, 0, 0, 0.95);
		border-bottom: 2px solid var(--db-color);
		font-size: 0.8rem;
	}
	.debug-bar__inner {
		display: flex; align-items: center; justify-content: space-between;
		padding: 0.4rem 1rem; gap: 0.75rem; flex-wrap: wrap;
		max-width: 1200px; margin: 0 auto;
	}
	.debug-bar__left { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
	.debug-bar__right { display: flex; align-items: center; gap: 0.5rem; }

	.debug-bar__dot {
		width: 8px; height: 8px; border-radius: 50%;
		background: var(--db-color);
		box-shadow: 0 0 6px var(--db-color);
		animation: debug-pulse 2s infinite;
	}
	@keyframes debug-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.debug-bar__role { font-weight: 600; color: var(--db-color); }
	.debug-bar__badge {
		font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em;
		padding: 0.15rem 0.4rem; border-radius: 3px;
		background: var(--db-color); color: #000;
	}
	.debug-bar__blocked {
		font-size: 0.7rem; color: #ef4444; opacity: 0.8;
	}

	.debug-bar__nav-btn, .debug-bar__exit {
		padding: 0.25rem 0.6rem; border-radius: 4px; border: 1px solid;
		font-size: 0.75rem; font-weight: 600; cursor: pointer;
		font-family: inherit;
	}
	.debug-bar__nav-btn {
		background: transparent; border-color: var(--db-color); color: var(--db-color);
	}
	.debug-bar__nav-btn:hover { background: rgba(255,255,255,0.05); }
	.debug-bar__exit {
		background: transparent; border-color: #ef4444; color: #ef4444;
	}
	.debug-bar__exit:hover { background: rgba(239, 68, 68, 0.1); }

	/* Navigation panel */
	.debug-nav {
		border-top: 1px solid rgba(255,255,255,0.1);
		padding: 1rem;
		max-height: 70vh; overflow-y: auto;
	}
	.debug-nav__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem; max-width: 1200px; margin: 0 auto;
	}
	.debug-nav__group {
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 8px; overflow: hidden;
	}
	.debug-nav__group-header { padding: 0.6rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
	.debug-nav__group-label { font-weight: 600; font-size: 0.8rem; color: #fff; display: block; }
	.debug-nav__group-desc { font-size: 0.65rem; color: rgba(255,255,255,0.4); display: block; margin-top: 0.1rem; }

	.debug-nav__links { display: flex; flex-direction: column; padding: 0.35rem; }
	.debug-nav__link {
		display: block; padding: 0.35rem 0.6rem; border-radius: 4px;
		color: rgba(255,255,255,0.7); text-decoration: none; font-size: 0.78rem;
		transition: background 0.1s;
	}
	.debug-nav__link:hover { background: rgba(255,255,255,0.08); color: #fff; }
	.debug-nav__link--active { background: rgba(255,255,255,0.1); color: var(--db-color); font-weight: 600; }
	.debug-nav__here { font-size: 0.6rem; color: var(--db-color); opacity: 0.7; }

	/* Toast */
	.debug-toast {
		position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
		z-index: 10000;
		background: rgba(239, 68, 68, 0.95); color: #fff;
		padding: 0.6rem 1.25rem; border-radius: 8px;
		font-size: 0.85rem; font-weight: 600;
		box-shadow: 0 4px 20px rgba(0,0,0,0.4);
		animation: debug-toast-in 0.2s ease-out;
	}
	@keyframes debug-toast-in {
		from { opacity: 0; transform: translateX(-50%) translateY(10px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	@media (max-width: 600px) {
		.debug-bar__blocked { display: none; }
		.debug-nav__grid { grid-template-columns: 1fr; }
	}
</style>
