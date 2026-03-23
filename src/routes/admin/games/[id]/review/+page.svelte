<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Lock, CheckCircle, XCircle, Pencil, Eye, Save, Trash2 } , X } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { renderMarkdown } from '$lib/utils/markdown';

	let { data } = $props();
	const game = data.game;
	const gd = game.game_data || {};

	// ── Editable state (hydrated from pending game data) ──────────────────
	let gameName = $state(game.game_name || '');
	let aliases = $state((game.game_name_aliases || []).join(', '));
	let description = $state(game.description || '');
	let selectedPlatforms = $state<string[]>(game.platforms || []);
	let customPlatforms = $state<string[]>(gd.custom_platforms || []);
	let selectedGenres = $state<string[]>(game.genres || []);
	let customGenres = $state<string[]>(gd.custom_genres || []);
	let rules = $state(game.rules || '');
	let timingMethod = $state(gd.timing_method || 'RTA');
	let customChallengeDescription = $state(gd.custom_challenge_description || '');

	// Cover image + crop
	let coverUrl = $state(game.cover_image_url || '');
	const CROP_W = 460;
	const CROP_H = 215;
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

	// Characters
	let characterEnabled = $state(gd.character_column?.enabled || false);
	let characterLabel = $state(gd.character_column?.label || 'Character');
	let characterOptions = $state<string[]>((gd.characters_data || []).map((c: any) => c.label || c.slug));

	// Challenges
	let challenges = $state<any[]>(gd.challenges_data || []);

	// Categories
	let fullRuns = $state<any[]>(gd.full_runs || []);
	let miniChallenges = $state<any[]>(gd.mini_challenges || []);

	// Restrictions
	let restrictions = $state<any[]>(gd.restrictions_data || []);

	// Glitches
	let glitches = $state<any[]>(gd.glitches_data || []);
	let glitchDocLinks = $state(gd.glitch_doc_links || '');
	let nmgRules = $state(gd.nmg_rules || '');

	// Reviewer notes
	let reviewerNotes = $state('');

	// UI state
	let saving = $state(false);
	let msg = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let activeTab = $state('general');
	let showRulesPreview = $state(false);

	// Draft state
	let draftStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let draftExists = $state(false);
	let draftRestored = $state(false);

	const TABS = [
		{ id: 'general', label: 'General', icon: '📋' },
		{ id: 'categories', label: 'Categories', icon: '📂' },
		{ id: 'challenges', label: 'Challenges', icon: '⚡' },
		{ id: 'characters', label: 'Characters', icon: '🎭' },
		{ id: 'restrictions', label: 'Restrictions', icon: '🔒' },
		{ id: 'glitches', label: 'Glitches', icon: '🎲' },
		{ id: 'notes', label: 'Review Notes', icon: '📝' },
	];

	// ── Cover crop tool ──────────────────────────────────────────────────
	function handleCoverFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			msg = { type: 'error', text: 'Only JPEG, PNG, and WebP images are allowed.' };
			setTimeout(() => msg = null, 3000); return;
		}
		if (file.size > 5 * 1024 * 1024) {
			msg = { type: 'error', text: 'File must be under 5MB.' };
			setTimeout(() => msg = null, 3000); return;
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
		cropCanvas.width = CROP_W; cropCanvas.height = CROP_H;
		ctx.clearRect(0, 0, CROP_W, CROP_H);
		ctx.fillStyle = '#111'; ctx.fillRect(0, 0, CROP_W, CROP_H);
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
		const oldZoom = cropZoom; cropZoom = val;
		const cx = CROP_W / 2; const cy = CROP_H / 2;
		cropX = cx - (cx - cropX) * (cropZoom / oldZoom);
		cropY = cy - (cy - cropY) * (cropZoom / oldZoom);
		drawCrop();
	}
	function closeCropModal() { cropModalOpen = false; cropImg = null; cropOriginalFile = null; }

	async function confirmCropAndUpload() {
		if (!cropCanvas || !cropImg) return;
		coverUploading = true;
		try {
			const blob = await new Promise<Blob | null>((resolve) => {
				cropCanvas!.toBlob(resolve, 'image/webp', 0.85);
			});
			if (!blob) { msg = { type: 'error', text: 'Failed to process image.' }; coverUploading = false; return; }
			const fileName = `pending-${game.id}.webp`;
			const { error: uploadErr } = await supabase.storage
				.from('game-covers')
				.upload(fileName, blob, { contentType: 'image/webp', upsert: true });
			if (uploadErr) { msg = { type: 'error', text: `Upload failed: ${uploadErr.message}` }; coverUploading = false; return; }
			const { data: urlData } = supabase.storage.from('game-covers').getPublicUrl(fileName);
			coverUrl = urlData.publicUrl + '?v=' + Date.now();
			closeCropModal();
			msg = { type: 'success', text: 'Cover uploaded!' };
		} catch (err: any) {
			msg = { type: 'error', text: `Upload error: ${err?.message || 'Unknown'}` };
		}
		coverUploading = false;
		setTimeout(() => msg = null, 3000);
	}

	// ── Helpers ───────────────────────────────────────────────────────────
	const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	function moveItem<T>(list: T[], from: number, to: number): T[] {
		if (to < 0 || to >= list.length) return list;
		const arr = [...list];
		const [item] = arr.splice(from, 1);
		arr.splice(to, 0, item);
		return arr;
	}

	function addChallenge() { challenges = [...challenges, { slug: '', label: '', description: '', exceptions: '' }]; }
	function removeChallenge(i: number) { challenges = challenges.filter((_, idx) => idx !== i); }
	function moveChallenge(i: number, dir: number) { challenges = moveItem(challenges, i, i + dir); }

	function addFullRun() { fullRuns = [...fullRuns, { slug: '', label: '', description: '', exceptions: '' }]; }
	function removeFullRun(i: number) { fullRuns = fullRuns.filter((_, idx) => idx !== i); }
	function moveFullRun(i: number, dir: number) { fullRuns = moveItem(fullRuns, i, i + dir); }

	function addMiniGroup() { miniChallenges = [...miniChallenges, { slug: '', label: '', description: '', exceptions: '', children: [] }]; }
	function removeMiniGroup(i: number) { miniChallenges = miniChallenges.filter((_, idx) => idx !== i); }
	function moveMiniGroup(i: number, dir: number) { miniChallenges = moveItem(miniChallenges, i, i + dir); }
	function addMiniChild(gi: number) {
		miniChallenges = miniChallenges.map((g, i) =>
			i === gi ? { ...g, children: [...(g.children || []), { slug: '', label: '', description: '', exceptions: '' }] } : g
		);
	}
	function removeMiniChild(gi: number, ci: number) {
		miniChallenges = miniChallenges.map((g, i) =>
			i === gi ? { ...g, children: (g.children || []).filter((_: any, j: number) => j !== ci) } : g
		);
	}
	function moveMiniChild(gi: number, ci: number, dir: number) {
		miniChallenges = miniChallenges.map((g, i) =>
			i === gi ? { ...g, children: moveItem(g.children || [], ci, ci + dir) } : g
		);
	}

	function addRestriction() { restrictions = [...restrictions, { slug: '', label: '', description: '', exceptions: '', children: [] }]; }
	function removeRestriction(i: number) { restrictions = restrictions.filter((_, idx) => idx !== i); }
	function moveRestriction(i: number, dir: number) { restrictions = moveItem(restrictions, i, i + dir); }
	function addRestrictionChild(ri: number) {
		restrictions = restrictions.map((r, i) =>
			i === ri ? { ...r, children: [...(r.children || []), { slug: '', label: '', description: '' }] } : r
		);
	}
	function removeRestrictionChild(ri: number, ci: number) {
		restrictions = restrictions.map((r, i) =>
			i === ri ? { ...r, children: (r.children || []).filter((_: any, j: number) => j !== ci) } : r
		);
	}
	function moveRestrictionChild(ri: number, ci: number, dir: number) {
		restrictions = restrictions.map((r, i) =>
			i === ri ? { ...r, children: moveItem(r.children || [], ci, ci + dir) } : r
		);
	}

	function addGlitch() { glitches = [...glitches, { slug: '', label: '', description: '' }]; }
	function removeGlitch(i: number) { glitches = glitches.filter((_, idx) => idx !== i); }
	function moveGlitch(i: number, dir: number) { glitches = moveItem(glitches, i, i + dir); }

	function addCharacter() { characterOptions = [...characterOptions, '']; }
	function removeCharacter(i: number) { characterOptions = characterOptions.filter((_, idx) => idx !== i); }

	// ── Draft Save/Load ──────────────────────────────────────────────────
	function serializeReviewState() {
		return {
			gameName, aliases, description, selectedPlatforms, customPlatforms,
			selectedGenres, customGenres, rules, timingMethod, coverUrl,
			characterEnabled, characterLabel, characterOptions,
			challenges, fullRuns, miniChallenges, restrictions,
			glitches, glitchDocLinks, nmgRules, customChallengeDescription,
			reviewerNotes,
		};
	}

	function loadFromDraft(d: any) {
		if (!d) return;
		gameName = d.gameName ?? gameName;
		aliases = d.aliases ?? aliases;
		description = d.description ?? description;
		selectedPlatforms = d.selectedPlatforms ?? selectedPlatforms;
		customPlatforms = d.customPlatforms ?? customPlatforms;
		selectedGenres = d.selectedGenres ?? selectedGenres;
		customGenres = d.customGenres ?? customGenres;
		rules = d.rules ?? rules;
		timingMethod = d.timingMethod ?? timingMethod;
		coverUrl = d.coverUrl ?? coverUrl;
		characterEnabled = d.characterEnabled ?? characterEnabled;
		characterLabel = d.characterLabel ?? characterLabel;
		characterOptions = d.characterOptions ?? characterOptions;
		challenges = d.challenges ?? challenges;
		fullRuns = d.fullRuns ?? fullRuns;
		miniChallenges = d.miniChallenges ?? miniChallenges;
		restrictions = d.restrictions ?? restrictions;
		glitches = d.glitches ?? glitches;
		glitchDocLinks = d.glitchDocLinks ?? glitchDocLinks;
		nmgRules = d.nmgRules ?? nmgRules;
		customChallengeDescription = d.customChallengeDescription ?? customChallengeDescription;
		reviewerNotes = d.reviewerNotes ?? reviewerNotes;
	}

	async function checkForDraft() {
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) return;
			const { data: draft, error } = await supabase
				.from('game_review_drafts')
				.select('draft_data')
				.eq('user_id', sess.user.id)
				.eq('game_id', game.id)
				.maybeSingle();
			if (!error && draft?.draft_data) {
				draftExists = true;
				loadFromDraft(draft.draft_data);
				draftRestored = true;
				msg = { type: 'success', text: 'Draft loaded from your last session.' };
				setTimeout(() => msg = null, 3000);
			}
		} catch { /* silent — table may not exist yet */ }
	}

	async function loadDraft() {
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) return;
			const { data: draft } = await supabase
				.from('game_review_drafts')
				.select('draft_data')
				.eq('user_id', sess.user.id)
				.eq('game_id', game.id)
				.maybeSingle();
			if (draft?.draft_data) {
				loadFromDraft(draft.draft_data);
				msg = { type: 'success', text: 'Draft loaded.' };
				setTimeout(() => msg = null, 3000);
			}
		} catch { /* silent */ }
	}

	async function startFresh() {
		await deleteDraft();
		window.location.reload();
	}

	async function saveDraft() {
		draftStatus = 'saving';
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) { draftStatus = 'error'; return; }
			const { error } = await supabase
				.from('game_review_drafts')
				.upsert({
					user_id: sess.user.id,
					game_id: game.id,
					draft_data: serializeReviewState(),
					updated_at: new Date().toISOString(),
				}, { onConflict: 'user_id,game_id' });
			if (error) throw error;
			draftStatus = 'saved';
			draftExists = true;
			setTimeout(() => { if (draftStatus === 'saved') draftStatus = 'idle'; }, 3000);
		} catch {
			draftStatus = 'error';
			setTimeout(() => { if (draftStatus === 'error') draftStatus = 'idle'; }, 4000);
		}
	}

	async function deleteDraft() {
		try {
			const { data: { session: sess } } = await supabase.auth.getSession();
			if (!sess) return;
			await supabase
				.from('game_review_drafts')
				.delete()
				.eq('user_id', sess.user.id)
				.eq('game_id', game.id);
			draftExists = false;
			draftRestored = false;
		} catch { /* silent */ }
	}

	// Check for draft on load
	checkForDraft();

	// ── Save ──────────────────────────────────────────────────────────────
	async function handleSave() {
		if (!reviewerNotes.trim()) {
			msg = { type: 'error', text: 'Please add review notes explaining what was changed.' };
			setTimeout(() => msg = null, 4000);
			return;
		}

		saving = true;

		// Build updated game_data
		const updatedGameData = {
			...gd,
			timing_method: timingMethod,
			character_column: { enabled: characterEnabled, label: characterLabel },
			characters_data: characterOptions.filter(c => c.trim()).map(c => ({ slug: slugify(c), label: c.trim() })),
			challenges_data: challenges.filter(c => c.label?.trim()).map(c => ({
				slug: c.slug || slugify(c.label), label: c.label.trim(),
				description: c.description?.trim() || null,
				exceptions: c.exceptions?.trim() || null,
			})),
			full_runs: fullRuns.filter(c => c.label?.trim()).map(c => ({
				slug: c.slug || slugify(c.label), label: c.label.trim(),
				description: c.description?.trim() || null,
				exceptions: c.exceptions?.trim() || null,
			})),
			mini_challenges: miniChallenges.filter(g => g.label?.trim()).map(g => ({
				slug: g.slug || slugify(g.label), label: g.label.trim(),
				description: g.description?.trim() || null,
				exceptions: g.exceptions?.trim() || null,
				children: (g.children || []).filter((c: any) => c.label?.trim()).map((c: any) => ({
					slug: c.slug || slugify(c.label), label: c.label.trim(),
					description: c.description?.trim() || null,
					exceptions: c.exceptions?.trim() || null,
				})),
			})),
			restrictions_data: restrictions.filter(r => r.label?.trim()).map(r => ({
				slug: r.slug || slugify(r.label), label: r.label.trim(),
				description: r.description?.trim() || null,
				exceptions: r.exceptions?.trim() || null,
				children: (r.children || []).filter((c: any) => c.label?.trim()).map((c: any) => ({
					slug: c.slug || slugify(c.label), label: c.label.trim(),
					description: c.description?.trim() || null,
				})),
			})),
			glitches_data: glitches.filter(g => g.label?.trim()).map(g => ({
				slug: g.slug || slugify(g.label), label: g.label.trim(),
				description: g.description?.trim() || null,
			})),
			glitch_doc_links: glitchDocLinks.trim() || null,
			nmg_rules: nmgRules.trim() || null,
			custom_genres: customGenres.filter((g: string) => g.trim()),
			custom_platforms: customPlatforms.filter((p: string) => p.trim()),
			custom_challenge_description: customChallengeDescription.trim() || null,
		};

		// Update pending_games directly via Supabase (admin has RLS access)
		const { error } = await supabase
			.from('pending_games')
			.update({
				game_name: gameName.trim(),
				game_name_aliases: aliases.split(',').map((a: string) => a.trim()).filter(Boolean),
				description: description.trim() || null,
				platforms: selectedPlatforms,
				genres: selectedGenres,
				rules: rules.trim() || null,
				cover_image_url: coverUrl.trim() || null,
				game_data: updatedGameData,
			})
			.eq('id', game.id);

		if (error) {
			msg = { type: 'error', text: `Save failed: ${error.message}` };
			saving = false;
			setTimeout(() => msg = null, 4000);
			return;
		}

		// Now call the Worker to set status + reviewer_notes (which also sends Discord notification)
		const result = await adminAction('/admin/request-game-changes', {
			game_id: game.id,
			notes: reviewerNotes.trim(),
		});

		if (result.ok) {
			msg = { type: 'success', text: 'Changes saved and submitter notified.' };
			deleteDraft();
			setTimeout(() => goto('/admin/games'), 1500);
		} else {
			msg = { type: 'error', text: result.message };
		}
		saving = false;
		setTimeout(() => msg = null, 4000);
	}
</script>

<svelte:head><title>Review: {game.game_name} | Admin</title></svelte:head>

<div class="page-width">
	<p class="back"><a href="/admin/games">← Back to Games</a></p>
	<h1>Review: {game.game_name}</h1>
	<p class="muted">{m.ge_review_edit_hint()}</p>

	{#if msg}
		<div class="alert" class:alert--success={msg.type === 'success'} class:alert--error={msg.type === 'error'}>{msg.text}</div>
	{/if}

	{#if game.submitter_notes}
		<div class="submitter-notes">
			<span class="submitter-notes__label">{m.ge_review_submitter_notes()}</span>
			<p>{game.submitter_notes}</p>
		</div>
	{/if}

	{#if gd.submission_type === 'basic'}
		<div class="basic-banner">
			<span class="basic-banner__icon">📝</span>
			<div>
				<strong>{m.submit_game_basic_banner()}</strong> — {m.submit_game_basic_banner_desc()}
			</div>
		</div>
	{/if}

	{#if draftRestored}
		<div class="draft-banner">
			<span>📝 This review was restored from your last session.</span>
			<div class="draft-banner__actions">
				<button type="button" class="btn btn--sm" onclick={startFresh}>Start Over</button>
			</div>
		</div>
	{/if}

	<div class="draft-bar">
		<span>💾 Save your review progress before navigating away.</span>
		<div class="draft-bar__actions">
			<button type="button" class="btn btn--sm btn--draft" onclick={saveDraft} disabled={draftStatus === 'saving'}>
				{#if draftStatus === 'saving'}{m.btn_draft_saving()}{:else if draftStatus === 'saved'}{m.btn_draft_saved()}{:else if draftStatus === 'error'}{m.btn_draft_save_failed()}{:else}{m.btn_save_draft()}{/if}
			</button>
			{#if draftExists}
				<button type="button" class="btn btn--sm" onclick={deleteDraft}>Discard</button>
			{/if}
		</div>
	</div>

	<!-- Tab bar -->
	<nav class="game-tabs review-tabs">
		{#each TABS as t}
			<button class="game-tab" class:game-tab--active={activeTab === t.id}
				onclick={() => activeTab = t.id}>
				<span class="tab__icon">{t.icon}</span> {t.label}
			</button>
		{/each}
	</nav>

	<div class="review-panel">

		<!-- General -->
		{#if activeTab === 'general'}
			<div class="tab-body">
				<div class="field"><label class="fl">{m.ge_general_game_name()}</label><input type="text" class="fi" bind:value={gameName} /></div>
				<div class="field"><label class="fl">{m.ge_review_aliases()}</label><input type="text" class="fi" bind:value={aliases} /></div>
				<div class="field"><label class="fl">{m.ge_description()}</label><textarea class="fi" rows="3" bind:value={description}></textarea></div>
				<div class="field"><label class="fl">{m.ge_review_timing()}</label><input type="text" class="fi" bind:value={timingMethod} /></div>

				<hr class="section-divider" />

				<!-- Cover Image -->
				<div class="field">
					<label class="fl">{m.ge_general_cover()}</label>
					{#if coverUrl}
						<div class="cover-preview">
							<div class="cover-preview__img" style="background-image: url('{coverUrl}');"></div>
							<div class="cover-preview__actions">
								<label class="btn btn--sm cover-upload-btn">
									📷 Replace
									<input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleCoverFileSelect} hidden />
								</label>
								<button type="button" class="btn btn--sm btn--danger" onclick={() => coverUrl = ''}>✕ Remove</button>
							</div>
						</div>
					{:else}
						<div class="cover-empty">
							<label class="cover-empty__upload">
								<span class="cover-empty__icon">📷</span>
								<span>{m.ge_general_upload_hint()}</span>
								<input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleCoverFileSelect} hidden />
							</label>
						</div>
					{/if}
					<span class="field-hint">460×215px (Steam capsule). JPEG, PNG, WebP — max 5MB.</span>
					<details class="url-fallback">
						<summary class="url-fallback__toggle">Or paste an image URL</summary>
						<div class="field mt-1">
							<input type="text" class="fi" bind:value={coverUrl} placeholder="https://..." />
						</div>
					</details>
				</div>

				<hr class="section-divider" />

				<div class="field">
					<label class="fl">{m.ge_general_platforms()}</label>
					<div class="chip-editor">
						{#each selectedPlatforms as p, i}
							<span class="chip-ed">{p} <button type="button" class="chip-ed__x" onclick={() => selectedPlatforms = selectedPlatforms.filter((_: string, j: number) => j !== i)}><X size={14} /></button></span>
						{/each}
						<input type="text" class="chip-ed__input" placeholder="Add platform + Enter"
							onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { selectedPlatforms = [...selectedPlatforms, t.value.trim()]; t.value = ''; e.preventDefault(); } }} />
					</div>
				</div>
				{#if customPlatforms.length > 0}
					<div class="requested-box">
						<span class="requested-box__label">{m.ge_review_custom_platforms()}</span>
						<div class="chip-editor">
							{#each customPlatforms as p, i}
								<span class="chip-ed chip-ed--requested">{p} <button type="button" class="chip-ed__x" onclick={() => customPlatforms = customPlatforms.filter((_: string, j: number) => j !== i)}><X size={14} /></button></span>
							{/each}
							<input type="text" class="chip-ed__input" placeholder="Add custom platform + Enter"
								onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { customPlatforms = [...customPlatforms, t.value.trim()]; t.value = ''; e.preventDefault(); } }} />
						</div>
					</div>
				{/if}

				<hr class="section-divider" />

				<div class="field">
					<label class="fl">{m.ge_general_genres()}</label>
					<div class="chip-editor">
						{#each selectedGenres as g, i}
							<span class="chip-ed">{g} <button type="button" class="chip-ed__x" onclick={() => selectedGenres = selectedGenres.filter((_: string, j: number) => j !== i)}><X size={14} /></button></span>
						{/each}
						<input type="text" class="chip-ed__input" placeholder="Add genre + Enter"
							onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { selectedGenres = [...selectedGenres, t.value.trim()]; t.value = ''; e.preventDefault(); } }} />
					</div>
				</div>
				{#if customGenres.length > 0}
					<div class="requested-box">
						<span class="requested-box__label">{m.ge_review_custom_genres()}</span>
						<div class="chip-editor">
							{#each customGenres as g, i}
								<span class="chip-ed chip-ed--requested">{g} <button type="button" class="chip-ed__x" onclick={() => customGenres = customGenres.filter((_: string, j: number) => j !== i)}><X size={14} /></button></span>
							{/each}
							<input type="text" class="chip-ed__input" placeholder="Add custom genre + Enter"
								onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { customGenres = [...customGenres, t.value.trim()]; t.value = ''; e.preventDefault(); } }} />
						</div>
					</div>
				{/if}

				<hr class="section-divider" />

				<div class="field">
						<label class="fl">{m.ge_review_general_rules()}</label>
						<div class="rules-toolbar">
							<button type="button" class="btn btn--sm" class:btn--primary={!showRulesPreview} onclick={() => showRulesPreview = false}>✏️ Edit</button>
							<button type="button" class="btn btn--sm" class:btn--primary={showRulesPreview} onclick={() => showRulesPreview = true}>👁️ Preview</button>
						</div>
						{#if showRulesPreview}
							<div class="rules-preview">
								{#if rules?.trim()}
									{@html renderMarkdown(rules)}
								{:else}
									<p class="muted">No rules content to preview.</p>
								{/if}
							</div>
						{:else}
							<textarea class="fi rules-textarea" rows="20" bind:value={rules}></textarea>
						{/if}
					</div>
			</div>
		{/if}

		<!-- Categories -->
		{#if activeTab === 'categories'}
			<div class="tab-body">
				<h3 class="section-title">{m.ge_review_full_runs()}</h3>
				{#each fullRuns as item, i}
					<div class="item-row">
						<div class="item-row__fields">
							<div class="labeled-field"><span class="labeled-field__tag">{m.ge_label()}</span><input type="text" class="fi fi--sm" bind:value={fullRuns[i].label} placeholder="Category name" oninput={() => { fullRuns[i].slug = slugify(fullRuns[i].label); fullRuns = [...fullRuns]; }} /></div>
							<div class="labeled-field"><span class="labeled-field__tag">{m.ge_description()}</span><textarea class="fi fi--sm" rows="6" bind:value={fullRuns[i].description} placeholder="What does this category involve?"></textarea></div>
							<div class="labeled-field"><span class="labeled-field__tag labeled-field__tag--exc">{m.ge_review_exceptions()}</span><textarea class="fi fi--sm" rows="4" bind:value={fullRuns[i].exceptions} placeholder="Any exceptions to the rules for this category?"></textarea></div>
						</div>
						<div class="item-row__actions">
							<button type="button" class="btn-icon" onclick={() => moveFullRun(i, -1)} disabled={i === 0} title="Move up">↑</button>
							<button type="button" class="btn-icon" onclick={() => moveFullRun(i, 1)} disabled={i === fullRuns.length - 1} title="Move down">↓</button>
							<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeFullRun(i)}><X size={14} /></button>
						</div>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addFullRun}>+ Add Full Run</button>

				<h3 class="section-title mt-2">{m.ge_review_mini_groups()}</h3>
				{#each miniChallenges as group, gi}
					<div class="item-group">
						<div class="item-row">
							<div class="item-row__fields">
								<div class="labeled-field"><span class="labeled-field__tag">{m.ge_label()}</span><input type="text" class="fi fi--sm" bind:value={miniChallenges[gi].label} placeholder="Group label" oninput={() => { miniChallenges[gi].slug = slugify(miniChallenges[gi].label); miniChallenges = [...miniChallenges]; }} /></div>
								<div class="labeled-field"><span class="labeled-field__tag">{m.ge_description()}</span><textarea class="fi fi--sm" rows="6" bind:value={miniChallenges[gi].description} placeholder="What does this group cover?"></textarea></div>
								<div class="labeled-field"><span class="labeled-field__tag labeled-field__tag--exc">{m.ge_review_exceptions()}</span><textarea class="fi fi--sm" rows="4" bind:value={miniChallenges[gi].exceptions} placeholder="Any exceptions?"></textarea></div>
							</div>
							<div class="item-row__actions">
								<button type="button" class="btn-icon" onclick={() => moveMiniGroup(gi, -1)} disabled={gi === 0} title="Move up">↑</button>
								<button type="button" class="btn-icon" onclick={() => moveMiniGroup(gi, 1)} disabled={gi === miniChallenges.length - 1} title="Move down">↓</button>
								<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeMiniGroup(gi)}><X size={14} /></button>
							</div>
						</div>
						{#if group.children?.length}
							<div class="children-indent">
								{#each group.children as child, ci}
									<div class="item-row">
										<div class="item-row__fields">
											<div class="labeled-field"><span class="labeled-field__tag">{m.ge_label()}</span><input type="text" class="fi fi--sm" bind:value={miniChallenges[gi].children[ci].label} placeholder="Child label" oninput={() => { miniChallenges[gi].children[ci].slug = slugify(miniChallenges[gi].children[ci].label); miniChallenges = [...miniChallenges]; }} /></div>
											<div class="labeled-field"><span class="labeled-field__tag">{m.ge_description()}</span><textarea class="fi fi--sm" rows="3" bind:value={miniChallenges[gi].children[ci].description} placeholder="Description"></textarea></div>
											<div class="labeled-field"><span class="labeled-field__tag labeled-field__tag--exc">{m.ge_review_exceptions()}</span><textarea class="fi fi--sm" rows="2" bind:value={miniChallenges[gi].children[ci].exceptions} placeholder="Exceptions"></textarea></div>
										</div>
										<div class="item-row__actions">
											<button type="button" class="btn-icon" onclick={() => moveMiniChild(gi, ci, -1)} disabled={ci === 0} title="Move up">↑</button>
											<button type="button" class="btn-icon" onclick={() => moveMiniChild(gi, ci, 1)} disabled={ci === group.children.length - 1} title="Move down">↓</button>
											<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeMiniChild(gi, ci)}><X size={14} /></button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
						<button type="button" class="btn btn--xs" onclick={() => addMiniChild(gi)}>+ Add Child</button>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addMiniGroup}>+ Add Mini Group</button>
			</div>
		{/if}

		<!-- Challenges -->
		{#if activeTab === 'challenges'}
			<div class="tab-body">
				<h3 class="section-title">{m.ge_review_challenges()}</h3>
				{#each challenges as item, i}
					<div class="item-row">
						<div class="item-row__fields">
							<div class="labeled-field"><span class="labeled-field__tag">{m.ge_label()}</span><input type="text" class="fi fi--sm" bind:value={challenges[i].label} placeholder="Challenge name" oninput={() => { challenges[i].slug = slugify(challenges[i].label); challenges = [...challenges]; }} /></div>
							<div class="labeled-field"><span class="labeled-field__tag">{m.ge_description()}</span><textarea class="fi fi--sm" rows="6" bind:value={challenges[i].description} placeholder="What does this challenge involve?"></textarea></div>
							<div class="labeled-field"><span class="labeled-field__tag labeled-field__tag--exc">{m.ge_review_exceptions()}</span><textarea class="fi fi--sm" rows="4" bind:value={challenges[i].exceptions} placeholder="Any exceptions to the standard rules?"></textarea></div>
						</div>
						<div class="item-row__actions">
							<button type="button" class="btn-icon" onclick={() => moveChallenge(i, -1)} disabled={i === 0} title="Move up">↑</button>
							<button type="button" class="btn-icon" onclick={() => moveChallenge(i, 1)} disabled={i === challenges.length - 1} title="Move down">↓</button>
							<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeChallenge(i)}><X size={14} /></button>
						</div>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addChallenge}>+ Add Challenge</button>

				{#if customChallengeDescription}
					<div class="requested-box mt-2">
						<span class="requested-box__label">{m.ge_review_custom_challenge_desc()}</span>
						<textarea class="fi" rows="3" bind:value={customChallengeDescription}></textarea>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Characters -->
		{#if activeTab === 'characters'}
			<div class="tab-body">
				<label class="toggle-row"><input type="checkbox" bind:checked={characterEnabled} /> Enable Character/Weapon/Class Column</label>
				{#if characterEnabled}
					<div class="field mt-1"><label class="fl">{m.ge_column_label()}</label><input type="text" class="fi" bind:value={characterLabel} placeholder="Character" /></div>
					<div class="field">
						<label class="fl">{m.ge_options()}</label>
						{#each characterOptions as _, i}
							<div class="item-row">
								<input type="text" class="fi fi--sm" bind:value={characterOptions[i]} placeholder="e.g. Knight, Mage" />
								<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeCharacter(i)}><X size={14} /></button>
							</div>
						{/each}
						<button type="button" class="btn btn--sm" onclick={addCharacter}>+ Add Option</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Restrictions -->
		{#if activeTab === 'restrictions'}
			<div class="tab-body">
				<h3 class="section-title">{m.ge_review_restrictions()}</h3>
				{#each restrictions as item, i}
					<div class="item-group">
						<div class="item-row">
							<div class="item-row__fields">
								<div class="labeled-field"><span class="labeled-field__tag">{m.ge_label()}</span><input type="text" class="fi fi--sm" bind:value={restrictions[i].label} placeholder="Restriction name" oninput={() => { restrictions[i].slug = slugify(restrictions[i].label); restrictions = [...restrictions]; }} /></div>
								<div class="labeled-field"><span class="labeled-field__tag">{m.ge_description()}</span><textarea class="fi fi--sm" rows="6" bind:value={restrictions[i].description} placeholder="What does this restriction mean?"></textarea></div>
								<div class="labeled-field"><span class="labeled-field__tag labeled-field__tag--exc">{m.ge_review_exceptions()}</span><textarea class="fi fi--sm" rows="4" bind:value={restrictions[i].exceptions} placeholder="Any exceptions?"></textarea></div>
							</div>
							<div class="item-row__actions">
								<button type="button" class="btn-icon" onclick={() => moveRestriction(i, -1)} disabled={i === 0} title="Move up">↑</button>
								<button type="button" class="btn-icon" onclick={() => moveRestriction(i, 1)} disabled={i === restrictions.length - 1} title="Move down">↓</button>
								<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeRestriction(i)}><X size={14} /></button>
							</div>
						</div>
						{#if item.children?.length}
							<div class="children-indent">
								{#each item.children as child, ci}
									<div class="item-row">
										<div class="item-row__fields">
											<div class="labeled-field"><span class="labeled-field__tag">{m.ge_label()}</span><input type="text" class="fi fi--sm" bind:value={restrictions[i].children[ci].label} placeholder="Child label" oninput={() => { restrictions[i].children[ci].slug = slugify(restrictions[i].children[ci].label); restrictions = [...restrictions]; }} /></div>
											<div class="labeled-field"><span class="labeled-field__tag">{m.ge_description()}</span><textarea class="fi fi--sm" rows="3" bind:value={restrictions[i].children[ci].description} placeholder="Description"></textarea></div>
										</div>
										<div class="item-row__actions">
											<button type="button" class="btn-icon" onclick={() => moveRestrictionChild(i, ci, -1)} disabled={ci === 0} title="Move up">↑</button>
											<button type="button" class="btn-icon" onclick={() => moveRestrictionChild(i, ci, 1)} disabled={ci === item.children.length - 1} title="Move down">↓</button>
											<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeRestrictionChild(i, ci)}><X size={14} /></button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
						<button type="button" class="btn btn--xs" onclick={() => addRestrictionChild(i)}>+ Add Child</button>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addRestriction}>+ Add Restriction</button>
			</div>
		{/if}

		<!-- Glitches -->
		{#if activeTab === 'glitches'}
			<div class="tab-body">
				<h3 class="section-title">{m.ge_review_glitch_cats()}</h3>
				{#each glitches as item, i}
					<div class="item-row">
						<div class="item-row__fields">
							<div class="labeled-field"><span class="labeled-field__tag">{m.ge_label()}</span><input type="text" class="fi fi--sm" bind:value={glitches[i].label} placeholder="Glitch category name" oninput={() => { glitches[i].slug = slugify(glitches[i].label); glitches = [...glitches]; }} /></div>
							<div class="labeled-field"><span class="labeled-field__tag">{m.ge_description()}</span><textarea class="fi fi--sm" rows="6" bind:value={glitches[i].description} placeholder="What does this glitch category allow or restrict?"></textarea></div>
						</div>
						<div class="item-row__actions">
							<button type="button" class="btn-icon" onclick={() => moveGlitch(i, -1)} disabled={i === 0} title="Move up">↑</button>
							<button type="button" class="btn-icon" onclick={() => moveGlitch(i, 1)} disabled={i === glitches.length - 1} title="Move down">↓</button>
							<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeGlitch(i)}><X size={14} /></button>
						</div>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addGlitch}>+ Add Glitch Category</button>

				<div class="field mt-2"><label class="fl">{m.ge_review_nmg()}</label><textarea class="fi" rows="3" bind:value={nmgRules} placeholder="What qualifies as a major glitch for this game?"></textarea></div>
				<div class="field"><label class="fl">{m.ge_review_glitch_docs()}</label><textarea class="fi" rows="2" bind:value={glitchDocLinks} placeholder="Links to guides, wikis..."></textarea></div>
			</div>
		{/if}

		<!-- Review Notes -->
		{#if activeTab === 'notes'}
			<div class="tab-body">
				<h3 class="section-title">{m.ge_review_notes()}</h3>
				<p class="muted mb-1">{m.ge_review_notes_hint()}</p>
				<textarea class="fi" rows="6" bind:value={reviewerNotes} placeholder="e.g. Fixed category names, added missing restrictions, corrected timing method..."></textarea>

				{#if game.reviewer_notes}
					<div class="previous-notes mt-2">
						<span class="previous-notes__label">{m.ge_review_prev_notes()}</span>
						<p>{game.reviewer_notes}</p>
					</div>
				{/if}
			</div>
		{/if}

	</div>

	<!-- Action bar -->
	<div class="action-bar">
		<a href="/admin/games" class="btn">{m.ge_cancel()}</a>
		<button type="button" class="btn btn--primary" onclick={handleSave} disabled={saving || !reviewerNotes.trim()}>
			{saving ? 'Saving...' : 'Save Changes & Request Revision'}
		</button>
	</div>
</div>

<!-- Cover Image Crop Modal -->
{#if cropModalOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" onclick={closeCropModal}></div>
	<div class="crop-modal">
		<div class="crop-modal__header">
			<h3>{m.ge_general_crop()}</h3>
			<button class="crop-modal__close" onclick={closeCropModal}>&times;</button>
		</div>
		<p class="crop-modal__hint muted">{m.ge_review_drag_hint()}</p>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="crop-area" onmousedown={handleCropMouseDown} onmousemove={handleCropMouseMove} onmouseup={handleCropMouseUp} onmouseleave={handleCropMouseUp}>
			<canvas bind:this={cropCanvas}></canvas>
		</div>
		<div class="crop-controls">
			<label class="crop-controls__label">{m.ge_zoom()}</label>
			{#if cropImg}
				<input type="range" class="crop-controls__slider" min={Math.max(CROP_W / cropImg.width, CROP_H / cropImg.height)} max={Math.max(CROP_W / cropImg.width, CROP_H / cropImg.height) * 4} step="0.01" value={cropZoom} oninput={handleCropZoom} />
			{/if}
		</div>
		<div class="crop-modal__actions">
			<button class="btn btn--primary" onclick={confirmCropAndUpload} disabled={coverUploading}>{coverUploading ? 'Uploading...' : 'Crop & Upload'}</button>
			<button class="btn btn--danger" onclick={closeCropModal} disabled={coverUploading}>{m.ge_cancel()}</button>
		</div>
	</div>
{/if}

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; }

	.alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	.submitter-notes { padding: 0.75rem 1rem; background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; margin: 1rem 0; font-size: 0.9rem; }
	.submitter-notes__label { font-weight: 600; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.submitter-notes p { margin: 0.25rem 0 0; white-space: pre-wrap; }

	.basic-banner {
		display: flex; align-items: flex-start; gap: 0.75rem;
		padding: 0.85rem 1rem; margin: 1rem 0;
		background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: 8px; font-size: 0.9rem; line-height: 1.5;
	}
	.basic-banner__icon { font-size: 1.3rem; flex-shrink: 0; }

	.review-tabs { margin-top: 1.5rem; margin-bottom: 0; flex-wrap: wrap; overflow-x: visible; }
	.review-panel { margin-top: 0; }
	.tab-body { padding: 1.25rem; background: var(--surface); border: 1px solid var(--border); border-top: none; border-radius: 0 0 12px 12px; }

	.field { margin-bottom: 1rem; }
	.fl { display: block; margin-bottom: 0.35rem; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
	.fi { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.fi:focus { outline: none; border-color: var(--accent); }
	.fi--sm { padding: 0.4rem 0.6rem; font-size: 0.85rem; }
	textarea.fi { resize: vertical; }

	.section-title { margin: 0 0 0.75rem; font-size: 1rem; font-weight: 600; }
	.mt-1 { margin-top: 0.75rem; }
	.mt-2 { margin-top: 1.5rem; }
	.mb-1 { margin-bottom: 0.5rem; }

	/* Chip editor */
	.chip-editor { display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); min-height: 38px; align-items: center; }
	.chip-editor:focus-within { border-color: var(--accent); }
	.chip-ed { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.15rem 0.5rem; background: var(--accent); color: #fff; border-radius: 4px; font-size: 0.78rem; font-weight: 600; }
	.chip-ed--requested { background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px dashed rgba(245, 158, 11, 0.5); }
	.chip-ed__x { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.85rem; }
	.chip-ed__x:hover { color: #fff; }
	.chip-ed--requested .chip-ed__x { color: rgba(245, 158, 11, 0.6); }
	.chip-ed--requested .chip-ed__x:hover { color: #f59e0b; }
	.chip-ed__input { border: none; background: transparent; color: var(--fg); font-size: 0.88rem; outline: none; flex: 1; min-width: 120px; padding: 0.15rem 0; }

	/* Requested items box */
	.requested-box { margin-bottom: 1rem; padding: 0.75rem; background: rgba(245, 158, 11, 0.04); border: 1px dashed rgba(245, 158, 11, 0.3); border-radius: 8px; }
	.requested-box__label { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #f59e0b; margin-bottom: 0.4rem; }

	/* Labeled field tags (Description / Exceptions) */
	.labeled-field { position: relative; }
	.labeled-field__tag {
		display: inline-block; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
		color: var(--muted); margin-bottom: 0.2rem;
	}
	.labeled-field__tag--exc { color: #f59e0b; }

	/* Item rows */
	.item-row { display: flex; gap: 0.5rem; align-items: flex-start; padding-bottom: 0.75rem; margin-bottom: 0.75rem; border-bottom: 1px dashed rgba(255,255,255,0.06); }
	.item-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
	.item-row__fields { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
	.item-row__actions { display: flex; flex-direction: column; gap: 0.2rem; flex-shrink: 0; }
	.item-group { padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.75rem; }
	.children-indent { margin: 0.5rem 0 0.5rem 1.25rem; padding-left: 0.75rem; border-left: 2px solid var(--border); }

	/* Section dividers */
	.section-divider { border: none; border-top: 1px solid var(--border); margin: 1.25rem 0; }

	/* Cover image */
	.cover-preview { margin-bottom: 0.5rem; }
	.cover-preview__img { width: 100%; max-width: 460px; height: 215px; background-size: cover; background-position: center; border-radius: 6px; border: 1px solid var(--border); }
	.cover-preview__actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.cover-empty { width: 100%; max-width: 460px; height: 215px; border: 2px dashed var(--border); border-radius: 6px; display: flex; align-items: center; justify-content: center; }
	.cover-empty__upload { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--muted); font-size: 0.9rem; padding: 1rem; }
	.cover-empty__upload:hover { color: var(--accent); }
	.cover-empty__icon { font-size: 2rem; }
	.cover-upload-btn { cursor: pointer; }
	.field-hint { display: block; font-size: 0.78rem; color: var(--muted); margin-top: 0.25rem; }
	.url-fallback { margin-top: 0.5rem; }
	.url-fallback__toggle { font-size: 0.82rem; color: var(--muted); cursor: pointer; }
	.url-fallback__toggle:hover { color: var(--accent); }

	/* Crop modal */
	.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 999; }
	.crop-modal {
		position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
		z-index: 1000; background: var(--surface); border: 1px solid var(--border);
		border-radius: 12px; padding: 1.5rem; width: min(520px, 95vw); max-height: 90vh; overflow-y: auto;
	}
	.crop-modal__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
	.crop-modal__header h3 { margin: 0; font-size: 1.1rem; }
	.crop-modal__close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--muted); line-height: 1; }
	.crop-modal__hint { font-size: 0.82rem; margin: 0 0 0.75rem; }
	.crop-area { width: 100%; max-width: 460px; height: 215px; cursor: grab; overflow: hidden; border-radius: 6px; border: 1px solid var(--border); margin: 0 auto; }
	.crop-area:active { cursor: grabbing; }
	.crop-area canvas { display: block; width: 100%; height: 100%; }
	.crop-controls { display: flex; align-items: center; gap: 0.75rem; margin: 0.75rem 0; }
	.crop-controls__label { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
	.crop-controls__slider { flex: 1; accent-color: var(--accent); }
	.crop-modal__actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.75rem; flex-wrap: wrap; }

	.btn-icon { background: none; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; padding: 0.3rem 0.5rem; font-size: 1rem; color: var(--muted); flex-shrink: 0; }
	.btn-icon:disabled { opacity: 0.25; cursor: not-allowed; }
	.btn-icon:hover:not(:disabled) { border-color: var(--accent); color: var(--fg); }
	.btn-icon--danger:hover { color: #ef4444; border-color: #ef4444; }

	.btn { display: inline-flex; align-items: center; padding: 0.45rem 0.9rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--fg); font-size: 0.85rem; font-weight: 600; cursor: pointer; text-decoration: none; }
	.btn:hover { border-color: var(--accent); }
	.btn--sm { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
	.btn--xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-top: 0.25rem; }
	.btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn--primary:hover { opacity: 0.9; }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.toggle-row { display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.5rem 0; font-size: 0.9rem; }

	/* Previous notes */
	.previous-notes { padding: 0.75rem 1rem; background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; font-size: 0.88rem; }
	.previous-notes__label { font-weight: 600; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; }
	.previous-notes p { margin: 0.25rem 0 0; white-space: pre-wrap; }

	/* Action bar */
	.action-bar { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; padding: 1rem 0; border-top: 1px solid var(--border); }

	.muted { opacity: 0.6; }

	/* Draft banner + bar */
	.draft-banner {
		display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
		padding: 0.75rem 1rem; margin-bottom: 1rem;
		background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 8px;
		font-size: 0.9rem;
	}
	.draft-banner__actions { display: flex; gap: 0.35rem; margin-left: auto; }
	.draft-bar {
		display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
		padding: 0.65rem 1rem; margin-bottom: 1rem;
		background: rgba(139, 92, 246, 0.06); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 8px;
		font-size: 0.85rem; color: var(--muted);
	}
	.draft-bar__actions { display: flex; gap: 0.35rem; margin-left: auto; }
	.btn--draft { border-color: #8b5cf6; color: #8b5cf6; }
	.btn--draft:hover { background: #8b5cf6; color: #fff; }

	/* Rules toolbar + preview */
	.rules-toolbar { display: flex; gap: 0.35rem; margin-bottom: 0.5rem; }
	.rules-textarea { min-height: 400px; font-size: 1rem; line-height: 1.7; font-family: 'SF Mono', 'Fira Code', monospace; }
	.rules-preview {
		padding: 1.25rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
		min-height: 300px; font-size: 1rem; line-height: 1.7; color: var(--fg);
	}
	.rules-preview h1, .rules-preview h2, .rules-preview h3 { margin-top: 1.25rem; margin-bottom: 0.5rem; }
	.rules-preview h1:first-child, .rules-preview h2:first-child, .rules-preview h3:first-child { margin-top: 0; }
	.rules-preview p { margin: 0 0 0.75rem; }
	.rules-preview ul, .rules-preview ol { margin: 0 0 0.75rem; padding-left: 1.5rem; }
	.rules-preview li { margin-bottom: 0.25rem; }
	.rules-preview code { background: var(--surface); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
	.rules-preview pre { background: var(--surface); padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; margin: 0 0 0.75rem; }
	.rules-preview pre code { background: none; padding: 0; }
	.rules-preview blockquote { border-left: 3px solid var(--accent); padding-left: 0.75rem; margin: 0 0 0.75rem; color: var(--muted); }
	.rules-preview a { color: var(--accent); text-decoration: underline; }
	.rules-preview table { width: 100%; border-collapse: collapse; margin: 0 0 0.75rem; }
	.rules-preview th, .rules-preview td { padding: 0.4rem 0.6rem; border: 1px solid var(--border); text-align: left; }
	.rules-preview th { background: var(--surface); font-weight: 600; }

	@media (max-width: 600px) {
		.item-row { flex-direction: column; }
		.action-bar { flex-direction: column; }
		.action-bar .btn { width: 100%; justify-content: center; }
	}
</style>
