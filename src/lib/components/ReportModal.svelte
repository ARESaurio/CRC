<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { PUBLIC_WORKER_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	import * as m from '$lib/paraglide/messages';
	import { Flag, Upload, X } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { supabase } from '$lib/supabase';

	// ── Props ───────────────────────────────────────────────────────────────
	let {
		open = $bindable(false)
	}: {
		open?: boolean;
	} = $props();

	// ── Auto-detected context ────────────────────────────────────────────────
	let capturedUrl = $state('');
	let capturedAt = $state('');

	// Auto-detect report type from URL
	function detectType(pathname: string): 'run' | 'game' | 'profile' | 'other' {
		if (/\/games\/[^/]+\/runs\//.test(pathname)) return 'run';
		if (/\/games\//.test(pathname)) return 'game';
		if (/\/runners\//.test(pathname)) return 'profile';
		return 'other';
	}

	let reportType = $state<'run' | 'game' | 'profile' | 'other'>('other');

	// ── Form state ──────────────────────────────────────────────────────────
	let reason = $state('');
	let details = $state('');
	let submitting = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let turnstileToken = $state('');
	let turnstileReady = $state(false);
	let turnstileWidgetId = $state<string | null>(null);

	// ── File upload ─────────────────────────────────────────────────────────
	let selectedFile = $state<File | null>(null);
	let dragOver = $state(false);
	let uploading = $state(false);

	const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
	const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) validateAndSetFile(input.files[0]);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
	}

	function validateAndSetFile(file: File) {
		if (!ALLOWED_TYPES.includes(file.type)) {
			message = { type: 'error', text: 'Only PNG, JPEG, GIF, or WebP images allowed.' };
			return;
		}
		if (file.size > MAX_FILE_SIZE) {
			message = { type: 'error', text: 'File must be under 2MB.' };
			return;
		}
		selectedFile = file;
		message = null;
	}

	function removeFile() {
		selectedFile = null;
	}

	async function uploadFile(): Promise<string | null> {
		if (!selectedFile) return null;
		uploading = true;
		try {
			const ext = selectedFile.name.split('.').pop() || 'png';
			const path = `reports/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
			const { error } = await supabase.storage
				.from('report-attachments')
				.upload(path, selectedFile, { contentType: selectedFile.type });
			if (error) throw error;
			const { data: urlData } = supabase.storage
				.from('report-attachments')
				.getPublicUrl(path);
			return urlData.publicUrl;
		} catch (err: any) {
			console.error('File upload failed:', err);
			return null;
		} finally {
			uploading = false;
		}
	}

	let canSubmit = $derived(reason && turnstileToken && !submitting && !uploading);

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

	// Capture URL when modal opens
	$effect(() => {
		if (open) {
			capturedUrl = $page.url.pathname + $page.url.search;
			capturedAt = new Date().toISOString();
			reportType = detectType($page.url.pathname);
		}
	});

	// Render turnstile when container mounts (use: action is reliable with portals)
	function initTurnstile(container: HTMLElement) {
		function tryRender() {
			if (turnstileReady) {
				renderTurnstile(container);
			} else {
				setTimeout(tryRender, 200);
			}
		}
		tryRender();
	}

	// Reset on close
	$effect(() => {
		if (!open) {
			reason = '';
			details = '';
			message = null;
			selectedFile = null;
			turnstileToken = '';
			turnstileWidgetId = null;
		}
	});

	// ── Submit ───────────────────────────────────────────────────────────────
	async function handleSubmit() {
		if (!canSubmit) return;
		submitting = true;
		message = null;

		try {
			// Upload file if present
			let evidenceUrls: string[] = [];
			if (selectedFile) {
				const url = await uploadFile();
				if (url) evidenceUrls.push(url);
			}

			const res = await fetch(`${PUBLIC_WORKER_URL.replace(/\/$/, '')}/report`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					report_type: reportType,
					reason,
					details: details.trim(),
					page_url: capturedUrl,
					reported_at: capturedAt,
					evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
					turnstile_token: turnstileToken
				})
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to submit report');
			}

			message = { type: 'success', text: data.message || m.report_success() };
			setTimeout(() => { open = false; }, 2500);
		} catch (err: any) {
			message = { type: 'error', text: err.message || m.report_error() };
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
		{ value: 'bug', label: 'Bug or broken page' },
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

	const TYPE_LABELS: Record<string, string> = {
		run: 'Run',
		game: 'Game Page',
		profile: 'Runner Profile',
		other: 'General',
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content class="report-dialog">
			<Dialog.Header>
				<Dialog.Title><Flag size={16} style="display:inline-block;vertical-align:-0.1em;" /> Report an Issue</Dialog.Title>
			</Dialog.Header>

			<div class="report-modal__body">
				<p class="report-desc">What kind of issue are you seeing on this page?</p>

				<!-- Auto-captured context -->
				<div class="report-context">
					<span class="report-context__label">Page:</span>
					<span class="report-context__value">{capturedUrl}</span>
					<span class="report-context__badge">{TYPE_LABELS[reportType] || 'General'}</span>
				</div>

				<!-- Report type override -->
				<div class="report-field">
					<label>Issue Type</label>
					<Select.Root bind:value={reportType}>
						<Select.Trigger>{TYPE_LABELS[reportType] || 'General'}</Select.Trigger>
						<Select.Content align="start">
							<Select.Item value="run" label="Run" />
							<Select.Item value="game" label="Game Page" />
							<Select.Item value="profile" label="Runner Profile" />
							<Select.Item value="other" label="General" />
						</Select.Content>
					</Select.Root>
				</div>

				<!-- Reason -->
				<div class="report-field">
					<label>{m.report_reason_label()}</label>
					<Select.Root bind:value={reason}>
						<Select.Trigger>{reasons.find(r => r.value === reason)?.label || m.report_reason_placeholder()}</Select.Trigger>
						<Select.Content align="start">
							{#each reasons as opt}
								<Select.Item value={opt.value} label={opt.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<!-- Details -->
				<div class="report-field">
					<label for="reportDetails">{m.report_details_label()}</label>
					<textarea id="reportDetails" rows="3" bind:value={details} placeholder={m.report_details_placeholder()}></textarea>
				</div>

				<!-- File upload -->
				<div class="report-field">
					<label>Screenshot (optional)</label>
					{#if selectedFile}
						<div class="report-file">
							<span class="report-file__name">{selectedFile.name}</span>
							<span class="report-file__size">{(selectedFile.size / 1024).toFixed(0)} KB</span>
							<button type="button" class="report-file__remove" onclick={removeFile}><X size={14} /></button>
						</div>
					{:else}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="report-dropzone"
							class:report-dropzone--drag={dragOver}
							ondragover={(e) => { e.preventDefault(); dragOver = true; }}
							ondragleave={() => { dragOver = false; }}
							ondrop={handleDrop}
						>
							<Upload size={20} />
							<span>Drag & drop an image, or <label class="report-dropzone__link">browse<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onchange={handleFileSelect} hidden /></label></span>
							<span class="report-dropzone__hint">PNG, JPEG, GIF, WebP — max 2MB</span>
						</div>
					{/if}
				</div>

				<!-- Turnstile -->
				<div class="report-field report-field--captcha">
					<div use:initTurnstile></div>
				</div>

				{#if message}
					<div class="report-message report-message--{message.type}">
						{message.text}
					</div>
				{/if}
			</div>

			<Dialog.Footer>
				<Dialog.Close class="btn--muted-close">{m.btn_cancel()}</Dialog.Close>
				<Button.Root variant="accent" onclick={handleSubmit} disabled={!canSubmit}>
					{#if submitting || uploading}Submitting…{:else}{m.report_submit()}{/if}
				</Button.Root>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.report-dialog) {
		padding: 0;
		max-width: 520px;
	}
	:global(.report-dialog .dialog-close) {
		display: none;
	}
	:global(.btn--muted-close) {
		position: static;
		width: auto;
		height: auto;
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--border);
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
		font-family: inherit;
	}
	:global(.btn--muted-close:hover) {
		background: var(--bg);
		color: var(--fg);
	}
	.report-modal__body { padding: 1.25rem; }
	.report-desc { font-size: 0.95rem; color: var(--muted); margin: 0 0 1rem; }

	/* Auto-captured context */
	.report-context {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.8rem;
		overflow: hidden;
	}
	.report-context__label { color: var(--muted); white-space: nowrap; }
	.report-context__value { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-family: monospace; font-size: 0.78rem; opacity: 0.7; }
	.report-context__badge {
		background: var(--accent);
		color: #fff;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
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
		resize: vertical;
		min-height: 80px;
	}
	.report-field textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	.report-field--captcha { display: flex; justify-content: center; margin-top: 1.25rem; }

	/* File upload */
	.report-dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 1.25rem;
		border: 2px dashed var(--border);
		border-radius: 8px;
		color: var(--muted);
		font-size: 0.85rem;
		text-align: center;
		cursor: pointer;
		transition: border-color 0.2s, background 0.2s;
	}
	.report-dropzone:hover, .report-dropzone--drag {
		border-color: var(--accent);
		background: rgba(var(--accent-rgb, 99, 102, 241), 0.04);
	}
	.report-dropzone__link {
		color: var(--accent);
		cursor: pointer;
		text-decoration: underline;
	}
	.report-dropzone__hint { font-size: 0.75rem; color: var(--muted); opacity: 0.7; }
	.report-file {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.report-file__name { flex: 1; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.report-file__size { font-size: 0.75rem; color: var(--muted); }
	.report-file__remove {
		appearance: none;
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		padding: 0.2rem;
		display: flex;
	}
	.report-file__remove:hover { color: #ef4444; }

	/* Messages */
	.report-message {
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.9rem;
		margin-top: 1rem;
		text-align: center;
	}
	.report-message--success { background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); }
	.report-message--error { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
</style>
