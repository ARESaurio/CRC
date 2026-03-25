<script lang="ts">
	import { Search, FileText, Plus, ChevronUp, ChevronDown, X, Save, ExternalLink } from 'lucide-svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
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
	let selectedRunner = $state<{ runner_id: string; display_name: string; avatar_url: string | null } | null>(null);
	let contributions = $state<{ icon?: string; title: string; description?: string; url?: string; type?: string }[]>([]);
	let saving = $state(false);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);

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
				.select('runner_id, display_name, avatar_url, contributions')
				.eq('status', 'approved')
				.or(`runner_id.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
				.limit(10);
			searchResults = data || [];
		} catch { searchResults = []; }
		searchLoading = false;
	}

	function selectRunner(profile: any) {
		selectedRunner = {
			runner_id: profile.runner_id,
			display_name: profile.display_name || profile.runner_id,
			avatar_url: profile.avatar_url,
		};
		contributions = JSON.parse(JSON.stringify(profile.contributions || []));
		searchResults = [];
		searchQuery = '';
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
		// Validate
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
	}
</script>

<div class="page-width contributions-editor">
	<p class="back"><a href={localizeHref('/admin')}>← Admin</a></p>
	<h1>Edit Runner Contributions</h1>
	<p class="muted mb-2">Search for a runner and manage their contributions, guides, and resources.</p>

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
					<button class="btn" onclick={searchRunners} disabled={searchLoading}>
						{searchLoading ? 'Searching…' : '🔍 Search'}
					</button>
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
				<button class="btn btn--small" onclick={clearRunner}>← Back to Search</button>
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

			<div class="contributions-list">
				{#each contributions as c, i}
					<div class="contribution-card">
						<div class="contribution-card__header">
							<span class="contribution-card__num">#{i + 1}</span>
							<div class="contribution-card__actions">
								<button class="item-btn" onclick={() => moveContribution(i, i - 1)} disabled={i === 0}>↑</button>
								<button class="item-btn" onclick={() => moveContribution(i, i + 1)} disabled={i === contributions.length - 1}>↓</button>
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
									<input type="text" bind:value={c.icon} placeholder="📄" style="max-width: 80px;" />
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
						<span class="empty__icon">📄</span>
						<p class="muted">No contributions yet. Add one below.</p>
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
	h1 { margin: 0 0 0.25rem; } .mb-2 { margin-bottom: 1rem; }
	.center { text-align: center; padding: 4rem 0; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; }
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
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

	/* Contribution cards */
	.contributions-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
	.contribution-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.contribution-card__header { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1rem; background: var(--bg); border-bottom: 1px solid var(--border); }
	.contribution-card__num { font-weight: 700; font-size: 0.8rem; color: var(--muted); }
	.contribution-card__actions { display: flex; gap: 0.25rem; }
	.contribution-card__body { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }

	.field-row { display: flex; flex-direction: column; gap: 0.25rem; }
	.field-row label { font-size: 0.8rem; font-weight: 600; color: var(--muted); }
	.field-row input, .field-row textarea, .field-row select { padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.field-row input:focus, .field-row textarea:focus, .field-row select:focus { border-color: var(--accent); outline: none; }
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
	}
</style>
