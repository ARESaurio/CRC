<script lang="ts">
	import { Lock, Home, Shield, ShieldCheck, CheckCircle, User, Ban, ArrowLeft} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { session, isLoading } from '$stores/auth';
	import { debugRole, realRole as realRoleStore } from '$stores/debug';
	import { checkAdminRole } from '$lib/admin';
	import { canAccessRoute, realRoleToDebugId } from '$lib/permissions';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
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
				localRealRole = realRoleToDebugId(role);
				realRoleStore.set(localRealRole);
				checking = false;
			}
		});
		return unsub;
	});

	const ROLE_LABELS: Record<string, string> = {
		super_admin: '⭐ Super Admin',
		admin: 'Admin',
		moderator: 'Moderator',
		verifier: 'Verifier',
		user: 'User',
		non_user: 'Non-User',
	};
</script>

{#if checking}
	<div class="admin-loading">
		<div class="spinner"></div>
	</div>
{:else if isDebugBlocked}
	<!-- Debug mode is active and this role can't see this page -->
	<div class="page-width">
		<div class="access-blocked">
			<div class="access-blocked__icon"><Lock size={40} /></div>
			<h2>{m.admin_access_denied()}</h2>
			<p class="muted">
				{m.admin_access_denied_role({ role: ROLE_LABELS[$debugRole ?? ''] ?? $debugRole ?? '' })}
			</p>
			<p class="muted" style="font-size: 0.85rem; margin-top: 0.5rem;">
				{m.admin_access_denied_hint()}
			</p>
			<div class="access-blocked__actions">
				<a href={localizeHref('/')} class="btn btn--outline"><Home size={14} /> {m.error_go_home()}</a>
				<a href={localizeHref('/admin')} class="btn btn--outline"><ArrowLeft size={14} /> {m.admin_dashboard()}</a>
			</div>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.admin-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
	}
	.admin-loading .spinner {
		width: 36px;
		height: 36px;
		border: 3px solid var(--border, #333);
		border-top-color: var(--accent, #7c5cff);
		border-radius: 50%;
		animation: admin-spin 0.7s linear infinite;
	}
	@keyframes admin-spin { to { transform: rotate(360deg); } }
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
	.access-blocked h2 {
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
</style>
