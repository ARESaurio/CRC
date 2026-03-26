<script lang="ts">
	import { Pencil } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { showToast } from '$stores/toast';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { stripTooltipSyntax } from '$lib/utils/markdown';

	const CLAIM_TTL_MS = 14 * 24 * 60 * 60 * 1000;

	let loading = $state(true);
	let update = $state<any>(null);
	let notFound = $state(false);
	let locked = $state(false);

	// ── Form State ──
	let section = $state('');
	let updateType = $state('');
	let details = $state('');

	// ── UI ──
	let saving = $state(false);
	let errorMsg = $state('');

	const canSave = $derived(!!details.trim() && !locked);

	onMount(async () => {
		if (!$user) return;
		const id = $page.params.id;

		try {
			const { data, error } = await supabase
				.from('game_update_requests')
				.select('*')
				.eq('id', id)
				.single();

			if (error || !data) { notFound = true; loading = false; return; }
			if (data.user_id !== $user.id) { notFound = true; loading = false; return; }

			update = data;
			section = data.section || '';
			updateType = data.update_type || '';
			details = data.details || '';

			locked = !!(data.claimed_by && data.claimed_at &&
				(Date.now() - new Date(data.claimed_at).getTime()) < CLAIM_TTL_MS);
		} catch {
			notFound = true;
		}

		loading = false;
	});

	async function handleSave() {
		if (!canSave || !update) return;
		saving = true;
		errorMsg = '';

		try {
			const { error } = await supabase
				.from('game_update_requests')
				.update({
					section,
					update_type: updateType,
					details: stripTooltipSyntax(details),
					updated_at: new Date().toISOString()
				})
				.eq('id', update.id);

			if (error) throw error;

			showToast('success', 'Changes saved');
			goto(localizeHref('/profile/submissions'));
		} catch (err: any) {
			errorMsg = err.message || 'Failed to save changes';
		}

		saving = false;
	}
</script>

<svelte:head><title>{m.sub_update_title({ type: 'Game Update' })}</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="edit-update-page">
			<p class="muted mb-2"><a href={localizeHref('/profile/submissions')}>← {m.user_menu_submissions()}</a></p>

			{#if loading}
				<div class="center"><div class="spinner"></div></div>
			{:else if notFound}
				<div class="center">
					<h1>{m.sub_update_not_found()}</h1>
					<p class="muted">{m.sub_update_not_found()}</p>
					<a href={localizeHref('/profile/submissions')} class="btn">{m.user_menu_submissions()}</a>
				</div>
			{:else if update.status !== 'pending'}
				<h1><Pencil size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.sub_update_heading()}</h1>
				<div class="alert alert--error">This submission is no longer pending and cannot be edited.</div>
			{:else}
				<h1><Pencil size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.sub_update_heading()}</h1>
				<p class="muted mb-3">Editing your update suggestion for <strong>{update.game_name || update.game_id}</strong>.</p>

				{#if locked}
					<div class="lock-banner">
						<span>🔒</span>
						<span>{m.submissions_locked_message()}</span>
					</div>
				{/if}

				<form class="edit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
					<div class="fg">
						<label class="fl">Section</label>
						<Select.Root bind:value={section} disabled={locked}>
							<Select.Trigger>{{ overview: 'Overview', runs: 'Runs', rules: 'Rules', resources: 'Resources', history: 'History', other: 'Other' }[section] || 'Select a section...'}</Select.Trigger>
							<Select.Content>
								<Select.Item value="overview" label="Overview" />
								<Select.Item value="runs" label="Runs" />
								<Select.Item value="rules" label="Rules" />
								<Select.Item value="resources" label="Resources" />
								<Select.Item value="history" label="History" />
								<Select.Item value="other" label="Other" />
							</Select.Content>
						</Select.Root>
					</div>

					<div class="fg">
						<label class="fl">Update Type</label>
						<Select.Root bind:value={updateType} disabled={locked}>
							<Select.Trigger>{{ correction: 'Correction / Fix', addition: 'Addition / New Content', removal: 'Removal / Outdated Content', other: 'Other' }[updateType] || 'Select type...'}</Select.Trigger>
							<Select.Content>
								<Select.Item value="correction" label="Correction / Fix" />
								<Select.Item value="addition" label="Addition / New Content" />
								<Select.Item value="removal" label="Removal / Outdated Content" />
								<Select.Item value="other" label="Other" />
							</Select.Content>
						</Select.Root>
					</div>

					<div class="fg">
						<label class="fl" for="details">Details <span class="req">*</span></label>
						<textarea id="details" class="fi" bind:value={details} rows="6" maxlength="3000" disabled={locked} placeholder="Describe the update needed..."></textarea>
						<span class="fh">{details.length}/3000</span>
					</div>

					{#if update.image_urls?.length}
						<div class="fg">
							<label class="fl">Attached Images</label>
							<div class="image-list">
								{#each update.image_urls as url}
									<a href={url} target="_blank" class="image-thumb">
										<img src={url} alt="Attachment" />
									</a>
								{/each}
							</div>
							<p class="fh">Images from original submission. To change images, withdraw and resubmit.</p>
						</div>
					{/if}

					{#if errorMsg}
						<div class="alert alert--error">{errorMsg}</div>
					{/if}

					<div class="form-actions">
						<a href={localizeHref('/profile/submissions')} class="btn">{m.btn_cancel()}</a>
						<Button.Root variant="accent" size="lg" type="submit" disabled={!canSave || saving}>
							{saving ? m.btn_saving() : m.btn_save_changes()}
						</Button.Root>
					</div>
				</form>
			{/if}
		</div>
	</div>
</AuthGuard>

<style>
	.edit-update-page { max-width: 600px; margin: 2rem auto; }
	.mb-2 { margin-bottom: 0.75rem; }
	.mb-3 { margin-bottom: 1rem; }
	.req { color: #ef4444; }
	.center { text-align: center; padding: 3rem 0; }

	.lock-banner {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.75rem 1rem; margin-bottom: 1.5rem;
		background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2);
		border-radius: 8px; color: #fbbf24;
	}

	.edit-form { display: flex; flex-direction: column; gap: 1.25rem; }

	.fg { display: flex; flex-direction: column; gap: 0.3rem; }
	.fl { font-size: 0.85rem; font-weight: 600; color: var(--fg); }
	.fi { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.75rem; color: var(--fg); font-family: inherit; font-size: 0.9rem; }
	.fi:disabled { opacity: 0.5; cursor: not-allowed; }
	.fh { font-size: 0.8rem; color: var(--muted); margin: 0; }

	.image-list { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.image-thumb { display: block; width: 80px; height: 80px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
	.image-thumb img { width: 100%; height: 100%; object-fit: cover; }

	.form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--border); }

	.alert--error { padding: 0.75rem 1rem; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 0.9rem; }
</style>
