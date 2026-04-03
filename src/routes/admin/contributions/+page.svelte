<script lang="ts">
	import { Search, FileText, Plus, ChevronUp, ChevronDown, X, Save, ExternalLink, ShieldCheck, CheckCircle, ClipboardList, ArrowLeft} from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as Select from '$lib/components/ui/select/index.js';

	let checking = $state(true);
	let authorized = $state(false);

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => void) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => void) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) confirmCallback();
		confirmCallback = null;
	}

	// Search
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let searchLoading = $state(false);

	// Editing
	let selectedRunner = $state<{ runner_id: string; display_name: string; avatar_url: string | null; user_id: string | null } | null>(null);
	let contributions = $state<{ icon?: string; title: string; description?: string; url?: string; type?: string }[]>([]);
	let saving = $state(false);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Role data (read-only)
	let moderatorGames = $state<{ game_id: string; game_name: string }[]>([]);
	let verifierGames = $state<{ game_id: string; game_name: string }[]>([]);

	// Credit data (editable role labels)
	let creditedGames = $state<{ game_id: string; game_name: string; role: string; originalRole: string }[]>([]);
	let creditSaving = $state<Record<string, boolean>>({});

	const CONTRIBUTION_TYPES = [
		{ value: 'guide', label: 'Guide' },
		{ value: 'resource', label: 'Resource' },
		{ value: 'tool', label: 'Tool' },
		{ value: 'research', label: 'Research' },
		{ value: 'video', label: 'Video' },
		{ value: 'moderation', label: 'Moderation' },
		{ value: 'translation', label: 'Translation' },
		{ value: 'other', label: 'Other' },
	];

	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 4000);
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (loading) => {
			if (loading) return;
			const role = await checkAdminRole();
			if (!role?.admin) { goto(localizeHref('/admin')); return; }
			authorized = true;
			checking = false;
		});
		return unsub;
	});

	async function searchRunners() {
		if (!searchQuery.trim()) return;
		searchLoading = true;
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select('runner_id, display_name, avatar_url, contributions, user_id')
				.eq('status', 'approved')
				.or(`runner_id.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
				.limit(10);
			searchResults = data || [];
		} catch { searchResults = []; }
		searchLoading = false;
	}

	async function selectRunner(profile: any) {
		selectedRunner = {
			runner_id: profile.runner_id,
			display_name: profile.display_name || profile.runner_id,
			avatar_url: profile.avatar_url,
			user_id: profile.user_id || null,
		};
		contributions = JSON.parse(JSON.stringify(profile.contributions || []));
		searchResults = [];
		searchQuery = '';

		// Load role and credit data in parallel
		await loadRunnerRolesAndCredits(profile.user_id, profile.runner_id);
	}

	async function loadRunnerRolesAndCredits(userId: string | null, runnerId: string) {
		moderatorGames = [];
		verifierGames = [];
		creditedGames = [];

		const promises: Promise<void>[] = [];

		if (userId) {
			// Moderator games
			promises.push((async () => {
				const { data: modRoles } = await supabase
					.from('role_game_moderators')
					.select('game_id')
					.eq('user_id', userId);
				if (modRoles?.length) {
					const { data: games } = await supabase
						.from('games')
						.select('game_id, game_name')
						.in('game_id', modRoles.map(r => r.game_id))
						.order('game_name');
					moderatorGames = games || [];
				}
			})());

			// Verifier games
			promises.push((async () => {
				const { data: verRoles } = await supabase
					.from('role_game_verifiers')
					.select('game_id')
					.eq('user_id', userId);
				if (verRoles?.length) {
					const { data: games } = await supabase
						.from('games')
						.select('game_id, game_name')
						.in('game_id', verRoles.map(r => r.game_id))
						.order('game_name');
					verifierGames = games || [];
				}
			})());
		}

		// Credited games
		promises.push((async () => {
			const { data: allGames } = await supabase
				.from('games')
				.select('game_id, game_name, credits')
				.not('credits', 'is', null);
			if (allGames) {
				const found: typeof creditedGames = [];
				for (const g of allGames) {
					const credits: any[] = g.credits || [];
					const entry = credits.find((c: any) => c.runner_id === runnerId);
					if (entry) {
						found.push({
							game_id: g.game_id,
							game_name: g.game_name,
							role: entry.role || 'Contributor',
							originalRole: entry.role || 'Contributor',
						});
					}
				}
				found.sort((a, b) => a.game_name.localeCompare(b.game_name));
				creditedGames = found;
			}
		})());

		await Promise.all(promises);
	}

	async function saveCreditRole(gameId: string, runnerId: string, role: string) {
		creditSaving = { ...creditSaving, [gameId]: true };
		const result = await adminAction('/update-game-credit-role', {
			game_id: gameId,
			runner_id: runnerId,
			role: role.trim(),
		});
		if (result.ok) {
			showToast('success', 'Credit role updated!');
			creditedGames = creditedGames.map(c =>
				c.game_id === gameId ? { ...c, originalRole: c.role } : c
			);
		} else {
			showToast('error', result.message || 'Failed to update credit role');
		}
		creditSaving = { ...creditSaving, [gameId]: false };
	}

	function addContribution() {
		contributions = [...contributions, { icon: 'other', title: '', description: '', url: '', type: 'other' }];
	}

	function removeContribution(index: number) {
		contributions = contributions.filter((_, i) => i !== index);
	}

	function moveContribution(from: number, to: number) {
		if (to < 0 || to >= contributions.length) return;
		const arr = [...contributions];
		const [item] = arr.splice(from, 1);
		arr.splice(to, 0, item);
		contributions = arr;
	}

	async function saveContributions() {
		if (!selectedRunner) return;
		for (const c of contributions) {
			if (!c.title.trim()) { showToast('error', 'Every contribution needs a title.'); return; }
		}
		saving = true;
		const result = await adminAction('/update-contributions', {
			runner_id: selectedRunner.runner_id,
			contributions: contributions.map(c => ({
				icon: c.icon || 'other',
				title: c.title.trim(),
				description: c.description?.trim() || undefined,
				url: c.url?.trim() || undefined,
				type: c.type || 'other',
			})),
		});
		if (result.ok) showToast('success', 'Contributions saved!');
		else showToast('error', result.message);
		saving = false;
	}

	function clearRunner() {
		selectedRunner = null;
		contributions = [];
		moderatorGames = [];
		verifierGames = [];
		creditedGames = [];
	}
</script>

<svelte:head><title>Contributions | Admin | CRC</title></svelte:head>

<div class="page-width contributions-editor">
	<p class="back"><a href={localizeHref('/admin')}><ArrowLeft size={14} /> Admin</a></p>
	<h1>Edit Runner Contributions</h1>
	<p class="muted mb-2">Search for a runner to view their roles, credits, and manage contributions.</p>

	{#if checking}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access…</p></div>
	{:else if !authorized}
		<div class="center"><p class="muted">Redirecting…</p></div>
	{:else}
		{#if toast}
			<div class="toast toast--{toast.type}">{toast.text}</div>
		{/if}

		{#if !selectedRunner}
			<!-- Search UI -->
			<div class="search-box">
				<div class="search-row">
					<input type="text" bind:value={searchQuery} placeholder="Search by runner ID or display name…"
						onkeydown={(e) => { if (e.key === 'Enter') searchRunners(); }} />
					<Button.Root onclick={searchRunners} disabled={searchLoading}>
						{searchLoading ? 'Searching…' : 'Search'}
					</Button.Root>
				</div>

				{#if searchResults.length > 0}
					<div class="search-results">
						{#each searchResults as r}
							<button class="search-result" onclick={() => selectRunner(r)}>
								{#if r.avatar_url}
									<img class="search-result__avatar" src={r.avatar_url} alt="" />
								{:else}
									<div class="search-result__avatar search-result__avatar--placeholder">{(r.display_name || r.runner_id).charAt(0).toUpperCase()}</div>
								{/if}
								<div>
									<span class="search-result__name">{r.display_name || r.runner_id}</span>
									<span class="search-result__id muted">{r.runner_id}</span>
								</div>
								<span class="search-result__count muted">{(r.contributions || []).length} contributions</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<!-- Editing UI -->
			<div class="editor-header">
				<Button.Root size="sm" onclick={clearRunner}><ArrowLeft size={14} /> Back to Search</Button.Root>
				<div class="editor-runner">
					{#if selectedRunner.avatar_url}
						<img class="editor-runner__avatar" src={selectedRunner.avatar_url} alt="" />
					{/if}
					<div>
						<strong>{selectedRunner.display_name}</strong>
						<span class="muted">{selectedRunner.runner_id}</span>
					</div>
					<a href={localizeHref(`/runners/${selectedRunner.runner_id}`)} target="_blank" class="btn btn--small">View Profile ↗</a>
				</div>
			</div>

			<!-- Section 1: Moderates (read-only) -->
			{#if moderatorGames.length > 0}
				<div class="section-card">
					<h2><ShieldCheck size={18} style="display:inline-block;vertical-align:-0.15em;" /> Moderates</h2>
					<p class="muted small">Games this runner moderates. Managed via Admin → Users.</p>
					<div class="role-game-list">
						{#each moderatorGames as g}
							<a href={localizeHref(`/games/${g.game_id}`)} target="_blank" class="role-game-chip">{g.game_name}</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Section 2: Verifies (read-only) -->
			{#if verifierGames.length > 0}
				<div class="section-card">
					<h2><CheckCircle size={18} style="display:inline-block;vertical-align:-0.15em;" /> Verifies</h2>
					<p class="muted small">Games this runner verifies runs for. Managed via Admin → Users.</p>
					<div class="role-game-list">
						{#each verifierGames as g}
							<a href={localizeHref(`/games/${g.game_id}`)} target="_blank" class="role-game-chip">{g.game_name}</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Section 3: Game Page Credits (editable role labels) -->
			{#if creditedGames.length > 0}
				<div class="section-card">
					<h2><ClipboardList size={18} style="display:inline-block;vertical-align:-0.15em;" /> Game Page Credits</h2>
					<p class="muted small">Games this runner is credited on. Edit the role label shown on their profile.</p>
					<div class="credits-list">
						{#each creditedGames as cg}
							<div class="credit-row">
								<a href={localizeHref(`/games/${cg.game_id}`)} target="_blank" class="credit-row__game">{cg.game_name}</a>
								<div class="credit-row__role-edit">
									<input type="text" bind:value={cg.role} placeholder="e.g., Category Designer" />
									{#if cg.role.trim() !== cg.originalRole}
										<button class="btn btn--save btn--xs" onclick={() => saveCreditRole(cg.game_id, selectedRunner!.runner_id, cg.role)} disabled={creditSaving[cg.game_id]}>
											{creditSaving[cg.game_id] ? '…' : 'Save'}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Section 4: Guides & Resources (manual, editable) -->
			<div class="section-card">
				<h2><FileText size={18} style="display:inline-block;vertical-align:-0.15em;" /> Guides & Resources</h2>
				<p class="muted small">Manual contributions — guides, tools, videos, etc.</p>

				<div class="contributions-list">
					{#each contributions as c, i}
						<div class="contribution-card">
							<div class="contribution-card__header">
								<span class="contribution-card__num">#{i + 1}</span>
								<div class="contribution-card__actions">
									<button class="item-btn" onclick={() => moveContribution(i, i - 1)} disabled={i === 0}><ChevronUp size={14} /></button>
									<button class="item-btn" onclick={() => moveContribution(i, i + 1)} disabled={i === contributions.length - 1}><ChevronDown size={14} /></button>
									<button class="item-btn item-btn--danger" onclick={() => { openConfirm('Remove Contribution', `Remove "${c.title || 'this contribution'}"?`, () => removeContribution(i)); }}><X size={14} /></button>
								</div>
							</div>
							<div class="contribution-card__body">
								<div class="field-row">
									<label>Title <span class="required">*</span></label>
									<input type="text" bind:value={c.title} placeholder="e.g., Cuphead NMG Guide" />
								</div>
								<div class="field-row--inline">
									<div class="field-row">
										<label>Type</label>
										<Select.Root bind:value={c.type}>
											<Select.Trigger>{CONTRIBUTION_TYPES.find(t => t.value === c.type)?.label || c.type}</Select.Trigger>
											<Select.Content>
												{#each CONTRIBUTION_TYPES as t}
													<Select.Item value={t.value} label={t.label} />
												{/each}
											</Select.Content>
										</Select.Root>
									</div>
									<div class="field-row">
										<label>Icon</label>
										<input type="text" bind:value={c.icon} placeholder="<FileText size={14} />" style="max-width: 80px;" />
									</div>
								</div>
								<div class="field-row">
									<label>Description</label>
									<textarea rows="2" bind:value={c.description} placeholder="Brief description of this contribution…"></textarea>
								</div>
								<div class="field-row">
									<label>URL</label>
									<input type="url" bind:value={c.url} placeholder="https://…" />
								</div>
							</div>
						</div>
					{/each}

					{#if contributions.length === 0}
						<div class="empty">
							<span class="empty__icon"><FileText size={14} /></span>
							<p class="muted">No manual contributions yet. Add one below.</p>
						</div>
					{/if}
				</div>

				<button class="btn btn--add" onclick={addContribution}>+ Add Contribution</button>

				<div class="save-bar">
					<button class="btn btn--save" onclick={saveContributions} disabled={saving}>
						{saving ? 'Saving…' : 'Save Contributions'}
					</button>
					<span class="muted">{contributions.length} contribution{contributions.length !== 1 ? 's' : ''}</span>
				</div>
			</div>

			<!-- Summary if all sections empty -->
			{#if moderatorGames.length === 0 && verifierGames.length === 0 && creditedGames.length === 0 && contributions.length === 0}
				<div class="empty mt-2">
					<span class="empty__icon"><Clipboard size={14} /></span>
					<p class="muted">No roles, credits, or contributions found for this runner.</p>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
		<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="btn btn--danger" onclick={handleConfirmAction}>Remove</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	.contributions-editor { max-width: 800px; }
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; } .mt-2 { margin-top: 1rem; }

	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; }
	.btn--xs { padding: 0.2rem 0.5rem; font-size: 0.78rem; }
	.btn--add { margin-top: 1rem; border-style: dashed; width: 100%; justify-content: center; padding: 0.75rem; }
	.btn--save { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn--save:hover { opacity: 0.9; color: #fff; }

	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
	.toast--error { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

	/* Search */
	.search-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
	.search-row { display: flex; gap: 0.5rem; }
	.search-row input { flex: 1; padding: 0.6rem 0.8rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.search-row input:focus { border-color: var(--accent); outline: none; }
	.search-results { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; }
	.search-result { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.8rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; width: 100%; text-align: left; font-family: inherit; font-size: inherit; color: var(--fg); }
	.search-result:hover { border-color: var(--accent); }
	.search-result__avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.search-result__avatar--placeholder { display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); font-weight: 700; font-size: 0.9rem; color: var(--muted); }
	.search-result__name { font-weight: 600; }
	.search-result__id { font-size: 0.8rem; margin-left: 0.25rem; }
	.search-result__count { margin-left: auto; font-size: 0.8rem; }

	/* Editor header */
	.editor-header { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
	.editor-runner { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
	.editor-runner__avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
	.editor-runner a { margin-left: auto; }

	/* Section cards */
	.section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
	.section-card h2 { font-size: 1.05rem; margin: 0 0 0.25rem; }
	.small { font-size: 0.85rem; }

	/* Role game chips (read-only) */
	.role-game-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
	.role-game-chip { display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; font-size: 0.85rem; color: var(--fg); text-decoration: none; }
	.role-game-chip:hover { border-color: var(--accent); color: var(--accent); }

	/* Credits list (editable roles) */
	.credits-list { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
	.credit-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.8rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.credit-row__game { font-weight: 600; font-size: 0.9rem; color: var(--fg); text-decoration: none; white-space: nowrap; min-width: 120px; }
	.credit-row__game:hover { color: var(--accent); }
	.credit-row__role-edit { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
	.credit-row__role-edit input { flex: 1; padding: 0.4rem 0.6rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.credit-row__role-edit input:focus { border-color: var(--accent); outline: none; }

	/* Contribution cards */
	.contributions-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
	.contribution-card { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.contribution-card__header { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); }
	.contribution-card__num { font-weight: 700; font-size: 0.8rem; color: var(--muted); }
	.contribution-card__actions { display: flex; gap: 0.25rem; }
	.contribution-card__body { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }

	.field-row { display: flex; flex-direction: column; gap: 0.25rem; }
	.field-row label { font-size: 0.8rem; font-weight: 600; color: var(--muted); }
	.field-row input, .field-row textarea { padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.field-row input:focus, .field-row textarea:focus { border-color: var(--accent); outline: none; }
	.field-row--inline { display: flex; gap: 0.75rem; }
	.field-row--inline .field-row { flex: 1; }

	.item-btn { appearance: none; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.5rem; font-size: 0.8rem; cursor: pointer; color: var(--fg); }
	.item-btn:hover { border-color: var(--accent); }
	.item-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.item-btn--danger:hover { border-color: #ef4444; color: #ef4444; }

	.required { color: #ef4444; }

	.save-bar { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }

	.empty { text-align: center; padding: 2rem; }
	.empty__icon { font-size: 2.5rem; display: block; margin-bottom: 0.5rem; opacity: 0.5; }

	@media (max-width: 640px) {
		.field-row--inline { flex-direction: column; }
		.search-row { flex-direction: column; }
		.editor-runner { flex-wrap: wrap; }
		.credit-row { flex-direction: column; align-items: stretch; }
		.credit-row__game { min-width: unset; }
	}
</style>
