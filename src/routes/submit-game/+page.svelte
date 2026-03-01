<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_WORKER_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import { user } from '$stores/auth';
	import { checkBannedTerms } from '$lib/utils/banned-terms';

	// ── Form State ────────────────────────────────────────────────────────────
	let gameName = $state('');
	let description = $state('');
	let submitterHandle = $state('');
	let categories = $state('');
	let generalRules = $state('');
	let turnstileToken = $state('');

	let submitting = $state(false);
	let result = $state<{ ok: boolean; message: string } | null>(null);
	let turnstileReady = $state(false);
	let turnstileWidgetId = $state<string | null>(null);

	// ── Turnstile ─────────────────────────────────────────────────────────────
	onMount(() => {
		// Pre-fill submitter from auth
		if ($user?.user_metadata?.full_name) {
			submitterHandle = $user.user_metadata.full_name;
		}

		if (!document.querySelector('script[src*="turnstile"]')) {
			const script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
			script.async = true;
			document.head.appendChild(script);
		}

		(window as any).onTurnstileLoad = () => {
			turnstileReady = true;
			renderTurnstile();
		};

		if ((window as any).turnstile) {
			turnstileReady = true;
			renderTurnstile();
		}
	});

	function renderTurnstile() {
		const container = document.getElementById('turnstile-container-game');
		if (!container || !(window as any).turnstile) return;
		if (turnstileWidgetId !== null) {
			(window as any).turnstile.reset(turnstileWidgetId);
			return;
		}
		turnstileWidgetId = (window as any).turnstile.render('#turnstile-container-game', {
			sitekey: PUBLIC_TURNSTILE_SITE_KEY,
			callback: (token: string) => { turnstileToken = token; },
			'expired-callback': () => { turnstileToken = ''; },
			theme: 'auto'
		});
	}

	const bannedTermsWarning = $derived.by(() => {
		const fields = [
			{ label: 'Game name', value: gameName },
			{ label: 'Description', value: description },
			{ label: 'Categories', value: categories },
			{ label: 'Rules', value: generalRules },
			{ label: 'Submitter handle', value: submitterHandle },
		];
		for (const f of fields) {
			const result = checkBannedTerms(f.value);
			if (result) return `${f.label}: ${result}`;
		}
		return null;
	});

	let canSubmit = $derived(gameName.trim() && turnstileToken && !submitting && !bannedTermsWarning);

	async function handleSubmit() {
		if (!canSubmit) return;
		submitting = true;
		result = null;

		// Parse comma-separated categories into arrays
		const parseCsv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

		const payload = {
			game_name: gameName.trim(),
			description: description.trim() || null,
			submitter_handle: submitterHandle.trim() || null,
			submitter_user_id: $user?.id || null,
			full_run_categories: parseCsv(categories),
			general_rules: generalRules.trim() || null,
			turnstile_token: turnstileToken
		};

		try {
			const res = await fetch(`${PUBLIC_WORKER_URL}/submit-game`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (res.ok && data.ok) {
				result = { ok: true, message: 'Game submitted for review! Our team will review your request.' };
			} else {
				result = { ok: false, message: data.error || 'Submission failed. Please try again.' };
			}
		} catch {
			result = { ok: false, message: 'Network error. Please check your connection.' };
		} finally {
			submitting = false;
			if (turnstileWidgetId !== null && (window as any).turnstile) {
				(window as any).turnstile.reset(turnstileWidgetId);
				turnstileToken = '';
			}
		}
	}
</script>

<svelte:head><title>Request a Game | Challenge Run Community</title></svelte:head>

<div class="page-width">
	<div class="submit-page">
		<h1>Request a Game</h1>
		<p class="muted">Suggest a new game for the Challenge Run Community. Our team will review and set it up if approved.</p>

		{#if result}
			<div class="alert alert--{result.ok ? 'success' : 'error'}">{result.message}</div>
			{#if result.ok}
				<a href="/games" class="btn btn--outline">Browse Games</a>
			{/if}
		{/if}

		{#if !result?.ok}
			<div class="form">
				<div class="form-group">
					<label for="gameName">Game Name <span class="req">*</span></label>
					<input id="gameName" type="text" bind:value={gameName} placeholder="e.g. Hollow Knight" maxlength="200" />
				</div>

				<div class="form-group">
					<label for="description">Description</label>
					<textarea id="description" bind:value={description} placeholder="Brief description of the game and why it fits CRC..." rows="3" maxlength="1000"></textarea>
				</div>

				<div class="form-group">
					<label for="categories">Suggested Categories</label>
					<input id="categories" type="text" bind:value={categories} placeholder="e.g. Any%, No Hit, All Bosses" />
					<span class="hint">Comma-separated list of challenge categories.</span>
				</div>

				<div class="form-group">
					<label for="rules">Suggested Rules</label>
					<textarea id="rules" bind:value={generalRules} placeholder="Any rules or requirements for challenge runs..." rows="3" maxlength="2000"></textarea>
				</div>

				<div class="form-group">
					<label for="handle">Your Name</label>
					<input id="handle" type="text" bind:value={submitterHandle} placeholder="Your display name (optional)" maxlength="100" />
				</div>

				<div class="form-group turnstile-group">
					<div id="turnstile-container-game"></div>
					{#if !turnstileReady}<p class="hint">Loading verification...</p>{/if}
				</div>

				<div class="form-actions">
					{#if bannedTermsWarning}
						<div class="alert alert--error">{bannedTermsWarning}</div>
					{/if}
					<button class="btn btn--accent" style="width: 100%;" onclick={handleSubmit} disabled={!canSubmit}>
						{submitting ? 'Submitting...' : 'Submit Game Request'}
					</button>
				</div>
			</div>
		{/if}

		<div class="submit-links">
			<p>Want to submit a run instead? <a href="/submit">Submit a Run</a></p>
		</div>
	</div>
</div>

<style>
	.submit-page { max-width: 640px; margin: 2rem auto; }
	.form { margin-top: 1.5rem; }
	.form-group { margin-bottom: 1.25rem; }
	.form-group label { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
	.req { color: #ef4444; }
	.form-group input[type="text"],
	.form-group textarea {
		width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--border);
		border-radius: 6px; background: var(--surface); color: var(--fg);
		font-size: 0.95rem; font-family: inherit;
	}
	.form-group input:focus, .form-group textarea:focus {
		outline: none; border-color: var(--accent);
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
	}
	.hint { display: block; margin-top: 0.3rem; font-size: 0.8rem; color: var(--muted); }
	.turnstile-group { margin-top: 1.5rem; }
	.form-actions { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.alert { padding: 1rem 1.25rem; border-radius: 8px; margin-bottom: 1.5rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }
	.submit-links { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border); font-size: 0.9rem; }
	.submit-links a { color: var(--accent); }
</style>
