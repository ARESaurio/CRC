<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Save, Undo2 } , X } from 'lucide-svelte';
	import { tick } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { slugify } from './_helpers.js';
	import type { Game } from '$types';

	const CROP_W = 460;
	const CROP_H = 215;

	let {
		gameName = $bindable(),
		aliases = $bindable(),
		aliasInput = $bindable(),
		gameStatus = $bindable(),
		timingMethod = $bindable(),
		genres = $bindable(),
		platforms = $bindable(),
		cover = $bindable(),
		coverPosition = $bindable(),
		isModded = $bindable(),
		baseGame = $bindable(),
		canEdit,
		canEditMeta,
		saving,
		gameId,
		onSave,
		onReset,
		showToast,
	}: {
		gameName: string;
		aliases: string[];
		aliasInput: string;
		gameStatus: string;
		timingMethod: string;
		genres: string[];
		platforms: string[];
		cover: string;
		coverPosition: string;
		isModded: boolean;
		baseGame: string;
		canEdit: boolean;
		canEditMeta: boolean;
		saving: boolean;
		gameId: string;
		onSave: () => void;
		onReset: () => void;
		showToast: (type: 'success' | 'error', text: string) => void;
	} = $props();

	// Cover upload + crop state
	let coverUploading = $state(false);
	let cropModalOpen = $state(false);
	let cropImg = $state<HTMLImageElement | null>(null);
	let cropCanvas = $state<HTMLCanvasElement | null>(null);
	let cropX = $state(0);
	let cropY = $state(0);
	let cropZoom = $state(1);
	let cropDragging = $state(false);
	let cropDragStart = $state({ x: 0, y: 0, cx: 0, cy: 0 });
	let cropOriginalFile = $state<File | null>(null);

	// ── Base game search (for modded game linking) ──
	let baseGameSearch = $state('');
	let baseGameResults = $state<{ game_id: string; game_name: string }[]>([]);
	let baseGameDropdownOpen = $state(false);
	let baseGameSearching = $state(false);
	let baseGameDisplayName = $state('');

	// Load display name for existing base_game on mount
	$effect(() => {
		if (baseGame && !baseGameDisplayName) {
			supabase.from('games').select('game_name').eq('game_id', baseGame).maybeSingle()
				.then(({ data }) => { if (data) baseGameDisplayName = data.game_name; });
		}
		if (!baseGame) baseGameDisplayName = '';
	});

	async function searchBaseGames() {
		const q = baseGameSearch.trim();
		if (q.length < 2) { baseGameResults = []; return; }
		baseGameSearching = true;
		const { data } = await supabase
			.from('games')
			.select('game_id, game_name')
			.ilike('game_name', `%${q}%`)
			.neq('game_id', gameId)
			.order('game_name')
			.limit(10);
		baseGameResults = data || [];
		baseGameDropdownOpen = baseGameResults.length > 0;
		baseGameSearching = false;
	}

	function selectBaseGame(g: { game_id: string; game_name: string }) {
		baseGame = g.game_id;
		baseGameDisplayName = g.game_name;
		baseGameSearch = '';
		baseGameResults = [];
		baseGameDropdownOpen = false;
	}

	function clearBaseGame() {
		baseGame = '';
		baseGameDisplayName = '';
		baseGameSearch = '';
	}

	function handleCoverFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			showToast('error', 'Only JPEG, PNG, and WebP images are allowed.');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			showToast('error', 'File must be under 5MB.');
			return;
		}
		cropOriginalFile = file;
		const img = new Image();
		img.onload = async () => {
			cropImg = img;
			const scaleW = CROP_W / img.width;
			const scaleH = CROP_H / img.height;
			cropZoom = Math.max(scaleW, scaleH);
			cropX = (CROP_W - img.width * cropZoom) / 2;
			cropY = (CROP_H - img.height * cropZoom) / 2;
			cropModalOpen = true;
			await tick();
			drawCrop();
		};
		img.src = URL.createObjectURL(file);
		input.value = '';
	}

	function drawCrop() {
		if (!cropCanvas || !cropImg) return;
		const ctx = cropCanvas.getContext('2d');
		if (!ctx) return;
		cropCanvas.width = CROP_W;
		cropCanvas.height = CROP_H;
		ctx.clearRect(0, 0, CROP_W, CROP_H);
		ctx.fillStyle = '#111';
		ctx.fillRect(0, 0, CROP_W, CROP_H);
		ctx.drawImage(cropImg, cropX, cropY, cropImg.width * cropZoom, cropImg.height * cropZoom);
	}

	function handleCropMouseDown(e: MouseEvent) {
		cropDragging = true;
		cropDragStart = { x: e.clientX, y: e.clientY, cx: cropX, cy: cropY };
	}

	function handleCropMouseMove(e: MouseEvent) {
		if (!cropDragging) return;
		cropX = cropDragStart.cx + (e.clientX - cropDragStart.x);
		cropY = cropDragStart.cy + (e.clientY - cropDragStart.y);
		drawCrop();
	}

	function handleCropMouseUp() { cropDragging = false; }

	function handleCropZoom(e: Event) {
		const val = parseFloat((e.target as HTMLInputElement).value);
		if (!cropImg) return;
		const oldZoom = cropZoom;
		cropZoom = val;
		const cx = CROP_W / 2;
		const cy = CROP_H / 2;
		cropX = cx - (cx - cropX) * (cropZoom / oldZoom);
		cropY = cy - (cy - cropY) * (cropZoom / oldZoom);
		drawCrop();
	}

	function closeCropModal() {
		cropModalOpen = false;
		cropImg = null;
		cropOriginalFile = null;
	}

	async function confirmCropAndUpload() {
		if (!cropCanvas || !cropImg) return;
		coverUploading = true;
		try {
			const blob = await new Promise<Blob | null>((resolve) => {
				cropCanvas!.toBlob(resolve, 'image/webp', 0.85);
			});
			if (!blob) { showToast('error', 'Failed to process image.'); coverUploading = false; return; }

			const { error: uploadErr } = await supabase.storage
				.from('game-covers')
				.upload(`${gameId}.webp`, blob, { contentType: 'image/webp', upsert: true });

			if (uploadErr) { showToast('error', `Upload failed: ${uploadErr.message}`); coverUploading = false; return; }

			const { data: urlData } = supabase.storage.from('game-covers').getPublicUrl(`${gameId}.webp`);
			cover = urlData.publicUrl + '?v=' + Date.now();
			coverPosition = 'center';
			closeCropModal();
			showToast('success', 'Cover uploaded! Click "Save General" to apply.');
		} catch (err: any) {
			showToast('error', `Upload error: ${err?.message || 'Unknown'}`);
		}
		coverUploading = false;
	}

	async function uploadOriginalFile() {
		if (!cropOriginalFile) return;
		coverUploading = true;
		try {
			const ext = cropOriginalFile.type === 'image/png' ? 'png' : cropOriginalFile.type === 'image/webp' ? 'webp' : 'jpg';
			const filePath = `${gameId}.${ext}`;

			const { error: uploadErr } = await supabase.storage
				.from('game-covers')
				.upload(filePath, cropOriginalFile, { contentType: cropOriginalFile.type, upsert: true });

			if (uploadErr) { showToast('error', `Upload failed: ${uploadErr.message}`); coverUploading = false; return; }

			const { data: urlData } = supabase.storage.from('game-covers').getPublicUrl(filePath);
			cover = urlData.publicUrl + '?v=' + Date.now();
			coverPosition = 'center';
			closeCropModal();
			showToast('success', 'Cover uploaded (original). Click "Save General" to apply.');
		} catch (err: any) {
			showToast('error', `Upload error: ${err?.message || 'Unknown'}`);
		}
		coverUploading = false;
	}
</script>

<section class="editor-section">
	<div class="field-row">
		<label class="field-label">{m.ge_general_game_name()}</label>
		<input type="text" class="field-input" bind:value={gameName} disabled={!canEditMeta} />
	</div>
	<div class="field-row">
		<label class="field-label">{m.ge_general_status()}</label>
		<select class="field-input" bind:value={gameStatus} disabled={!canEditMeta}>
			<option value="Active">{m.ge_general_active()}</option>
			<option value="Inactive">{m.ge_general_inactive()}</option>
			<option value="Coming Soon">{m.ge_general_coming_soon()}</option>
			<option value="Community Review">Community Review</option>
		</select>
	</div>
	<div class="field-row">
		<label class="field-label">{m.ge_general_timing()}</label>
		<input type="text" class="field-input" bind:value={timingMethod} placeholder="e.g. in-game timer, real-time" disabled={!canEdit} />
	</div>
	<div class="field-row">
		<label class="field-label">{m.ge_general_cover()}</label>
		{#if cover}
			<div class="cover-preview">
				<div class="cover-preview__img" style="background-image: url('{cover}'); background-position: {coverPosition || 'center'};"></div>
				<div class="cover-preview__actions">
					{#if canEdit}
						<label class="btn btn--small cover-upload-btn">
							📷 Replace
							<input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleCoverFileSelect} hidden />
						</label>
						<button class="btn btn--small btn--reset" onclick={() => { cover = ''; coverPosition = ''; }}>✕ Remove</button>
					{/if}
				</div>
			</div>
		{:else}
			<div class="cover-empty">
				{#if canEdit}
					<label class="cover-empty__upload">
						<span class="cover-empty__icon">📷</span>
						<span>{m.ge_general_upload_hint()}</span>
						<input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleCoverFileSelect} hidden />
					</label>
				{:else}
					<span class="muted">{m.ge_general_no_cover()}</span>
				{/if}
			</div>
		{/if}
		<span class="field-hint">{m.ge_general_cover_hint()}</span>
	</div>
	<div class="field-row">
		<label class="field-label">{m.ge_general_aliases()}</label>
		<div class="tag-editor" class:tag-editor--disabled={!canEdit}>
			{#each aliases as alias, i}
				<span class="tag-pill">{alias} {#if canEdit}<button class="tag-pill__x" onclick={() => { aliases = aliases.filter((_, j) => j !== i); }}><X size={14} /></button>{/if}</span>
			{/each}
			{#if canEdit}
				<input type="text" class="tag-editor__input" bind:value={aliasInput} placeholder="Add alias + Enter"
					onkeydown={(e) => { if (e.key === 'Enter' && aliasInput.trim()) { aliases = [...aliases, aliasInput.trim()]; aliasInput = ''; e.preventDefault(); } }} />
			{/if}
		</div>
	</div>
	<div class="field-row">
		<label class="field-label">{m.ge_general_genres()}</label>
		<div class="tag-editor" class:tag-editor--disabled={!canEdit}>
			{#each genres as genre, i}
				<span class="tag-pill">{genre} {#if canEdit}<button class="tag-pill__x" onclick={() => { genres = genres.filter((_, j) => j !== i); }}><X size={14} /></button>{/if}</span>
			{/each}
			{#if canEdit}
				<input type="text" class="tag-editor__input" placeholder="Add genre + Enter"
					onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { genres = [...genres, slugify(t.value.trim())]; t.value = ''; e.preventDefault(); } }} />
			{/if}
		</div>
	</div>
	<div class="field-row">
		<label class="field-label">{m.ge_general_platforms()}</label>
		<div class="tag-editor" class:tag-editor--disabled={!canEdit}>
			{#each platforms as plat, i}
				<span class="tag-pill">{plat} {#if canEdit}<button class="tag-pill__x" onclick={() => { platforms = platforms.filter((_, j) => j !== i); }}><X size={14} /></button>{/if}</span>
			{/each}
			{#if canEdit}
				<input type="text" class="tag-editor__input" placeholder="Add platform slug + Enter"
					onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { platforms = [...platforms, slugify(t.value.trim())]; t.value = ''; e.preventDefault(); } }} />
			{/if}
		</div>
	</div>
	<div class="field-row">
		<label class="field-label">Modded Game</label>
		<div class="modded-toggle">
			<label class="toggle-label">
				<input type="checkbox" bind:checked={isModded} disabled={!canEditMeta} />
				<span>This is a modded version of another game</span>
			</label>
		</div>
		{#if isModded}
			<div class="base-game-picker">
				{#if baseGame && baseGameDisplayName}
					<div class="base-game-selected">
						<span class="base-game-selected__name">🔗 {baseGameDisplayName}</span>
						<span class="base-game-selected__id muted">({baseGame})</span>
						{#if canEditMeta}
							<button type="button" class="btn btn--small btn--reset" onclick={clearBaseGame}><X size={14} /></button>
						{/if}
					</div>
				{:else}
					<div class="base-game-search">
						<input
							type="text"
							class="field-input"
							placeholder="Search for base game..."
							bind:value={baseGameSearch}
							oninput={searchBaseGames}
							onfocus={() => { if (baseGameResults.length) baseGameDropdownOpen = true; }}
							onblur={() => setTimeout(() => baseGameDropdownOpen = false, 200)}
							disabled={!canEditMeta}
						/>
						{#if baseGameSearching}
							<span class="muted">Searching...</span>
						{/if}
						{#if baseGameDropdownOpen}
							<div class="base-game-dropdown">
								{#each baseGameResults as g}
									<button type="button" class="base-game-dropdown__item" onclick={() => selectBaseGame(g)}>
										<span class="base-game-dropdown__name">{g.game_name}</span>
										<span class="base-game-dropdown__id muted">{g.game_id}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
				<span class="field-hint">The original (unmodded) game this is based on. Shown as a link on both game pages.</span>
			</div>
		{/if}
	</div>
	{#if canEdit}
		<div class="section-actions">
			<button class="btn btn--save" onclick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save General'}</button>
			<button class="btn btn--reset" onclick={onReset}>Reset</button>
		</div>
	{/if}
</section>

<!-- Crop Modal -->
{#if cropModalOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" onclick={closeCropModal}></div>
	<div class="crop-modal">
		<div class="crop-modal__header">
			<h3>{m.ge_general_crop()}</h3>
			<button class="crop-modal__close" onclick={closeCropModal}>&times;</button>
		</div>
		<p class="muted crop-modal__hint">Drag to reposition. Use the slider to zoom. Output: {CROP_W}×{CROP_H}px.</p>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="crop-area"
			onmousedown={handleCropMouseDown}
			onmousemove={handleCropMouseMove}
			onmouseup={handleCropMouseUp}
			onmouseleave={handleCropMouseUp}
		>
			<canvas bind:this={cropCanvas} width={CROP_W} height={CROP_H}></canvas>
		</div>
		<div class="crop-controls">
			<label class="crop-controls__label">{m.ge_zoom()}</label>
			{#if cropImg}
				<input type="range"
					min={Math.max(CROP_W / cropImg.width, CROP_H / cropImg.height) * 0.5}
					max={Math.max(CROP_W / cropImg.width, CROP_H / cropImg.height) * 4}
					step="0.001"
					value={cropZoom}
					oninput={handleCropZoom}
					class="crop-controls__slider"
				/>
			{/if}
		</div>
		<div class="crop-modal__actions">
			<button class="btn btn--save" onclick={confirmCropAndUpload} disabled={coverUploading}>{coverUploading ? 'Uploading...' : '✅ Crop & Upload'}</button>
			<button class="btn" onclick={uploadOriginalFile} disabled={coverUploading}>{coverUploading ? '...' : '📤 Upload Original (no crop)'}</button>
			<button class="btn btn--reset" onclick={closeCropModal} disabled={coverUploading}>{m.ge_cancel()}</button>
		</div>
	</div>
{/if}
