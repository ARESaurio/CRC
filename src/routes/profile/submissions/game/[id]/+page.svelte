<script lang="ts">
	import { user } from '$stores/auth';
	import { showToast } from '$stores/toast';
	import { getAccessToken } from '$lib/admin';
	import { goto } from '$app/navigation';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import AuthGuard from '$components/auth/AuthGuard.svelte';

	let { data } = $props();
	const game = $derived(data.game);
	const gd = $derived(game.game_data || {});

	// ── Claim lock ──
	const CLAIM_TTL_MS = 14 * 24 * 60 * 60 * 1000;
	const locked = $derived(
		!!(game.claimed_by && game.claimed_at && (Date.now() - new Date(game.claimed_at).getTime()) < CLAIM_TTL_MS)
	);

	// ── Form State (pre-filled) ──
	let gameName = $state(game.game_name || '');
	let aliases = $state((game.game_name_aliases || []).join(', '));
	let description = $state(game.description || '');
	let coverUrl = $state(game.cover_image_url || '');
	let submitterNotes = $state(game.submitter_notes || '');
	let rules = $state(game.rules || '');

	// ── UI State ──
	let saving = $state(false);
	let errorMsg = $state('');

	const canSave = $derived(!!gameName.trim() && !locked);

	// ── Summary of game_data for display ──
	const categoryCount = $derived((gd.full_runs?.length || 0) + (gd.mini_challenges?.length || 0));
	const challengeCount = $derived(gd.challenges_data?.length || 0);
	const characterCount = $derived(gd.characters_data?.length || 0);
	const restrictionCount = $derived(gd.restrictions_data?.length || 0);

	async function handleSave() {
		if (!canSave) return;
		saving = true;
		errorMsg = '';

		try {
			const token = await getAccessToken();
			if (!token) throw new Error('Not authenticated');

			const payload: Record<string, any> = {
				game_id: game.id,
				game_name: gameName.trim(),
				aliases: aliases.split(',').map((a: string) => a.trim()).filter(Boolean),
				description: description || null,
				cover_image_url: coverUrl || null,
				submitter_notes: submitterNotes || null,
				rules: rules || null,
			};

			const res = await fetch(`${PUBLIC_WORKER_URL}/edit-pending-game`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify(payload)
			});
			const data = await res.json();

			if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save changes');

			showToast('success', 'Changes saved');
			goto(localizeHref('/profile/submissions'));
		} catch (err: any) {
			errorMsg = err.message || 'Failed to save changes';
		}

		saving = false;
	}
</script>

<svelte:head><title>Edit Game Request — {game.game_name} | CRC</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="edit-game-page">
			<p class="muted mb-2"><a href={localizeHref('/profile/submissions')}>← {m.user_menu_submissions()}</a></p>
			<h1>✏️ {m.sub_game_heading()}</h1>
			<p class="muted mb-3">Editing your game submission for <strong>{game.game_name}</strong>.</p>

			{#if game.status !== 'pending'}
				<div class="alert alert--error">This submission is no longer pending and cannot be edited.</div>
			{:else if locked}
				<div class="lock-banner">
					<span>🔒</span>
					<span>{m.submissions_locked_message()}</span>
				</div>
			{/if}

			<form class="edit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
				<!-- Game Name -->
				<div class="fg">
					<label class="fl" for="gameName">{m.submit_game_game_name()} <span class="req">*</span></label>
					<input id="gameName" type="text" class="fi" bind:value={gameName} maxlength="200" disabled={locked} />
				</div>

				<!-- Aliases -->
				<div class="fg">
					<label class="fl" for="aliases">{m.submit_game_aliases()}</label>
					<input id="aliases" type="text" class="fi" bind:value={aliases} placeholder="e.g. Sekiro, SSDT" maxlength="500" disabled={locked} />
					<p class="fh">Comma-separated short names and abbreviations.</p>
				</div>

				<!-- Description -->
				<div class="fg">
					<label class="fl" for="description">{m.submit_game_description_label()}</label>
					<textarea id="description" class="fi" bind:value={description} rows="4" maxlength="2000" disabled={locked}></textarea>
				</div>

				<!-- Cover Image URL -->
				<div class="fg">
					<label class="fl" for="cover">{m.submit_game_cover_image()}</label>
					<input id="cover" type="text" class="fi" bind:value={coverUrl} placeholder="https://..." maxlength="500" disabled={locked} />
					{#if coverUrl}
						<div class="cover-preview">
							<img src={coverUrl} alt="Cover preview" />
						</div>
					{/if}
				</div>

				<!-- Rules -->
				<div class="fg">
					<label class="fl" for="rules">{m.submit_game_suggested_rules()}</label>
					<textarea id="rules" class="fi" bind:value={rules} rows="4" maxlength="5000" disabled={locked}></textarea>
				</div>

				<!-- Submitter Notes -->
				<div class="fg">
					<label class="fl" for="notes">{m.submit_game_additional_notes()}</label>
					<textarea id="notes" class="fi" bind:value={submitterNotes} rows="3" maxlength="2000" disabled={locked}></textarea>
				</div>

				<!-- Game Data Summary (read-only) -->
				<div class="game-data-summary">
					<h3>📊 Structured Data Summary</h3>
					<p class="muted">These fields were set during your initial submission. To change categories, challenges, characters, or restrictions, please withdraw this submission and resubmit with corrections.</p>
					<div class="summary-grid">
						<div class="summary-item">
							<span class="summary-value">{categoryCount}</span>
							<span class="summary-label">Categories</span>
						</div>
						<div class="summary-item">
							<span class="summary-value">{challengeCount}</span>
							<span class="summary-label">Challenges</span>
						</div>
						<div class="summary-item">
							<span class="summary-value">{characterCount}</span>
							<span class="summary-label">Characters</span>
						</div>
						<div class="summary-item">
							<span class="summary-value">{restrictionCount}</span>
							<span class="summary-label">Restrictions</span>
						</div>
					</div>
				</div>

				{#if errorMsg}
					<div class="alert alert--error">{errorMsg}</div>
				{/if}

				<div class="form-actions">
					<a href={localizeHref('/profile/submissions')} class="btn">{m.btn_cancel()}</a>
					<button type="submit" class="btn btn--accent btn--lg" disabled={!canSave || saving}>
						{saving ? m.btn_saving() : m.btn_save_changes()}
					</button>
				</div>
			</form>
		</div>
	</div>
</AuthGuard>

<style>
	.edit-game-page { max-width: 680px; margin: 2rem auto; }
	.mb-2 { margin-bottom: 0.75rem; }
	.mb-3 { margin-bottom: 1rem; }
	.req { color: #ef4444; }

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

	.cover-preview { margin-top: 0.5rem; }
	.cover-preview img { max-width: 230px; border-radius: 8px; border: 1px solid var(--border); }

	.game-data-summary {
		background: var(--surface); border: 1px solid var(--border);
		border-radius: 12px; padding: 1.25rem;
	}
	.game-data-summary h3 { margin: 0 0 0.5rem; font-size: 1rem; }
	.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-top: 1rem; }
	.summary-item { text-align: center; }
	.summary-value { display: block; font-size: 1.5rem; font-weight: 700; color: var(--accent); }
	.summary-label { font-size: 0.75rem; color: var(--muted); }

	.form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--border); }

	.alert--error { padding: 0.75rem 1rem; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 0.9rem; }

	@media (max-width: 500px) {
		.summary-grid { grid-template-columns: repeat(2, 1fr); }
	}
</style>
