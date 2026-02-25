<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { session, isLoading } from '$stores/auth';
	import { debugRole, realRole as realRoleStore } from '$stores/debug';
	import { checkAdminRole } from '$lib/admin';
	import { canAccessRoute, realRoleToDebugId } from '$lib/permissions';
	import type { DebugRoleId } from '$stores/debug';

	let { children } = $props();

	let localRealRole = $state<DebugRoleId>('user');
	let checking = $state(true);

	// The effective role: debug role if active, otherwise real role
	let effectiveRole = $derived($debugRole ?? localRealRole);
	let hasAccess = $derived(canAccessRoute(effectiveRole, $page.url.pathname));
	let isDebugBlocked = $derived($debugRole !== null && !hasAccess);

	onMount(() => {
		const unsub = isLoading.subscribe(async (loading) => {
			if (!loading) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) {
					checking = false;
					return;
				}
				const role = await checkAdminRole();
				realRole = realRoleToDebugId(role);
				checking = false;
			}
		});
		return unsub;
	});

	const ROLE_LABELS: Record<string, string> = {
		super_admin: '⭐ Super Admin',
		admin: '🛡️ Admin',
		moderator: '🔰 Moderator',
		verifier: '✅ Verifier',
		user: '👤 User',
		non_user: '🚫 Non-User',
	};
</script>

{#if checking}
	{@render children()}
{:else if isDebugBlocked}
	<!-- Debug mode is active and this role can't see this page -->
	<div class="page-width">
		<div class="access-blocked">
			<div class="access-blocked__icon">🔒</div>
			<h1>Access Denied</h1>
			<p class="muted">
				The <strong>{ROLE_LABELS[$debugRole ?? ''] ?? $debugRole}</strong> role does not have
				access to this page.
			</p>
			<p class="muted" style="font-size: 0.85rem; margin-top: 0.5rem;">
				Use the <strong>Exit Debug</strong> button in the debug bar above to return to your real role,
				or switch to a different role from the debug bar's <strong>Navigate</strong> menu.
			</p>
			<div class="access-blocked__actions">
				<a href="/" class="btn btn--outline">🏠 Home</a>
				<a href="/admin" class="btn btn--outline">← Dashboard</a>
			</div>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.access-blocked {
		text-align: center;
		padding: 5rem 1rem;
		max-width: 480px;
		margin: 0 auto;
	}
	.access-blocked__icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}
	.access-blocked h1 {
		margin: 0 0 0.75rem;
		font-size: 1.5rem;
	}
	.access-blocked__actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}
	.btn--outline {
		display: inline-block;
		padding: 0.5rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--fg);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.btn--outline:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
</style>
