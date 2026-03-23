<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_WORKER_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import * as m from '$lib/paraglide/messages';
	import { Flag, X, Send, CheckCircle } from 'lucide-svelte';

	// ── Props ───────────────────────────────────────────────────────────────
	let {
		reportType = 'run',
		contentId = '',
		gameId = '',
		reportedUserId = '',
		open = $bindable(false)
	}: {
		reportType?: 'run' | 'game' | 'profile' | 'other';
		contentId?: string;
		gameId?: string;
		reportedUserId?: string;
		open?: boolean;
	} = $props();

	// ── State ───────────────────────────────────────────────────────────────
	let reason = $state('');
	let details = $state('');
	let submitting = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let turnstileToken = $state('');
	let turnstileReady = $state(false);
	let turnstileWidgetId = $state<string | null>(null);

	let canSubmit = $derived(reason && turnstileToken && !submitting);

	// ── Turnstile ───────────────────────────────────────────────────────────
	onMount(() => {
		if (!document.querySelector('script[src*="turnstile"]')) {
			const script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
			script.async = true;
			document.head.appendChild(script);
		}

		(window as any).onTurnstileLoad = () => {
			turnstileReady = true;
		};

		if ((window as any).turnstile) {
			turnstileReady = true;
		}
	});

	function renderTurnstile(container: HTMLElement) {
		if (!(window as any).turnstile) return;
		if (turnstileWidgetId !== null) {
			(window as any).turnstile.reset(turnstileWidgetId);
			return;
		}
		turnstileWidgetId = (window as any).turnstile.render(container, {
			sitekey: PUBLIC_TURNSTILE_SITE_KEY,
			callback: (token: string) => { turnstileToken = token; },
			'expired-callback': () => { turnstileToken = ''; },
			theme: 'auto'
		});
	}

	// ── Render turnstile when modal opens ────────────────────────────────────
	$effect(() => {
		if (open && turnstileReady) {
			// Wait for the DOM to render the container
			requestAnimationFrame(() => {
				const container = document.getElementById('report-turnstile-container');
				if (container) renderTurnstile(container);
			});
		}
	});

	// ── Actions ──────────────────────────────────────────────────────────────
	function close() {
		open = false;
		// Reset on close
		reason = '';
		details = '';
		message = null;
		turnstileToken = '';
		if (turnstileWidgetId !== null && (window as any).turnstile) {
			(window as any).turnstile.reset(turnstileWidgetId);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}

	async function handleSubmit() {
		if (!canSubmit) return;
		submitting = true;
		message = null;

		try {
			const res = await fetch(`${PUBLIC_WORKER_URL.replace(/\/$/, '')}/report`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					report_type: reportType,
					content_id: contentId,
					game_id: gameId,
					reported_user_id: reportedUserId,
					reason,
					details: details.trim(),
					turnstile_token: turnstileToken
				})
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to submit report');
			}

			message = { type: 'success', text: data.message || m.report_success() };
			setTimeout(close, 2500);
		} catch (err: any) {
			message = { type: 'error', text: err.message || m.report_error() };
			// Reset turnstile on error
			if (turnstileWidgetId !== null && (window as any).turnstile) {
				(window as any).turnstile.reset(turnstileWidgetId);
				turnstileToken = '';
			}
		} finally {
			submitting = false;
		}
	}

	// ── Reason options ───────────────────────────────────────────────────────
	const runReasons = [
		{ value: 'invalid_run', label: m.report_reason_invalid_run() },
		{ value: 'wrong_category', label: m.report_reason_wrong_category() },
		{ value: 'wrong_challenge', label: m.report_reason_wrong_challenge() },
		{ value: 'video_unavailable', label: m.report_reason_video_unavailable() },
		{ value: 'cheating_suspected', label: m.report_reason_cheating() }
	];
	const gameReasons = [
		{ value: 'incorrect_game_info', label: m.report_reason_incorrect_info() }
	];
	const profileReasons = [
		{ value: 'inappropriate_content', label: m.report_reason_inappropriate() },
		{ value: 'impersonation', label: m.report_reason_impersonation() },
		{ value: 'harassment', label: m.report_reason_harassment() }
	];
	const sharedReasons = [
		{ value: 'spam', label: m.report_reason_spam() },
		{ value: 'other', label: m.report_reason_other() }
	];

	const TYPE_REASONS: Record<string, typeof sharedReasons> = {
		run: runReasons,
		game: gameReasons,
		profile: profileReasons,
		other: [],
	};

	let reasons = $derived([
		...(TYPE_REASONS[reportType] || []),
		...sharedReasons
	]);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="report-modal" role="dialog" aria-modal="true" aria-label={m.report_title()}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="report-modal__backdrop" onclick={close}></div>
		<div class="report-modal__content">
			<div class="report-modal__header">
				<h3>{m.report_title()}</h3>
				<button type="button" class="report-modal__close" onclick={close} aria-label="Close">&times;</button>
			</div>

			<div class="report-modal__body">
				<p class="muted">{m.report_desc()}</p>

				<div class="report-field">
					<label for="reportReason">{m.report_reason_label()}</label>
					<select id="reportReason" bind:value={reason}>
						<option value="">{m.report_reason_placeholder()}</option>
						{#each reasons as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>

				<div class="report-field">
					<label for="reportDetails">{m.report_details_label()}</label>
					<textarea id="reportDetails" rows="3" bind:value={details} placeholder={m.report_details_placeholder()}></textarea>
				</div>

				<div class="report-field report-field--captcha">
					<div id="report-turnstile-container"></div>
				</div>

				{#if message}
					<div class="report-message report-message--{message.type}">
						{message.text}
					</div>
				{/if}
			</div>

			<div class="report-modal__footer">
				<button type="button" class="btn btn--muted" onclick={close}>{m.btn_cancel()}</button>
				<button type="button" class="btn btn--primary" onclick={handleSubmit} disabled={!canSubmit}>
					{submitting ? m.report_submitting() : m.report_submit()}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.report-modal {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.report-modal__backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(2px);
	}
	.report-modal__content {
		position: relative;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		max-width: 480px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}
	.report-modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.report-modal__header h3 { margin: 0; font-size: 1.1rem; font-weight: 600; }
	.report-modal__close {
		background: none;
		border: none;
		font-size: 1.75rem;
		line-height: 1;
		cursor: pointer;
		color: var(--muted);
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: background 0.2s, color 0.2s;
	}
	.report-modal__close:hover { background: var(--bg); color: var(--fg); }
	.report-modal__body { padding: 1.25rem; }
	.report-modal__body > p { margin: 0 0 1.25rem 0; font-size: 0.9rem; }
	.report-modal__footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
	}

	/* Fields */
	.report-field { margin-bottom: 1rem; }
	.report-field label {
		display: block;
		margin-bottom: 0.4rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--fg);
	}
	.report-field select,
	.report-field textarea {
		width: 100%;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		font-size: 0.95rem;
		font-family: inherit;
		transition: border-color 0.2s;
	}
	.report-field select:focus,
	.report-field textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	.report-field textarea { resize: vertical; min-height: 80px; }
	.report-field--captcha { display: flex; justify-content: center; margin-top: 1.25rem; }

	/* Message */
	.report-message {
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.9rem;
		margin-top: 1rem;
		text-align: center;
	}
	.report-message--success { background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); }
	.report-message--error { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

	/* Button overrides for this context */
	.btn--muted {
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--border);
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.btn--primary {
		background: var(--accent);
		color: var(--bg);
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn--primary:hover:not(:disabled) { opacity: 0.85; }
</style>
