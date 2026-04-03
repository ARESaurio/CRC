<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import {
		THEME_DEFAULTS, FONT_MAP, outlineShadow,
		applyCustomTheme, saveCustomThemeToStorage
	} from '$stores/theme';
	import type { CustomTheme } from '$stores/theme';

	import { browser } from '$app/environment';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Slider from '$lib/components/ui/slider/index.js';

	let signedIn = $state(false);
	let syncStatus = $state<'synced' | 'unsaved' | 'saving' | 'error'>('unsaved');

	// ── Presets ───────────────────────────────────────────────────────────────
	const PRESETS: { id: string; name: string; accent: string; bg: string; surface: string }[] = [
		{ id: 'default', name: 'Default', accent: '#3BC36E', bg: '#0f0f0f', surface: '#0b0b0b' },
		{ id: 'pink', name: 'Pink', accent: '#E91E8C', bg: '#0f0f0f', surface: '#0b0b0b' },
		{ id: 'blue', name: 'Blue', accent: '#3B82F6', bg: '#0f0f0f', surface: '#0b0b0b' },
		{ id: 'purple', name: 'Purple', accent: '#8B5CF6', bg: '#0f0f0f', surface: '#0b0b0b' },
		{ id: 'red', name: 'Red', accent: '#EF4444', bg: '#0f0f0f', surface: '#0b0b0b' },
		{ id: 'gold', name: 'Gold', accent: '#F59E0B', bg: '#0f0f0f', surface: '#0b0b0b' },
		{ id: 'cyan', name: 'Cyan', accent: '#06B6D4', bg: '#0f0f0f', surface: '#0b0b0b' },
		{ id: 'lime', name: 'Lime', accent: '#84CC16', bg: '#0f0f0f', surface: '#0b0b0b' },
	];

	const FONTS = [
		{ id: 'system', name: 'System Default', css: 'system-ui, -apple-system, sans-serif' },
		{ id: 'inter', name: 'Inter', css: "'Inter', sans-serif" },
		{ id: 'roboto', name: 'Roboto', css: "'Roboto', sans-serif" },
		{ id: 'poppins', name: 'Poppins', css: "'Poppins', sans-serif" },
		{ id: 'montserrat', name: 'Montserrat', css: "'Montserrat', sans-serif" },
		{ id: 'nunito', name: 'Nunito', css: "'Nunito', sans-serif" },
		{ id: 'ubuntu', name: 'Ubuntu', css: "'Ubuntu', sans-serif" },
	];

	// ── Editing State (only affects preview, NOT the live site) ──────────────
	let accentColor = $state(THEME_DEFAULTS.accentColor);
	let bgColor = $state(THEME_DEFAULTS.bgColor);
	let surfaceColor = $state(THEME_DEFAULTS.surfaceColor);
	let fontFamily = $state(THEME_DEFAULTS.fontFamily);
	let textOutline = $state<CustomTheme['textOutline']>(THEME_DEFAULTS.textOutline);
	let bgImageUrl = $state(THEME_DEFAULTS.bgImageUrl);
	let bgOpacity = $state(THEME_DEFAULTS.bgOpacity);

	// ── Saved State (what's currently applied to the site) ───────────────────
	let savedTheme = $state<CustomTheme>({ ...THEME_DEFAULTS });

	// ── Derived ──────────────────────────────────────────────────────────────
	let activePreset = $derived(PRESETS.find(p => p.accent === accentColor && p.bg === bgColor && p.surface === surfaceColor)?.id || null);
	let currentFont = $derived(FONTS.find(f => f.id === fontFamily) || FONTS[0]);
	let textShadow = $derived(outlineShadow(textOutline, bgColor));

	let previewStyle = $derived(
		`--preview-accent: ${accentColor}; --preview-bg: ${bgColor}; --preview-surface: ${surfaceColor}; ` +
		`font-family: ${currentFont.css}; ` +
		`text-shadow: ${textShadow};`
	);

	let hasUnsavedChanges = $derived(
		accentColor !== savedTheme.accentColor ||
		bgColor !== savedTheme.bgColor ||
		surfaceColor !== savedTheme.surfaceColor ||
		fontFamily !== savedTheme.fontFamily ||
		textOutline !== savedTheme.textOutline ||
		bgImageUrl !== savedTheme.bgImageUrl ||
		bgOpacity !== savedTheme.bgOpacity
	);

	// ── Preset Selection ─────────────────────────────────────────────────────
	function selectPreset(preset: typeof PRESETS[0]) {
		accentColor = preset.accent;
		bgColor = preset.bg;
		surfaceColor = preset.surface;
		syncStatus = 'unsaved';
	}

	// ── Mark unsaved on any change ───────────────────────────────────────────
	function markUnsaved() {
		if (syncStatus !== 'unsaved') syncStatus = 'unsaved';
	}

	// ── Reset to last saved state ────────────────────────────────────────────
	function resetTheme() {
		accentColor = savedTheme.accentColor;
		bgColor = savedTheme.bgColor;
		surfaceColor = savedTheme.surfaceColor;
		fontFamily = savedTheme.fontFamily;
		textOutline = savedTheme.textOutline;
		bgImageUrl = savedTheme.bgImageUrl;
		bgOpacity = savedTheme.bgOpacity;
		syncStatus = 'synced';
	}

	// ── Save: apply globally + persist ───────────────────────────────────────
	async function saveTheme() {
		const themeData: CustomTheme = { accentColor, bgColor, surfaceColor, fontFamily, textOutline, bgImageUrl, bgOpacity };

		// Apply to the live site immediately
		saveCustomThemeToStorage(themeData);

		// Update saved state
		savedTheme = { ...themeData };

		if (!signedIn) {
			syncStatus = 'synced';
			return;
		}

		// Persist to Supabase
		syncStatus = 'saving';
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) { syncStatus = 'error'; return; }

			const { error } = await supabase
				.from('profiles')
				.update({ theme_settings: themeData })
				.eq('user_id', sess.user.id);
			syncStatus = !error ? 'synced' : 'error';
		} catch {
			syncStatus = 'error';
		}
	}

	// ── Load saved theme on mount ────────────────────────────────────────────
	function applyLoadedData(data: Partial<CustomTheme>) {
		accentColor = data.accentColor || THEME_DEFAULTS.accentColor;
		bgColor = data.bgColor || THEME_DEFAULTS.bgColor;
		surfaceColor = data.surfaceColor || THEME_DEFAULTS.surfaceColor;
		fontFamily = data.fontFamily || THEME_DEFAULTS.fontFamily;
		textOutline = data.textOutline || THEME_DEFAULTS.textOutline;
		bgImageUrl = data.bgImageUrl || THEME_DEFAULTS.bgImageUrl;
		bgOpacity = data.bgOpacity ?? THEME_DEFAULTS.bgOpacity;
		savedTheme = { accentColor, bgColor, surfaceColor, fontFamily, textOutline, bgImageUrl, bgOpacity };
	}

	async function loadSavedTheme() {
		// Try localStorage first
		if (browser) {
			const saved = localStorage.getItem('crc-custom-theme');
			if (saved) {
				try {
					applyLoadedData(JSON.parse(saved));
				} catch { /* ignore */ }
			}
		}

		// Try Supabase if signed in (overwrites localStorage values)
		if (signedIn) {
			try {
				const { data: { session: sess } } = await supabase.auth.getSession();
				if (sess) {
					const { data: profile } = await supabase
						.from('profiles')
						.select('theme_settings')
						.eq('user_id', sess.user.id)
						.maybeSingle();
					if (profile?.theme_settings) {
						applyLoadedData(profile.theme_settings);
						syncStatus = 'synced';
					}
				}
			} catch { /* ignore */ }
		}
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				signedIn = !!sess;
				await loadSavedTheme();
				if (savedTheme.accentColor !== THEME_DEFAULTS.accentColor ||
					savedTheme.fontFamily !== THEME_DEFAULTS.fontFamily) {
					syncStatus = 'synced';
				}
			}
		});
		return unsub;
	});
</script>

<svelte:head>
	<title>{m.theme_page_title()}</title>
</svelte:head>

<div class="page-width">
	<h1>{m.theme_heading()}</h1>
	<p class="muted mb-3">{m.theme_desc()}</p>

	<div class="theme-layout">
		<!-- Settings Panel -->
		<div class="theme-settings">
			<!-- Presets -->
			<div class="card">
				<h2>{m.theme_presets()}</h2>
				<p class="muted mb-2">{m.theme_presets_desc()}</p>
				<div class="preset-grid">
					{#each PRESETS as preset}
						<button
							class="preset-btn"
							class:active={activePreset === preset.id}
							onclick={() => selectPreset(preset)}
							title={preset.name}
						>
							<span class="preset-swatch" style="background: {preset.accent}"></span>
							<span class="preset-name">{preset.name}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Custom Colors -->
			<div class="card">
				<h2>{m.theme_custom_colors()}</h2>
				<div class="color-options">
					<div class="color-option">
						<label class="color-label">{m.theme_accent()}</label>
						<p class="color-desc">{m.theme_accent_desc()}</p>
						<div class="color-inputs">
							<input type="color" bind:value={accentColor} oninput={markUnsaved} />
							<input type="text" bind:value={accentColor} oninput={markUnsaved} maxlength="7" class="color-hex" />
						</div>
					</div>
					<div class="color-option">
						<label class="color-label">{m.theme_background()}</label>
						<p class="color-desc">{m.theme_background_desc()}</p>
						<div class="color-inputs">
							<input type="color" bind:value={bgColor} oninput={markUnsaved} />
							<input type="text" bind:value={bgColor} oninput={markUnsaved} maxlength="7" class="color-hex" />
						</div>
					</div>
					<div class="color-option">
						<label class="color-label">{m.theme_surface()}</label>
						<p class="color-desc">{m.theme_surface_desc()}</p>
						<div class="color-inputs">
							<input type="color" bind:value={surfaceColor} oninput={markUnsaved} />
							<input type="text" bind:value={surfaceColor} oninput={markUnsaved} maxlength="7" class="color-hex" />
						</div>
					</div>
				</div>
			</div>

			<!-- Font Options -->
			<div class="card">
				<h2>{m.theme_font_options()}</h2>
				<div class="form-group">
					<label class="form-label">{m.theme_font_family()}</label>
					<Select.Root bind:value={fontFamily} onValueChange={() => markUnsaved()}>
						<Select.Trigger>{currentFont.name}</Select.Trigger>
						<Select.Content>
							{#each FONTS as font}
								<Select.Item value={font.id} label={font.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="form-group mt-2">
					<label class="form-label">{m.theme_text_outline()}</label>
					<p class="color-desc">{m.theme_text_outline_desc()}</p>
					<div class="outline-options">
						<ToggleGroup.Root bind:value={textOutline} onValueChange={() => markUnsaved()}>
							{#each (['none', 'light', 'dark', 'auto'] as const) as opt}
								<ToggleGroup.Item value={opt}>{opt === 'none' ? m.theme_outline_none() : opt === 'light' ? m.theme_outline_light() : opt === 'dark' ? m.theme_outline_dark() : m.theme_outline_auto()}</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</div>
				</div>
			</div>

			<!-- Background Image -->
			<div class="card">
				<h2>{m.theme_bg_image()}</h2>
				<div class="form-group">
					<label class="form-label">{m.theme_bg_url()}</label>
					<input type="url" bind:value={bgImageUrl} oninput={markUnsaved} placeholder={m.theme_bg_url_placeholder()} class="form-input" />
				</div>
				{#if bgImageUrl}
					<div class="form-group mt-2">
						<label class="form-label">{m.theme_bg_opacity({ value: String(bgOpacity) })}</label>
						<Slider.Root value={[bgOpacity]} min={0} max={50} step={1} onValueChange={(v: number[]) => { bgOpacity = v[0]; markUnsaved(); }} class="form-range" />
					</div>
				{/if}
				<div class="bg-preview">
					{#if bgImageUrl}
						<img src={bgImageUrl} alt="Background preview" style="opacity: {bgOpacity / 100}" />
					{:else}
						<span class="muted">{m.theme_no_bg()}</span>
					{/if}
				</div>
				{#if bgImageUrl}
					<Button.Root size="sm" class="mt-2" onclick={() => { bgImageUrl = ''; bgOpacity = 15; markUnsaved(); }}>{m.theme_clear_bg()}</Button.Root>
				{/if}
			</div>
		</div>

		<!-- Live Preview -->
		<div class="theme-preview">
			<div class="card">
				<h2>{m.theme_preview()}</h2>
				<p class="preview-font-info muted">{m.theme_preview_font({ font: currentFont.name, outline: textOutline })}</p>
				<div class="preview-box" style={previewStyle}>
					{#if bgImageUrl}
						<div class="preview-bg-image" style="background-image: url('{bgImageUrl}'); opacity: {bgOpacity / 100};"></div>
					{/if}
					<div class="preview-inner">
						<div class="preview-header">
							<span class="preview-brand" style="color: {accentColor}">CRC</span>
							<span class="preview-nav">Games | Runners | Teams</span>
						</div>
						<div class="preview-content">
							<h3>{m.theme_preview_sample()}</h3>
							<p>{m.theme_preview_desc()}</p>
							<button class="preview-btn" style="background: {accentColor}">{m.theme_preview_button()}</button>
							<a href={'#'} class="preview-link" style="color: {accentColor}" onclick={(e) => e.preventDefault()}>{m.theme_preview_link()}</a>
						</div>
						<div class="preview-card" style="background: {surfaceColor}">
							<h4>{m.theme_preview_card()}</h4>
							<p style="opacity:0.6;">{m.theme_preview_card_desc()}</p>
						</div>
						<div class="preview-tags">
							<h4>{m.theme_preview_tags()}</h4>
							<p style="opacity:0.5; font-size:0.8rem; margin:0.25rem 0 0.5rem;">{m.theme_preview_tags_desc()}</p>
							<div class="preview-tags__row">
								<span class="preview-tag preview-tag--challenge">Deathless</span>
								<span class="preview-tag preview-tag--challenge">No Hit</span>
							</div>
							<div class="preview-tags__row">
								<span class="preview-tag preview-tag--restriction">No Boons</span>
								<span class="preview-tag preview-tag--restriction">No Keepsakes</span>
							</div>
							<div class="preview-tags__row">
								<span class="preview-tag preview-tag--glitch">Glitchless</span>
							</div>
							<div class="preview-tags__row">
								<span class="preview-tag preview-tag--verified">âœ“ Verified</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="theme-actions mt-3">
				<span class="sync-status sync-status--{syncStatus}">
					{#if syncStatus === 'synced'}&#9989; {signedIn ? m.theme_saved_synced() : m.theme_saved()}
					{:else if syncStatus === 'saving'}{m.theme_saving()}
					{:else if syncStatus === 'error'}&#9888;&#65039; {m.theme_sync_failed()}
					{:else}&#9998;&#65039; {hasUnsavedChanges ? m.theme_unsaved() : (signedIn ? m.theme_no_changes() : m.theme_sign_in_sync())}
					{/if}
				</span>
				<Button.Root onclick={resetTheme} disabled={!hasUnsavedChanges}>{m.btn_reset()}</Button.Root>
				<Button.Root variant="accent" onclick={saveTheme} disabled={!hasUnsavedChanges && syncStatus === 'synced'}>{m.theme_save()}</Button.Root>
			</div>

		</div>
	</div>
</div>

<style>
	h1 { margin: 0 0 0.25rem; } h2 { margin: 0 0 0.75rem; } .mb-2 { margin-bottom: 0.75rem; } .mb-3 { margin-bottom: 1.25rem; } .mt-2 { margin-top: 1rem; } .mt-3 { margin-top: 1.5rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
	.btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

	.sync-status { padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.85rem; white-space: nowrap; }
	.sync-status--synced { background: rgba(16, 185, 129, 0.1); color: #10b981; }
	.sync-status--unsaved { background: rgba(234, 179, 8, 0.1); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.2); }
	.sync-status--saving { background: rgba(234, 179, 8, 0.1); color: #eab308; }
	.sync-status--error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

	.theme-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
	.theme-settings { display: flex; flex-direction: column; gap: 1rem; }
	.theme-settings .card { margin: 0; }

	/* Presets */
	.preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
	.preset-btn { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; padding: 0.75rem 0.5rem; background: var(--bg); border: 2px solid var(--border); border-radius: 10px; cursor: pointer; transition: all 0.15s; }
	.preset-btn:hover { border-color: var(--accent); transform: translateY(-1px); }
	.preset-btn.active { border-color: var(--accent); background: rgba(255, 255, 255, 0.04); }
	.preset-swatch { width: 28px; height: 28px; border-radius: 50%; }
	.preset-name { font-size: 0.75rem; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); }

	/* Colors */
	.color-options { display: flex; flex-direction: column; gap: 1rem; }
	.color-label { font-weight: 600; font-size: 0.9rem; }
	.color-desc { font-size: 0.8rem; color: var(--muted); margin: 0.15rem 0 0.5rem; }
	.color-inputs { display: flex; gap: 0.5rem; align-items: center; }
	.color-inputs input[type="color"] { width: 40px; height: 36px; border: 1px solid var(--border); border-radius: 6px; padding: 2px; cursor: pointer; background: var(--bg); }
	.color-hex { width: 90px; padding: 0.4rem; font-family: monospace; font-size: 0.85rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); }

	/* Font */
	.form-label { font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 0.35rem; }
	.form-input { width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg); font-size: 0.9rem; }
	:global(.form-range.ui-slider) { width: 100%; }
	.outline-options { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }

	/* Background */
	.bg-preview { margin-top: 0.75rem; height: 120px; border-radius: 8px; border: 1px solid var(--border); overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--bg); }
	.bg-preview img { width: 100%; height: 100%; object-fit: cover; }

	/* Preview */
	.theme-preview { position: sticky; top: 5.5rem; align-self: start; }
	.preview-font-info { font-size: 0.8rem; margin-bottom: 0.75rem; }
	.preview-box { border-radius: 12px; border: 1px solid var(--border); padding: 0; color: #e0e0e0; overflow: hidden; position: relative; background: var(--preview-bg); }
	.preview-bg-image { position: absolute; inset: 0; background-size: cover; background-position: center; pointer-events: none; }
	.preview-inner { position: relative; padding: 1.25rem; }
	.preview-header { display: flex; justify-content: space-between; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
	.preview-brand { font-weight: 800; font-size: 1.25rem; }
	.preview-nav { font-size: 0.85rem; opacity: 0.6; }
	.preview-content h3 { margin: 0 0 0.5rem; } .preview-content p { margin: 0 0 0.75rem; opacity: 0.7; font-size: 0.9rem; }
	.preview-btn { border: none; color: white; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; margin-right: 0.75rem; }
	.preview-link { text-decoration: none; font-size: 0.85rem; }
	.preview-card { padding: 1rem; border-radius: 8px; margin-top: 1rem; }
	.preview-card h4 { margin: 0 0 0.35rem; } .preview-card p { margin: 0; font-size: 0.85rem; }

	/* Tag color previews */
	.preview-tags { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.08); }
	.preview-tags h4 { margin: 0; }
	.preview-tags__row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem; }
	.preview-tag { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; }
	.preview-tag--challenge { background: rgba(99, 102, 241, 0.12); color: #818cf8; }
	.preview-tag--restriction { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
	.preview-tag--glitch { background: rgba(16, 185, 129, 0.12); color: #10b981; }
	.preview-tag--verified { background: rgba(56, 189, 248, 0.12); color: #38bdf8; }

	.theme-actions { display: flex; gap: 0.75rem; align-items: center; }
	.theme-actions .sync-status { margin-right: auto; }

	@media (max-width: 768px) {
		.theme-layout { grid-template-columns: 1fr; }
		.theme-preview { position: static; }
		.preset-grid { grid-template-columns: repeat(4, 1fr); }
	}
</style>
