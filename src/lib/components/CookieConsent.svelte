<script lang="ts">
	import { consent, hasConsented, showCookieSettings } from '$stores/consent';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';

	let showBanner = $state(!$hasConsented);
	let showModal = $state(false);
	let analyticsEnabled = $state(false);

	// Sync banner visibility with consent state
	consent.subscribe((value) => {
		if (value !== null) {
			showBanner = false;
		}
	});

	// Allow other components (e.g. footer) to open the settings modal
	showCookieSettings.subscribe((value) => {
		if (value) {
			openSettings();
			showCookieSettings.set(false);
		}
	});

	function openSettings() {
		const current = consent.get();
		analyticsEnabled = current?.analytics ?? false;
		showBanner = false;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		// Re-show banner if no choice was made
		if (!$hasConsented) showBanner = true;
	}

	function saveSettings() {
		consent.saveSettings(analyticsEnabled);
		showModal = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showModal) {
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Cookie Banner -->
{#if showBanner}
	<div class="cookie-banner" role="alert">
		<div class="cookie-banner__content">
			<p class="cookie-banner__text">
				{@html m.cookie_banner_text({ link_start: `<a href="${localizeHref('/legal/cookies')}">`, link_end: '</a>' })}
			</p>
			<div class="cookie-banner__actions">
				<button type="button" class="cookie-banner__btn cookie-banner__btn--settings" onclick={openSettings}>{m.cookie_manage()}</button>
				<button type="button" class="cookie-banner__btn cookie-banner__btn--reject" onclick={() => consent.rejectNonEssential()}>{m.cookie_reject()}</button>
				<button type="button" class="cookie-banner__btn cookie-banner__btn--accept" onclick={() => consent.acceptAll()}>{m.cookie_accept()}</button>
			</div>
		</div>
	</div>
{/if}

<!-- Cookie Settings Modal -->
<Dialog.Root bind:open={showModal}>
	<Dialog.Overlay />
	<Dialog.Content class="cookie-dialog">
		<Dialog.Header>
			<Dialog.Title>{m.cookie_settings_title()}</Dialog.Title>
			<Dialog.Close aria-label="Close">&times;</Dialog.Close>
		</Dialog.Header>
		<div class="cookie-modal__body">
			<p class="muted">{m.cookie_settings_desc()}</p>

			<div class="cookie-category">
				<div class="cookie-category__header">
					<div>
						<h3>{m.cookie_essential_title()}</h3>
						<p class="muted">{m.cookie_essential_desc()}</p>
					</div>
					<span class="cookie-toggle--always">{m.cookie_essential_always()}</span>
				</div>
				<div class="cookie-category__details">
					<table class="cookie-detail-table">
						<tbody>
							<tr><td><code>sb-*-auth-token</code></td><td>{m.cookie_auth_session()}</td><td>{m.cookie_7_days()}</td></tr>
							<tr><td><code>crc-theme</code></td><td>{m.cookie_theme()}</td><td>{m.cookie_persistent()}</td></tr>
						<tr><td><code>crc-custom-theme</code></td><td>{m.cookie_custom_theme()}</td><td>{m.cookie_persistent()}</td></tr>
							<tr><td><code>crc_cookie_consent</code></td><td>{m.cookie_consent_pref()}</td><td>{m.cookie_1_year()}</td></tr>
						</tbody>
					</table>
				</div>
			</div>

			<div class="cookie-category">
				<div class="cookie-category__header">
					<div>
						<h3>{m.cookie_analytics_title()}</h3>
						<p class="muted">{m.cookie_analytics_desc()}</p>
					</div>
					<Switch.Root bind:checked={analyticsEnabled} />
				</div>
				<div class="cookie-category__details">
					<table class="cookie-detail-table">
						<tbody>
							<tr><td>Cloudflare Web Analytics</td><td>{m.cookie_analytics_cf()}</td><td>{m.cookie_session()}</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
		<Dialog.Footer>
			<button type="button" class="cookie-modal__save" onclick={saveSettings}>{m.cookie_save_settings()}</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* ── Banner ─────────────────────────────────────────── */
	.cookie-banner {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 2000;
		background: var(--surface);
		border-top: 1px solid var(--border);
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
		padding: 1rem;
	}
	.cookie-banner__content {
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
	}
	.cookie-banner__text {
		flex: 1;
		min-width: 280px;
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--fg);
	}
	.cookie-banner__text a { color: var(--accent); }
	.cookie-banner__actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
		flex-wrap: wrap;
	}
	.cookie-banner__btn {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.cookie-banner__btn--accept {
		background: var(--accent);
		color: var(--bg);
		border: none;
	}
	.cookie-banner__btn--reject {
		background: transparent;
		color: var(--fg);
		border: 1px solid var(--border);
	}
	.cookie-banner__btn--settings {
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--border);
	}
	.cookie-banner__btn:hover { opacity: 0.85; }

	/* ── Modal overrides for Dialog component ──────────── */
	:global(.cookie-dialog) { max-width: 560px; }
	.cookie-modal__body {
		padding: 1.25rem;
		overflow-y: auto;
		flex: 1;
	}
	.cookie-modal__body > p { margin: 0 0 1.25rem 0; font-size: 0.9rem; }
	.cookie-modal__save {
		background: var(--accent);
		color: var(--bg);
		border: none;
		padding: 0.6rem 1.5rem;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
	}
	.cookie-modal__save:hover { opacity: 0.85; }

	/* ── Categories ─────────────────────────────────────── */
	.cookie-category {
		padding: 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		margin-bottom: 0.75rem;
	}
	.cookie-category__header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}
	.cookie-category__header h3 { margin: 0 0 0.25rem 0; font-size: 1rem; }
	.cookie-category__header p { margin: 0; font-size: 0.8rem; }
	.cookie-category__details { margin-top: 0.75rem; }
	.cookie-detail-table { width: 100%; font-size: 0.8rem; border-collapse: collapse; }
	.cookie-detail-table td { padding: 0.4rem 0.5rem; border-top: 1px solid var(--border); color: var(--muted); }
	.cookie-detail-table code { font-size: 0.75rem; background: var(--surface); padding: 0.1rem 0.3rem; border-radius: 3px; }
	.cookie-toggle--always {
		font-size: 0.75rem;
		color: var(--muted);
		font-weight: 600;
		white-space: nowrap;
		padding: 0.3rem 0.6rem;
		background: var(--surface);
		border-radius: 4px;
	}

	/* ── Responsive ─────────────────────────────────────── */
	@media (max-width: 600px) {
		.cookie-banner__content { flex-direction: column; align-items: stretch; }
		.cookie-banner__actions { justify-content: stretch; }
		.cookie-banner__btn { flex: 1; text-align: center; }
	}
</style>
