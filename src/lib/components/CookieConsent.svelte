<script lang="ts">
	import { consent, hasConsented, showCookieSettings } from '$stores/consent';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

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
{#if showModal}
	<div class="cookie-modal" role="dialog" aria-modal="true" aria-label="Cookie Settings">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="cookie-modal__backdrop" onclick={closeModal}></div>
		<div class="cookie-modal__dialog">
			<div class="cookie-modal__header">
				<h2>{m.cookie_settings_title()}</h2>
				<button type="button" class="cookie-modal__close" onclick={closeModal} aria-label="Close">&times;</button>
			</div>
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
						<label class="cookie-toggle-switch">
							<input type="checkbox" bind:checked={analyticsEnabled} />
							<span class="cookie-toggle-slider"></span>
						</label>
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
			<div class="cookie-modal__footer">
				<button type="button" class="cookie-modal__save" onclick={saveSettings}>{m.cookie_save_settings()}</button>
			</div>
		</div>
	</div>
{/if}

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

	/* ── Modal ──────────────────────────────────────────── */
	.cookie-modal {
		position: fixed;
		inset: 0;
		z-index: 2100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.cookie-modal__backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
	}
	.cookie-modal__dialog {
		position: relative;
		width: 90%;
		max-width: 560px;
		max-height: 85vh;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.cookie-modal__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}
	.cookie-modal__header h2 { margin: 0; font-size: 1.15rem; }
	.cookie-modal__close {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--muted);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 4px;
		transition: background 0.2s, color 0.2s;
	}
	.cookie-modal__close:hover {
		background: var(--bg);
		color: var(--fg);
	}
	.cookie-modal__body {
		padding: 1.25rem;
		overflow-y: auto;
		flex: 1;
	}
	.cookie-modal__body > p { margin: 0 0 1.25rem 0; font-size: 0.9rem; }
	.cookie-modal__footer {
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
	}
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

	/* ── Toggle Switch ──────────────────────────────────── */
	.cookie-toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
	.cookie-toggle-switch input { opacity: 0; width: 0; height: 0; }
	.cookie-toggle-slider {
		position: absolute; inset: 0; cursor: pointer;
		background: var(--border); border-radius: 24px;
		transition: background 0.2s;
	}
	.cookie-toggle-slider::before {
		content: '';
		position: absolute;
		height: 18px; width: 18px;
		left: 3px; bottom: 3px;
		background: white;
		border-radius: 50%;
		transition: transform 0.2s;
	}
	.cookie-toggle-switch input:checked + .cookie-toggle-slider { background: var(--accent); }
	.cookie-toggle-switch input:checked + .cookie-toggle-slider::before { transform: translateX(20px); }

	/* ── Responsive ─────────────────────────────────────── */
	@media (max-width: 600px) {
		.cookie-banner__content { flex-direction: column; align-items: stretch; }
		.cookie-banner__actions { justify-content: stretch; }
		.cookie-banner__btn { flex: 1; text-align: center; }
	}
</style>
