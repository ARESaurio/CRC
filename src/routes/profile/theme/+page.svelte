<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import {
		THEME_DEFAULTS, FONT_MAP, outlineShadow,
		applyCustomTheme, saveCustomThemeToStorage, clearCustomTheme
	} from '$stores/theme';
	import type { CustomTheme } from '$stores/theme';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import { browser } from '$app/environment';

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

			const res = await fetch(
				`${PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${sess.user.id}`,
				{
					method: 'PATCH',
					headers: {
						'apikey': PUBLIC_SUPABASE_ANON_KEY,
						'Authorization': `Bearer ${sess.access_token}`,
						'Content-Type': 'application/json',
						'Prefer': 'return=minimal'
					},
					body: JSON.stringify({ theme_settings: themeData })
				}
			);
			syncStatus = res.ok ? 'synced' : 'error';
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
					const res = await fetch(
						`${PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${sess.user.id}&select=theme_settings`,
						{
							headers: {
								'apikey': PUBLIC_SUPABASE_ANON_KEY,
								'Authorization': `Bearer ${sess.access_token}`
							}
						}
					);
					if (res.ok) {
						const rows = await res.json();
						if (rows.length > 0 && rows[0].theme_settings) {
							applyLoadedData(rows[0].theme_settings);
							syncStatus = 'synced';
						}
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
	<title>Theme Customization | CRC</title>
</svelte:head>

<div class="page-width">
	<h1>Theme Customization</h1>
	<p class="muted mb-3">Personalize your CRC experience. Changes show in the preview — click Save to apply.</p>

	<div class="theme-layout">
		<!-- Settings Panel -->
		<div class="theme-settings">
			<!-- Presets -->
			<div class="card">
				<h2>Preset Themes</h2>
				<p class="muted mb-2">Quick-apply a color scheme:</p>
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
				<h2>Custom Colors</h2>
				<div class="color-options">
					<div class="color-option">
						<label class="color-label">Accent Color</label>
						<p class="color-desc">Buttons, links, and highlights</p>
						<div class="color-inputs">
							<input type="color" bind:value={accentColor} oninput={markUnsaved} />
							<input type="text" bind:value={accentColor} oninput={markUnsaved} maxlength="7" class="color-hex" />
						</div>
					</div>
					<div class="color-option">
						<label class="color-label">Background</label>
						<p class="color-desc">Main page background</p>
						<div class="color-inputs">
							<input type="color" bind:value={bgColor} oninput={markUnsaved} />
							<input type="text" bind:value={bgColor} oninput={markUnsaved} maxlength="7" class="color-hex" />
						</div>
					</div>
					<div class="color-option">
						<label class="color-label">Surface</label>
						<p class="color-desc">Card and panel backgrounds</p>
						<div class="color-inputs">
							<input type="color" bind:value={surfaceColor} oninput={markUnsaved} />
							<input type="text" bind:value={surfaceColor} oninput={markUnsaved} maxlength="7" class="color-hex" />
						</div>
					</div>
				</div>
			</div>

			<!-- Font Options -->
			<div class="card">
				<h2>Font Options</h2>
				<div class="form-group">
					<label class="form-label">Font Family</label>
					<select bind:value={fontFamily} onchange={markUnsaved} class="form-input">
						{#each FONTS as font}
							<option value={font.id}>{font.name}</option>
						{/each}
					</select>
				</div>
				<div class="form-group mt-2">
					<label class="form-label">Text Outline</label>
					<p class="color-desc">Adds a subtle outline for readability on busy backgrounds</p>
					<div class="outline-options">
						{#each (['none', 'light', 'dark', 'auto'] as const) as opt}
							<label class="outline-option">
								<input type="radio" name="text-outline" value={opt} bind:group={textOutline} onchange={markUnsaved} />
								<span class="outline-btn">{opt === 'none' ? 'None' : opt === 'light' ? 'Light (white)' : opt === 'dark' ? 'Dark (black)' : 'Auto'}</span>
							</label>
						{/each}
					</div>
				</div>
			</div>

			<!-- Background Image -->
			<div class="card">
				<h2>Background Image</h2>
				<div class="form-group">
					<label class="form-label">Image URL</label>
					<input type="url" bind:value={bgImageUrl} oninput={markUnsaved} placeholder="https://example.com/image.jpg" class="form-input" />
				</div>
				{#if bgImageUrl}
					<div class="form-group mt-2">
						<label class="form-label">Opacity: {bgOpacity}%</label>
						<input type="range" min="0" max="50" bind:value={bgOpacity} oninput={markUnsaved} class="form-range" />
					</div>
				{/if}
				<div class="bg-preview">
					{#if bgImageUrl}
						<img src={bgImageUrl} alt="Background preview" style="opacity: {bgOpacity / 100}" />
					{:else}
						<span class="muted">No background image</span>
					{/if}
				</div>
				{#if bgImageUrl}
					<button class="btn btn--small mt-2" onclick={() => { bgImageUrl = ''; bgOpacity = 15; markUnsaved(); }}>Clear Background</button>
				{/if}
			</div>
		</div>

		<!-- Live Preview -->
		<div class="theme-preview">
			<div class="card">
				<h2>Live Preview</h2>
				<p class="preview-font-info muted">Font: {currentFont.name} | Outline: {textOutline}</p>
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
							<h3>Sample Content</h3>
							<p>This is how your theme will look across the site.</p>
							<button class="preview-btn" style="background: {accentColor}">Example Button</button>
							<a href={'#'} class="preview-link" style="color: {accentColor}" onclick={(e) => e.preventDefault()}>Example Link</a>
						</div>
						<div class="preview-card" style="background: {surfaceColor}">
							<h4>Card Example</h4>
							<p style="opacity:0.6;">Cards use the surface color.</p>
						</div>
						<div class="preview-tags">
							<h4>Tag Colors</h4>
							<p style="opacity:0.5; font-size:0.8rem; margin:0.25rem 0 0.5rem;">How tags appear on run tables</p>
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
								<span class="preview-tag preview-tag--verified">✓ Verified</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="theme-actions mt-3">
				<span class="sync-status sync-status--{syncStatus}">
					{#if syncStatus === 'synced'}&#9989; Saved{signedIn ? ' & synced to account' : ''}
					{:else if syncStatus === 'saving'}Saving...
					{:else if syncStatus === 'error'}&#9888;&#65039; Sync failed — saved locally
					{:else}&#9998;&#65039; {hasUnsavedChanges ? 'Unsaved changes' : (signedIn ? 'No changes' : 'Sign in to sync across devices')}
					{/if}
				</span>
				<button class="btn" onclick={resetTheme} disabled={!hasUnsavedChanges}>Reset</button>
				<button class="btn btn--primary" onclick={saveTheme} disabled={!hasUnsavedChanges && syncStatus === 'synced'}>Save Theme</button>
			</div>
		</div>
	</div>
</div>

<style>
	h1 { margin: 0 0 0.25rem; } h2 { margin: 0 0 0.75rem; } .mb-2 { margin-bottom: 0.75rem; } .mb-3 { margin-bottom: 1.25rem; } .mt-2 { margin-top: 1rem; } .mt-3 { margin-top: 1.5rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; }
	.btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
	.btn:disabled { opacity: 0.4; cursor: default; }
	.btn--primary { background: var(--accent); color: white; border-color: var(--accent); }
	.btn--primary:hover:not(:disabled) { opacity: 0.9; color: white; }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }

	.sync-status { padding: 0.35rem 0.75rem; border-radius: 8px; font-size: 0.85rem; white-space: nowrap; }
	.sync-status--synced { background: rgba(16, 185, 129, 0.1); color: #10b981; }
	.sync-status--unsaved { background: rgba(234, 179, 8, 0.1); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.2); }
	.sync-status--saving { background: rgba(234, 179, 8, 0.1); color: #eab308; }
	.sync-status--error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

	.theme-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
	.theme-settings { display: flex; flex-direction: column; gap: 1.5rem; }

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
	.form-range { width: 100%; }
	.outline-options { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
	.outline-option { cursor: pointer; }
	.outline-option input { display: none; }
	.outline-btn { padding: 0.35rem 0.75rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; display: block; }
	.outline-option input:checked + .outline-btn { background: var(--accent); border-color: var(--accent); color: white; }

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
