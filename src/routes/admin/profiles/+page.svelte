<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading, user } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, Pencil, Search, Tv, Youtube, MessageSquare, Twitter, Bird, Camera, Timer, Gamepad2, ExternalLink } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import StatusFilterTabs from '$lib/components/StatusFilterTabs.svelte';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(false);
	let processingId = $state<string | null>(null);
	let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	type ProfileStatus = 'pending' | 'published' | 'needs_changes' | 'active' | 'rejected' | 'all';
	let profiles = $state<any[]>([]);
	let statusFilter = $state<ProfileStatus>('pending');
	let expandedId = $state<string | null>(null);
	let profileFilter = $state<'all' | 'yes' | 'no'>('all');
	let dateFrom = $state('');
	let dateTo = $state('');
	let pageSize = $state(10);
	let currentPage = $state(1);

	// Active profiles (from live profiles table)
	let activeProfiles = $state<any[]>([]);
	// Users without a profile (signed up but no profile yet)
	let usersWithoutProfile = $state<any[]>([]);
	// ── Modals ────────────────────────────────────────────────────────────────
	let rejectModalOpen = $state(false);
	let changesModalOpen = $state(false);
	let modalId = $state<string | null>(null);
	let modalInfo = $state('');
	let rejectReason = $state('');
	let rejectNotes = $state('');
	let changesNotes = $state('');

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => Promise<void>) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => Promise<void>) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	async function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) await confirmCallback();
		confirmCallback = null;
	}

	// ── Pending Other Links ───────────────────────────────────────────────────
	let pendingLinksProfiles = $state<any[]>([]);
	let pendingLinksLoading = $state(false);
	let linkProcessing = $state<string | null>(null);

	let pendingLinksCount = $derived(pendingLinksProfiles.length);

	const SOCIAL_ICONS: Record<string, any> = {
		twitch: Tv, youtube: Youtube, discord: MessageSquare, twitter: Twitter,
		bluesky: Bird, instagram: Camera, speedruncom: Timer, steam: Gamepad2
	};

	let filteredProfiles = $derived.by(() => {
		if (statusFilter === 'active' || statusFilter === 'published') return []; // Rendered from separate data
		let result = profiles;
		if (statusFilter !== 'all') result = result.filter(p => p.status === statusFilter);
		if (profileFilter === 'yes') result = result.filter(p => p.has_profile === true);
		if (profileFilter === 'no') result = result.filter(p => !p.has_profile);
		if (dateFrom) result = result.filter(p => p.created_at >= dateFrom);
		if (dateTo) result = result.filter(p => p.created_at <= dateTo + 'T23:59:59');
		return result;
	});

	let pendingCount = $derived(profiles.filter(p => p.status === 'pending').length);
	let publishedCount = $derived(usersWithoutProfile.length);
	let changesCount = $derived(profiles.filter(p => p.status === 'needs_changes').length);
	let activeCount = $derived(activeProfiles.length);
	let rejectedCount = $derived(profiles.filter(p => p.status === 'rejected').length);
	let allCount = $derived(activeProfiles.length + usersWithoutProfile.length);

	let profileTabs = $derived([
		{ value: 'pending', label: 'Pending', count: pendingCount },
		{ value: 'published', label: 'Published', count: publishedCount },
		{ value: 'needs_changes', label: 'Needs Changes', count: changesCount },
		{ value: 'active', label: 'Active', count: activeCount },
		{ value: 'rejected', label: 'Rejected', count: rejectedCount },
		{ value: 'all', label: 'All', count: allCount },
	]);

	let currentTabItems = $derived.by(() => {
		if (statusFilter === 'published') return usersWithoutProfile;
		if (statusFilter === 'active') return activeProfiles;
		return filteredProfiles;
	});
	let paginatedItems = $derived(currentTabItems.slice((currentPage - 1) * pageSize, currentPage * pageSize));

	function formatDate(d: string): string {
		if (!d) return '—';
		const dt = new Date(d);
		const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
		if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
		if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
		return dt.toLocaleDateString();
	}

	async function loadProfiles() {
		loading = true;
		try {
			const token = (await supabase.auth.getSession()).data.session?.access_token;
			if (!token) { profiles = []; loading = false; return; }
			const res = await fetch(
				`${PUBLIC_SUPABASE_URL}/rest/v1/pending_profiles?order=submitted_at.desc&limit=200`,
				{ headers: { 'apikey': PUBLIC_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
			);
			if (res.ok) {
				const raw = await res.json();
				// Normalize column names to match template expectations
				profiles = raw.map((p: any) => ({
					...p,
					runner_id: p.requested_runner_id,
					created_at: p.submitted_at,
				}));
			}
		} catch { /* ignore */ }
		loading = false;
	}

	async function loadActiveProfiles() {
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select('id, user_id, runner_id, display_name, avatar_url, created_at')
				.order('created_at', { ascending: false });
			if (!error && data) activeProfiles = data;
		} catch { /* ignore */ }
	}

	async function loadUsersWithoutProfile() {
		try {
			// Get all users from linked_accounts with their display info
			const { data: allUsers, error: e1 } = await supabase
				.from('linked_accounts')
				.select('user_id, provider, provider_username');
			if (e1 || !allUsers) return;

			// Get user_ids that have a profile
			const { data: profileUsers, error: e2 } = await supabase
				.from('profiles')
				.select('user_id');
			if (e2) return;

			const profileUserIds = new Set((profileUsers || []).map((p: any) => p.user_id));

			// Build map: user_id → best display name from linked accounts
			const userMap = new Map<string, { user_id: string; display_name: string }>();
			for (const u of allUsers) {
				if (profileUserIds.has(u.user_id)) continue;
				if (!userMap.has(u.user_id)) {
					userMap.set(u.user_id, { user_id: u.user_id, display_name: u.provider_username || '' });
				} else if (u.provider_username && !userMap.get(u.user_id)!.display_name) {
					userMap.get(u.user_id)!.display_name = u.provider_username;
				}
			}

			usersWithoutProfile = [...userMap.values()];
		} catch { /* ignore */ }
	}

	async function approveProfile(id: string) {
		openConfirm('Approve Profile', 'Approve this profile? It will become publicly visible.', async () => {
			processingId = id;
			const result = await adminAction('/admin/approve-profile', { profile_id: id });
			if (result.ok) {
				profiles = profiles.map(p => p.id === id ? { ...p, status: 'approved' } : p);
				actionMessage = { type: 'success', text: 'Profile approved!' };
			} else { actionMessage = { type: 'error', text: result.message }; }
			processingId = null;
			setTimeout(() => actionMessage = null, 3000);
		});
	}

	function openRejectModal(p: any) {
		modalId = p.id; modalInfo = `${p.display_name || p.runner_id}`;
		rejectReason = ''; rejectNotes = ''; rejectModalOpen = true;
	}

	async function confirmReject() {
		if (!modalId || !rejectReason) return;
		processingId = modalId;
		const result = await adminAction('/admin/reject-profile', { profile_id: modalId, reason: rejectReason, notes: rejectNotes.trim() || undefined });
		if (result.ok) {
			profiles = profiles.map(p => p.id === modalId ? { ...p, status: 'rejected', rejection_reason: rejectReason } : p);
			actionMessage = { type: 'success', text: 'Profile rejected.' };
		} else { actionMessage = { type: 'error', text: result.message }; }
		rejectModalOpen = false; processingId = null; modalId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	function openChangesModal(p: any) {
		modalId = p.id; modalInfo = `${p.display_name || p.runner_id}`;
		changesNotes = ''; changesModalOpen = true;
	}

	async function confirmChanges() {
		if (!modalId || !changesNotes.trim()) return;
		processingId = modalId;
		const result = await adminAction('/admin/request-profile-changes', { profile_id: modalId, notes: changesNotes.trim() });
		if (result.ok) {
			profiles = profiles.map(p => p.id === modalId ? { ...p, status: 'needs_changes' } : p);
			actionMessage = { type: 'success', text: 'Changes requested.' };
		} else { actionMessage = { type: 'error', text: result.message }; }
		changesModalOpen = false; processingId = null; modalId = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	// ── Pending Other Links ───────────────────────────────────────────────────
	async function loadPendingLinks() {
		pendingLinksLoading = true;
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select('id, user_id, runner_id, display_name, avatar_url, socials, other_links_pending')
				.not('other_links_pending', 'is', null)
				.order('updated_at', { ascending: false });
			if (!error && data) {
				// Filter to only profiles where other_links_pending is a non-empty array
				pendingLinksProfiles = data.filter((p: any) =>
					Array.isArray(p.other_links_pending) && p.other_links_pending.length > 0
				);
			}
		} catch { /* ignore */ }
		pendingLinksLoading = false;
	}

	async function approveLink(profileId: string, link: string) {
		linkProcessing = `${profileId}:${link}`;
		try {
			const profile = pendingLinksProfiles.find(p => p.id === profileId);
			if (!profile) throw new Error('Profile not found');

			const currentOther = Array.isArray(profile.socials?.other) ? [...profile.socials.other] : [];
			const currentPending = Array.isArray(profile.other_links_pending) ? [...profile.other_links_pending] : [];

			// Move link from pending to approved
			const newOther = [...currentOther, link];
			const newPending = currentPending.filter((l: string) => l !== link);

			const updatedSocials = { ...profile.socials, other: newOther };

			const { error } = await supabase
				.from('profiles')
				.update({
					socials: updatedSocials,
					other_links_pending: newPending.length > 0 ? newPending : null,
				})
				.eq('id', profileId);

			if (error) throw error;

			// Update local state
			pendingLinksProfiles = pendingLinksProfiles.map(p => {
				if (p.id !== profileId) return p;
				return { ...p, socials: updatedSocials, other_links_pending: newPending.length > 0 ? newPending : null };
			}).filter(p => Array.isArray(p.other_links_pending) && p.other_links_pending.length > 0);

			actionMessage = { type: 'success', text: 'Link approved!' };
		} catch (e: any) {
			actionMessage = { type: 'error', text: `Approve failed: ${e.message}` };
		}
		linkProcessing = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	async function rejectLink(profileId: string, link: string) {
		linkProcessing = `${profileId}:${link}`;
		try {
			const profile = pendingLinksProfiles.find(p => p.id === profileId);
			if (!profile) throw new Error('Profile not found');

			const currentPending = Array.isArray(profile.other_links_pending) ? [...profile.other_links_pending] : [];
			const newPending = currentPending.filter((l: string) => l !== link);

			const { error } = await supabase
				.from('profiles')
				.update({
					other_links_pending: newPending.length > 0 ? newPending : null,
				})
				.eq('id', profileId);

			if (error) throw error;

			pendingLinksProfiles = pendingLinksProfiles.map(p => {
				if (p.id !== profileId) return p;
				return { ...p, other_links_pending: newPending.length > 0 ? newPending : null };
			}).filter(p => Array.isArray(p.other_links_pending) && p.other_links_pending.length > 0);

			actionMessage = { type: 'success', text: 'Link rejected.' };
		} catch (e: any) {
			actionMessage = { type: 'error', text: `Reject failed: ${e.message}` };
		}
		linkProcessing = null;
		setTimeout(() => actionMessage = null, 3000);
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/profiles'); return; }
				const role = await checkAdminRole();
				authorized = !!(role?.admin);
				checking = false;
				if (authorized) { loadProfiles(); loadPendingLinks(); loadActiveProfiles(); loadUsersWithoutProfile(); }
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>{m.admin_profiles_title()}</title></svelte:head>

<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>← {m.admin_dashboard()}</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_checking_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_access_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<h1>{m.admin_profiles_heading()}</h1>
		<p class="muted mb-2">{m.admin_profiles_desc()}</p>

		{#if actionMessage}
			<div class="toast toast--{actionMessage.type}">{actionMessage.text}</div>
		{/if}

		<!-- Pending Other Links Section -->
		{#if pendingLinksCount > 0}
			<div class="pending-links-section card mb-2">
				<h2 class="pending-links-section__title">🔗 Pending Custom Links <span class="filter-tab__count">{pendingLinksCount}</span></h2>
				<p class="muted" style="font-size: 0.85rem; margin: 0 0 1rem;">{m.admin_profiles_custom_links()}</p>
				{#each pendingLinksProfiles as p (p.id)}
					<div class="pending-link-card">
						<div class="pending-link-card__header">
							{#if p.avatar_url}
								<img src={p.avatar_url} alt="" class="pending-link-card__avatar" />
							{:else}
								<div class="pending-link-card__avatar pending-link-card__avatar--placeholder">{(p.display_name || '?').charAt(0)}</div>
							{/if}
							<div>
								<span class="pending-link-card__name">{p.display_name || '—'}</span>
								{#if p.runner_id}<span class="muted"> · <a href={localizeHref(`/runners/${p.runner_id}`)}>@{p.runner_id}</a></span>{/if}
							</div>
						</div>
						<div class="pending-link-card__links">
							{#each p.other_links_pending as link}
								{@const isProcessing = linkProcessing === `${p.id}:${link}`}
								<div class="pending-link-row">
									<a href={link} target="_blank" rel="noopener" class="pending-link-row__url">{link}</a>
									<div class="pending-link-row__actions">
										<button class="btn btn--small btn--approve" onclick={() => approveLink(p.id, link)} disabled={isProcessing}>✓ Approve</button>
										<button class="btn btn--small btn--reject" onclick={() => rejectLink(p.id, link)} disabled={isProcessing}>✕ Reject</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<div class="filters card">
			<div class="filters__row">
				<StatusFilterTabs tabs={profileTabs} bind:value={statusFilter} totalItems={currentTabItems.length} bind:pageSize bind:currentPage />
				<Button.Root size="sm" onclick={() => { loadProfiles(); loadActiveProfiles(); loadUsersWithoutProfile(); }}>↻ Refresh</Button.Root>
			</div>
			<div class="filters__advanced">
				<div class="filter-group">
					<label class="filter-label">{m.admin_profiles_created()}</label>
					<Select.Root bind:value={profileFilter}>
						<Select.Trigger>{profileFilter === 'yes' ? m.admin_profiles_has_profile_yes() : profileFilter === 'no' ? m.admin_profiles_has_profile_no() : m.admin_profiles_all()}</Select.Trigger>
						<Select.Content>
							<Select.Item value="all" label={m.admin_profiles_all()} />
							<Select.Item value="yes" label={m.admin_profiles_has_profile_yes()} />
							<Select.Item value="no" label={m.admin_profiles_has_profile_no()} />
						</Select.Content>
					</Select.Root>
				</div>
				<div class="filter-group">
					<label class="filter-label">{m.admin_date_from()}</label>
					<input type="date" class="filter-input" bind:value={dateFrom} />
				</div>
				<div class="filter-group">
					<label class="filter-label">{m.admin_date_to()}</label>
					<input type="date" class="filter-input" bind:value={dateTo} />
				</div>
				{#if profileFilter !== 'all' || dateFrom || dateTo}
					<Button.Root size="sm" onclick={() => { profileFilter = 'all'; dateFrom = ''; dateTo = ''; }}>✕ Clear</Button.Root>
				{/if}
			</div>
		</div>

		{#if statusFilter === 'published'}
			<!-- Users without a profile yet -->
			{#if currentTabItems.length === 0}
				<div class="card"><div class="empty"><span class="empty__icon">👤</span><h3>No users without profiles</h3><p class="muted">Everyone who signed up has created a profile.</p></div></div>
			{:else}
				<div class="profiles-list">
					{#each paginatedItems as u (u.user_id)}
						<div class="profile-card">
							<div class="profile-card__header" style="cursor: default;">
								<div class="profile-card__info">
									<div class="profile-card__avatar profile-card__avatar--placeholder">{(u.display_name || '?').charAt(0)}</div>
									<div>
										<span class="profile-card__name">{u.display_name || 'Unknown'}</span>
										<span class="profile-card__runner muted">— No Profile</span>
									</div>
								</div>
								<span class="status-badge status-badge--no-profile">No Profile</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if statusFilter === 'active'}
			<!-- Active profiles (live on the site) -->
			{#if currentTabItems.length === 0}
				<div class="card"><div class="empty"><span class="empty__icon">👤</span><h3>No active profiles</h3><p class="muted">No profiles have been created yet.</p></div></div>
			{:else}
				<div class="profiles-list">
					{#each paginatedItems as p (p.id)}
						<div class="profile-card">
							<a class="profile-card__header" href={localizeHref(`/runners/${p.runner_id}`)} style="text-decoration: none; color: inherit;">
								<div class="profile-card__info">
									{#if p.avatar_url}
										<img src={p.avatar_url} alt="" class="profile-card__avatar" />
									{:else}
										<div class="profile-card__avatar profile-card__avatar--placeholder">{(p.display_name || '?').charAt(0)}</div>
									{/if}
									<div>
										<span class="profile-card__name">{p.display_name || '—'}</span>
										{#if p.runner_id}<span class="profile-card__runner muted">@{p.runner_id}</span>{/if}
									</div>
								</div>
								<span class="status-badge status-badge--approved">Active</span>
							</a>
						</div>
					{/each}
				</div>
			{/if}
		{:else if loading}
			<div class="card"><div class="center-sm"><div class="spinner"></div><p class="muted">{m.admin_loading_profiles()}</p></div></div>
		{:else if currentTabItems.length === 0}
			<div class="card"><div class="empty"><span class="empty__icon">🎉</span><h3>No {statusFilter === 'all' ? '' : statusFilter === 'needs_changes' ? 'needs changes' : statusFilter} profiles</h3><p class="muted">{m.admin_all_caught_up()}</p></div></div>
		{:else}
			<div class="profiles-list">
				{#each paginatedItems as p (p.id)}
					{@const canAct = p.status === 'pending' || p.status === 'needs_changes'}
					<Collapsible.Root open={expandedId === p.id} onOpenChange={(o: boolean) => { expandedId = o ? p.id : null; }} class="profile-card">
						<Collapsible.Trigger class="profile-card__header">
							<div class="profile-card__info">
								{#if p.avatar_url}
									<img src={p.avatar_url} alt="" class="profile-card__avatar" />
								{:else}
									<div class="profile-card__avatar profile-card__avatar--placeholder">{(p.display_name || '?').charAt(0)}</div>
								{/if}
								<div>
									<div class="profile-card__name">{p.display_name || '—'}</div>
									<div class="profile-card__runner muted">@{p.runner_id}</div>
								</div>
								<span class="status-badge status-badge--{p.status}">{p.status}</span>
							{#if !p.has_profile}<span class="status-badge status-badge--no-profile">no profile</span>{/if}
							</div>
							<span class="muted" style="font-size:0.85rem;">{formatDate(p.created_at)}</span>
						</Collapsible.Trigger>

						<Collapsible.Content class="profile-card__body">
								<div class="detail-grid">
									<div class="detail"><span class="detail__label">{m.admin_profiles_user_id()}</span><code>{p.user_id || '—'}</code></div>
									<div class="detail"><span class="detail__label">{m.admin_profiles_pronouns()}</span>{p.pronouns || '—'}</div>
									<div class="detail"><span class="detail__label">{m.admin_profiles_location()}</span>{p.location || '—'}</div>
								</div>
								{#if p.bio}
									<div class="detail mt-2"><span class="detail__label">{m.admin_profiles_bio()}</span><p class="bio-text">{p.bio}</p></div>
								{/if}
								{#if p.socials && Object.keys(p.socials).length > 0}
									<div class="socials mt-2">
										<span class="detail__label">{m.admin_profiles_socials()}</span>
										<div class="socials__list">
											{#each Object.entries(p.socials) as [platform, url]}
												{#if url && platform !== 'other'}
													<a href={String(url)} target="_blank" rel="noopener" class="social-link">
														{#if SOCIAL_ICONS[platform]}{@const Icon = SOCIAL_ICONS[platform]}<Icon size={14} />{:else}<ExternalLink size={14} />{/if} {platform}
													</a>
												{/if}
											{/each}
										</div>
									</div>
								{/if}
								{#if p.rejection_reason}
									<div class="status-bar mt-2">Previous rejection: {p.rejection_reason}</div>
								{/if}
								{#if canAct}
									<div class="actions mt-2">
										<button class="btn btn--approve" onclick={() => approveProfile(p.id)} disabled={processingId === p.id}>
											{processingId === p.id ? '...' : '✅ Approve'}
										</button>
										<button class="btn btn--changes" onclick={() => openChangesModal(p)} disabled={processingId === p.id}><Pencil size={14} /> Request Changes</button>
										<button class="btn btn--reject" onclick={() => openRejectModal(p)} disabled={processingId === p.id}><XCircle size={14} /> Reject</button>
									</div>
								{/if}
						</Collapsible.Content>
					</Collapsible.Root>
				{/each}
			</div>
		{/if}

		<Dialog.Root open={rejectModalOpen} onOpenChange={(o: boolean) => { if (!o) rejectModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_profiles_reject()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<p class="muted mb-2">{modalInfo}</p>
					<div class="form-field">
						<label>{m.admin_reason_required()} <span class="required">*</span></label>
						<Select.Root bind:value={rejectReason}>
							<Select.Trigger>{rejectReason === 'inappropriate_content' ? m.admin_profiles_inappropriate() : rejectReason === 'impersonation' ? m.admin_profiles_impersonation() : rejectReason === 'spam' ? m.admin_profiles_spam() : rejectReason === 'invalid_info' ? m.admin_profiles_invalid() : rejectReason === 'other' ? m.admin_other() : m.admin_select_reason()}</Select.Trigger>
							<Select.Content>
								<Select.Item value="inappropriate_content" label={m.admin_profiles_inappropriate()} />
								<Select.Item value="impersonation" label={m.admin_profiles_impersonation()} />
								<Select.Item value="spam" label={m.admin_profiles_spam()} />
								<Select.Item value="invalid_info" label={m.admin_profiles_invalid()} />
								<Select.Item value="other" label={m.admin_other()} />
							</Select.Content>
						</Select.Root>
					</div>
					<div class="form-field">
						<label>{m.admin_runs_notes_optional()}</label>
						<textarea rows="3" bind:value={rejectNotes} placeholder="Additional details..."></textarea>
					</div>
				</div>
				<Dialog.Footer>
					<button class="btn btn--reject" onclick={confirmReject} disabled={!rejectReason || processingId !== null}>{m.admin_reject_btn()}</button>
					<Button.Root onclick={() => rejectModalOpen = false}>{m.admin_cancel()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root open={changesModalOpen} onOpenChange={(o: boolean) => { if (!o) changesModalOpen = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_profiles_request_changes()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<p class="muted mb-2">{modalInfo}</p>
					<div class="form-field">
						<label>{m.admin_profiles_what_changed()} <span class="required">*</span></label>
						<textarea rows="4" bind:value={changesNotes} placeholder="Describe what the user needs to fix..."></textarea>
					</div>
				</div>
				<Dialog.Footer>
					<button class="btn btn--changes" onclick={confirmChanges} disabled={!changesNotes.trim() || processingId !== null}>{m.admin_profiles_send_request()}</button>
					<Button.Root onclick={() => changesModalOpen = false}>{m.admin_cancel()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	<AlertDialog.Root bind:open={confirmOpen}>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
			<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
			<div class="alert-dialog-actions">
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action onclick={handleConfirmAction}>Confirm</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mt-2 { margin-top: 1rem; }
	.center { text-align: center; padding: 4rem 0; } .center-sm { text-align: center; padding: 2rem; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
	.btn:hover { border-color: var(--accent); color: var(--accent); } .btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn--approve { background: #28a745; color: white; border-color: #28a745; } .btn--approve:hover { background: #218838; color: white; }
	.btn--reject { border-color: #dc3545; color: #dc3545; } .btn--reject:hover { background: #dc3545; color: white; }
	.btn--changes { border-color: #17a2b8; color: #17a2b8; } .btn--changes:hover { background: #17a2b8; color: white; }

	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

	.filters { padding: 1rem; margin-bottom: 1.5rem; }
	.filters__row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
	.filters__tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	:global(.filter-tabs.ui-toggle-group) { display: flex; flex-wrap: wrap; gap: 0.25rem; border: none; border-radius: 0; overflow: visible; }
	:global(.filter-tabs .ui-toggle-group-item) { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.75rem; font-size: 0.85rem; color: var(--muted); }
	:global(.filter-tabs .ui-toggle-group-item:hover) { border-color: var(--fg); color: var(--fg); }
	:global(.filter-tabs .ui-toggle-group-item[data-state="on"]) { background: var(--accent); color: white; border-color: var(--accent); }
	:global(.filter-tab__count) { display: inline-block; background: rgba(255,255,255,0.25); padding: 0 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; font-weight: 700; }
	.filters__advanced { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.filter-group { display: flex; flex-direction: column; gap: 0.25rem; }
	.filter-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.filter-input { padding: 0.35rem 0.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.filter-input:focus { border-color: var(--accent); outline: none; }

	.profiles-list { display: flex; flex-direction: column; gap: 1rem; }
	:global(.profile-card) { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	:global(.profile-card .profile-card__header) { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; cursor: pointer; width: 100%; background: none; border: none; color: var(--fg); text-align: left; font-family: inherit; font-size: inherit; gap: 1rem; }
	:global(.profile-card .profile-card__header:hover) { background: rgba(255,255,255,0.02); }
	.profile-card__info { display: flex; align-items: center; gap: 0.75rem; }
	.profile-card__avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.profile-card__avatar--placeholder { background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; }
	.profile-card__name { font-weight: 700; }
	.profile-card__runner { font-size: 0.85rem; }
	.status-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
	.status-badge--pending { background: rgba(234, 179, 8, 0.15); color: #eab308; }
	.status-badge--approved { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
	.status-badge--rejected { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.status-badge--needs_changes { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
	.status-badge--no-profile { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }

	:global(.profile-card__body) { border-top: 1px solid var(--border); padding: 1.25rem; }
	.detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
	.detail__label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.15rem; }
	.bio-text { margin: 0.35rem 0 0; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; }
	code { background: var(--bg); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.75rem; }
	.socials__list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.35rem; }
	.social-link { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.6rem; background: var(--bg); border-radius: 6px; font-size: 0.8rem; color: var(--accent); text-decoration: none; }
	.social-link:hover { text-decoration: underline; }
	.status-bar { padding: 0.5rem 0.75rem; background: rgba(239, 68, 68, 0.08); border-radius: 6px; font-size: 0.85rem; color: #ef4444; }
	.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--border); }

	.empty { text-align: center; padding: 3rem 1rem; }
	.empty__icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
	.empty h3 { margin: 0 0 0.5rem; }

	.modal__body { margin-bottom: 0.5rem; }
	.form-field { margin-bottom: 1rem; }
	.form-field label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem; }
	.form-field textarea { width: 100%; padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.required { color: #dc3545; }

	/* Pending Other Links */
	.pending-links-section { padding: 1.25rem; }
	.pending-links-section__title { margin: 0 0 0.25rem; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; }
	.pending-link-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 0.5rem; }
	.pending-link-card:last-child { margin-bottom: 0; }
	.pending-link-card__header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.6rem; font-size: 0.9rem; }
	.pending-link-card__avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.pending-link-card__avatar--placeholder { display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); font-size: 0.75rem; font-weight: 700; color: var(--muted); }
	.pending-link-card__name { font-weight: 600; }
	.pending-link-card__header a { color: var(--accent); text-decoration: none; }
	.pending-link-card__header a:hover { text-decoration: underline; }
	.pending-link-card__links { display: flex; flex-direction: column; gap: 0.4rem; }
	.pending-link-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0.6rem; background: var(--surface); border-radius: 6px; }
	.pending-link-row__url { color: var(--accent); text-decoration: none; font-size: 0.85rem; word-break: break-all; min-width: 0; }
	.pending-link-row__url:hover { text-decoration: underline; }
	.pending-link-row__actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
</style>
