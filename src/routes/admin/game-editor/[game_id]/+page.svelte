<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { supabase } from '$lib/supabase';

	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let game = $state<any>(null);
	let activeTab = $state('general');
	let userRole = $state<any>(null);
	let userId = $state<string | null>(null);

	const gameId = $derived($page.params.game_id);

	// ── Permission Derivations ──────────────────────────────────────────────
	const isSuperAdmin = $derived(userRole?.superAdmin === true);
	const isAdmin = $derived(userRole?.admin === true);
	const isModerator = $derived(userRole?.moderator === true && !userRole?.admin);
	const canEdit = $derived(!game?.frozen_at || isAdmin); // Admins can edit frozen games to unfreeze
	const canDelete = $derived(isSuperAdmin);
	const canFreeze = $derived(isAdmin); // Admins and super admins
	const isFrozen = $derived(!!game?.frozen_at);

	const tabs = $derived([
		{ id: 'general', label: 'General', icon: '📋' },
		{ id: 'categories', label: 'Categories', icon: '📂' },
		{ id: 'rules', label: 'Rules', icon: '📜' },
		{ id: 'challenges', label: 'Challenges & Glitches', icon: '⚡' },
		{ id: 'restrictions', label: 'Restrictions', icon: '🔒' },
		{ id: 'characters', label: 'Characters', icon: '🎭' },
		...(additionalTabs.tab1.enabled ? [{ id: 'additional1', label: additionalTabs.tab1.title || 'Additional 1', icon: '📎' }] : []),
		...(additionalTabs.tab2.enabled ? [{ id: 'additional2', label: additionalTabs.tab2.title || 'Additional 2', icon: '📎' }] : []),
		{ id: 'additional-settings', label: 'Custom Tabs', icon: '➕' },
		{ id: 'history', label: 'History', icon: '🕐' },
	]);

	// ── Editing State ────────────────────────────────────────────────────────
	let gameName = $state('');
	let aliases = $state<string[]>([]);
	let aliasInput = $state('');
	let gameStatus = $state('Active');
	let timingMethod = $state('');
	let genres = $state<string[]>([]);
	let platforms = $state<string[]>([]);
	let cover = $state('');
	let coverPosition = $state('');
	let fullRuns = $state<any[]>([]);
	let miniChallenges = $state<any[]>([]);
	let playerMade = $state<any[]>([]);
	let generalRules = $state('');
	let challengesData = $state<any[]>([]);
	let glitchesData = $state<any[]>([]);
	let restrictionsData = $state<any[]>([]);
	let characterColumn = $state<any>({ enabled: false, label: 'Character' });
	let charactersData = $state<any[]>([]);

	// History / Snapshots
	let snapshots = $state<any[]>([]);
	let snapshotsLoading = $state(false);
	let rollbackConfirm = $state<string | null>(null);

	// Additional Tabs
	let additionalTabs = $state<{ tab1: { enabled: boolean; title: string; content: string }; tab2: { enabled: boolean; title: string; content: string } }>({
		tab1: { enabled: false, title: 'Additional 1', content: '' },
		tab2: { enabled: false, title: 'Additional 2', content: '' }
	});

	// Track original slugs (from DB) — these become read-only
	let originalSlugs = $state<Set<string>>(new Set());

	// Common presets for challenges & glitches
	const COMMON_CHALLENGES = [
		{ slug: 'hitless', label: 'Hitless', description: '' },
		{ slug: 'damageless', label: 'Damageless', description: '' },
		{ slug: 'deathless', label: 'Deathless', description: '' },
		{ slug: 'no-hit-no-damage', label: 'No-Hit / No-Damage', description: '' },
		{ slug: 'flawless', label: 'Flawless', description: '' },
		{ slug: 'blindfolded', label: 'Blindfolded', description: '' },
		{ slug: '1cc', label: '1CC', description: '' },
		{ slug: 'high-score', label: 'High Score', description: '' },
		{ slug: 'minimalist', label: 'Minimalist', description: '' },
	];
	const COMMON_GLITCHES = [
		{ slug: 'unrestricted', label: 'Unrestricted', description: 'All glitches and exploits are allowed.' },
		{ slug: 'no-major-glitches', label: 'No Major Glitches', description: 'No out-of-bounds glitches or sequence-breaking exploits.' },
		{ slug: 'glitchless', label: 'Glitchless', description: 'No glitches of any kind are allowed.' },
	];

	// ── Helpers ──────────────────────────────────────────────────────────────
	function slugify(text: string): string {
		return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	}
	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 4000);
	}
	function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }
	function fmtDate(d: string): string {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function hydrate(g: any) {
		gameName = g.game_name || '';
		aliases = [...(g.game_name_aliases || [])];
		gameStatus = g.status || 'Active';
		timingMethod = g.timing_method || '';
		genres = [...(g.genres || [])];
		platforms = [...(g.platforms || [])];
		cover = g.cover || '';
		coverPosition = g.cover_position || '';
		fullRuns = deepClone(g.full_runs || []);
		miniChallenges = deepClone(g.mini_challenges || []);
		playerMade = deepClone(g.player_made || []);
		generalRules = g.general_rules || '';
		challengesData = deepClone(g.challenges_data || []);
		glitchesData = deepClone(g.glitches_data || []);
		restrictionsData = deepClone(g.restrictions_data || []);
		characterColumn = deepClone(g.character_column || { enabled: false, label: 'Character' });
		charactersData = deepClone(g.characters_data || []);
		additionalTabs = deepClone(g.additional_tabs || {
			tab1: { enabled: false, title: 'Additional 1', content: '' },
			tab2: { enabled: false, title: 'Additional 2', content: '' }
		});

		// Collect all existing slugs so we can lock them from editing
		const slugs = new Set<string>();
		for (const item of [...fullRuns, ...miniChallenges, ...playerMade, ...challengesData, ...glitchesData, ...restrictionsData, ...charactersData]) {
			if (item.slug) slugs.add(item.slug);
			if (item.children) for (const c of item.children) if (c.slug) slugs.add(c.slug);
		}
		originalSlugs = slugs;
	}

	// ── Snapshot System ─────────────────────────────────────────────────────

	/** Create a full snapshot of the game state before any save */
	async function createSnapshot(description: string) {
		try {
			await supabase.from('game_snapshots').insert({
				game_id: gameId,
				snapshot_data: deepClone(game),
				created_by: userId,
				description
			});
		} catch { /* best-effort */ }
	}

	async function loadSnapshots() {
		snapshotsLoading = true;
		const { data, error } = await supabase
			.from('game_snapshots')
			.select('id, created_at, created_by, description')
			.eq('game_id', gameId)
			.order('created_at', { ascending: false })
			.limit(50);
		if (!error && data) snapshots = data;
		snapshotsLoading = false;
	}

	async function rollbackToSnapshot(snapshotId: string) {
		saving = true;
		const { data: snap, error: fetchErr } = await supabase
			.from('game_snapshots')
			.select('snapshot_data')
			.eq('id', snapshotId)
			.single();

		if (fetchErr || !snap) {
			showToast('error', 'Failed to load snapshot');
			saving = false;
			return;
		}

		// Create a snapshot of current state before rollback (so this action is reversible)
		await createSnapshot(`Pre-rollback backup (rolling back to snapshot ${snapshotId.slice(0, 8)})`);

		const restored = snap.snapshot_data;
		// Remove non-data fields before updating
		delete restored.created_at;
		delete restored.updated_at;

		const { error } = await supabase
			.from('games')
			.update(restored)
			.eq('game_id', gameId);

		if (error) {
			showToast('error', `Rollback failed: ${error.message}`);
			saving = false;
			return;
		}

		// Audit log
		try {
			await supabase.from('audit_log').insert({
				table_name: 'games',
				action: 'game_rollback',
				record_id: gameId,
				user_id: userId,
				old_data: { snapshot_id: snapshotId },
				new_data: { rolled_back_to: snapshotId }
			});
		} catch { /* best-effort */ }

		game = { ...game, ...restored };
		hydrate(game);
		rollbackConfirm = null;
		showToast('success', 'Game rolled back successfully. A backup of the pre-rollback state was saved.');
		await loadSnapshots();
		saving = false;
	}

	// ── Freeze / Unfreeze ───────────────────────────────────────────────────

	async function toggleFreeze() {
		if (!canFreeze) return;
		saving = true;
		const nowFrozen = !isFrozen;
		const updates = nowFrozen
			? { frozen_at: new Date().toISOString(), frozen_by: userId }
			: { frozen_at: null, frozen_by: null };

		if (nowFrozen) {
			await createSnapshot('Pre-freeze snapshot (automatic)');
		}

		const { error } = await supabase.from('games').update(updates).eq('game_id', gameId);
		if (error) {
			showToast('error', `Freeze failed: ${error.message}`);
			saving = false;
			return;
		}

		try {
			await supabase.from('audit_log').insert({
				table_name: 'games',
				action: nowFrozen ? 'game_frozen' : 'game_unfrozen',
				record_id: gameId,
				user_id: userId,
				old_data: { frozen_at: game.frozen_at },
				new_data: updates
			});
		} catch { /* best-effort */ }

		game = { ...game, ...updates };
		showToast('success', nowFrozen ? '🔒 Game frozen. All edits blocked until unfrozen.' : '🔓 Game unfrozen. Edits are now allowed.');
		saving = false;
	}

	// ── Delete Game (Super Admin Only) ──────────────────────────────────────

	async function deleteGame() {
		if (!canDelete) return;
		const confirm1 = prompt(`Type "${gameId}" to permanently delete this game:`);
		if (confirm1 !== gameId) { showToast('error', 'Delete cancelled — game ID did not match.'); return; }

		saving = true;
		await createSnapshot('Pre-deletion snapshot (automatic)');

		const { error } = await supabase.from('games').delete().eq('game_id', gameId);
		if (error) {
			showToast('error', `Delete failed: ${error.message}`);
			saving = false;
			return;
		}

		try {
			await supabase.from('audit_log').insert({
				table_name: 'games',
				action: 'game_deleted',
				record_id: gameId,
				user_id: userId,
				old_data: deepClone(game),
				new_data: null
			});
		} catch { /* best-effort */ }

		goto('/admin/game-editor');
	}

	// ── Save Helpers ────────────────────────────────────────────────────────

	async function saveSection(sectionName: string, updates: Record<string, any>) {
		if (!canEdit) { showToast('error', '🔒 Game is frozen. Only admins can unfreeze.'); return false; }
		saving = true;
		try {
			const oldData: Record<string, any> = {};
			for (const key of Object.keys(updates)) oldData[key] = game[key];

			// Create snapshot before saving
			await createSnapshot(`Before ${sectionName} edit`);

			const { error } = await supabase
				.from('games')
				.update(updates)
				.eq('game_id', gameId);

			if (error) {
				showToast('error', `Save failed: ${error.message}`);
				saving = false;
				return false;
			}

			try {
				await supabase.from('audit_log').insert({
					table_name: 'games',
					action: `game_${sectionName}_edited`,
					record_id: gameId,
					user_id: userId,
					old_data: oldData,
					new_data: updates
				});
			} catch { /* best-effort */ }

			game = { ...game, ...updates };
			showToast('success', `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} saved!`);
			saving = false;
			return true;
		} catch (err: any) {
			showToast('error', `Error: ${err?.message || 'Unknown'}`);
			saving = false;
			return false;
		}
	}

	async function saveGeneral() {
		await saveSection('general', {
			game_name: gameName, game_name_aliases: aliases, status: gameStatus,
			timing_method: timingMethod, genres, platforms,
			cover: cover || null, cover_position: coverPosition || null,
		});
	}
	async function saveCategories() { await saveSection('categories', { full_runs: fullRuns, mini_challenges: miniChallenges, player_made: playerMade }); }
	async function saveRules() { await saveSection('rules', { general_rules: generalRules }); }
	async function saveChallengesGlitches() { await saveSection('challenges', { challenges_data: challengesData, glitches_data: glitchesData }); }
	async function saveRestrictions() { await saveSection('restrictions', { restrictions_data: restrictionsData }); }
	async function saveCharacters() { await saveSection('characters', { character_column: characterColumn, characters_data: charactersData }); }
	async function saveAdditionalTabs() { await saveSection('additional_tabs', { additional_tabs: additionalTabs }); }

	/** Check if a slug already exists in a given list (excluding the item at excludeIndex) */
	function isDuplicateSlug(slug: string, list: any[], excludeIndex: number): boolean {
		if (!slug) return false;
		return list.some((item, i) => i !== excludeIndex && item.slug === slug);
	}

	/** Check if slug is from the original DB data (should be locked) */
	function isLockedSlug(slug: string): boolean {
		return !!slug && originalSlugs.has(slug);
	}

	// ── List Manipulation ────────────────────────────────────────────────────
	function addItem(list: any[], template: any): any[] { return [...list, deepClone(template)]; }
	function removeItem(list: any[], index: number): any[] { return list.filter((_, i) => i !== index); }
	function moveItem(list: any[], from: number, to: number): any[] {
		if (to < 0 || to >= list.length) return list;
		const arr = [...list]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); return arr;
	}

	// ── Data Loading ────────────────────────────────────────────────────────
	async function loadGame() {
		loading = true;
		const { data, error } = await supabase.from('games').select('*').eq('game_id', gameId).single();
		if (error || !data) { showToast('error', 'Game not found'); loading = false; return; }
		game = data;
		hydrate(data);
		loading = false;
	}

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any; session.subscribe(s => sess = s)();
				if (!sess) { goto(`/sign-in?redirect=/admin/game-editor/${gameId}`); return; }

				const { data: { user: u } } = await supabase.auth.getUser();
				userId = u?.id || null;

				const role = await checkAdminRole();
				userRole = role;

				// Access check: admins can edit all, moderators only their games
				if (role?.admin) {
					authorized = true;
				} else if (role?.moderator && role.gameIds?.includes(gameId)) {
					authorized = true;
				} else {
					authorized = false;
				}

				checking = false;
				if (authorized) loadGame();
			}
		});
		return unsub;
	});

	let editingIndex = $state<number | null>(null);
	let editingSection = $state<string | null>(null);
	function toggleEdit(section: string, idx: number) {
		if (editingSection === section && editingIndex === idx) { editingSection = null; editingIndex = null; }
		else { editingSection = section; editingIndex = idx; }
	}
	function isEditing(section: string, idx: number) { return editingSection === section && editingIndex === idx; }
</script>

<svelte:head><title>Edit {game?.game_name || gameId} | Admin | CRC</title></svelte:head>

<div class="page-width">
	<p class="back"><a href="/admin/game-editor">← All Games</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Checking access...</p></div>
	{:else if !authorized}
		<div class="center">
			<h2>🔒 Access Denied</h2>
			<p class="muted">{isModerator ? 'You are not assigned to moderate this game.' : 'Game Editor is available to Admins and Game Moderators.'}</p>
			<a href="/admin/game-editor" class="btn">Back to Games</a>
		</div>
	{:else if loading}
		<div class="center"><div class="spinner"></div><p class="muted">Loading game...</p></div>
	{:else if !game}
		<div class="center"><h2>Game not found</h2><a href="/admin/game-editor" class="btn">Back to Games</a></div>
	{:else}
		<!-- Frozen Banner -->
		{#if isFrozen}
			<div class="frozen-banner">
				<span class="frozen-banner__icon">🔒</span>
				<div class="frozen-banner__text">
					<strong>This game is frozen.</strong> All edits are blocked.
					{#if canFreeze}You can unfreeze it below.{:else}Contact an admin to unfreeze.{/if}
				</div>
				{#if canFreeze}
					<button class="btn btn--unfreeze" onclick={toggleFreeze} disabled={saving}>{saving ? '...' : '🔓 Unfreeze'}</button>
				{/if}
			</div>
		{/if}

		<div class="editor-header">
			<h1>{game.game_name}</h1>
			<div class="editor-header__actions">
				<a href="/games/{gameId}" class="btn btn--small" target="_blank">View on site ↗</a>
				{#if canFreeze && !isFrozen}
					<button class="btn btn--small btn--freeze" onclick={toggleFreeze} disabled={saving} title="Emergency freeze — blocks all edits">🔒 Freeze</button>
				{/if}
				{#if canDelete}
					<button class="btn btn--small btn--delete" onclick={deleteGame} disabled={saving} title="Permanently delete — super admin only">🗑️ Delete</button>
				{/if}
			</div>
		</div>

		<!-- Role indicator -->
		{#if isModerator}
			<div class="role-notice">You are editing as a <strong>Game Moderator</strong>. Deletion and freeze controls are restricted to Admins.</div>
		{/if}

		{#if toast}
			<div class="toast toast--{toast.type}">{toast.text}</div>
		{/if}

		<!-- Tab Navigation -->
		<nav class="tabs">
			{#each tabs as t}
				<button class="tab" class:tab--active={activeTab === t.id} onclick={() => { activeTab = t.id; editingSection = null; editingIndex = null; if (t.id === 'history' && snapshots.length === 0) loadSnapshots(); }}>
					<span class="tab__icon">{t.icon}</span> {t.label}
				</button>
			{/each}
		</nav>

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- GENERAL TAB                                                        -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'general'}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<div class="field-row">
					<label class="field-label">Game Name</label>
					<input type="text" class="field-input" bind:value={gameName} disabled={!canEdit} />
				</div>
				<div class="field-row">
					<label class="field-label">Status</label>
					<select class="field-input" bind:value={gameStatus} disabled={!canEdit}>
						<option value="Active">Active</option>
						<option value="Inactive">Inactive</option>
						<option value="Coming Soon">Coming Soon</option>
					</select>
				</div>
				<div class="field-row">
					<label class="field-label">Main Timing Method</label>
					<input type="text" class="field-input" bind:value={timingMethod} placeholder="e.g. in-game timer, real-time" disabled={!canEdit} />
				</div>
				<div class="field-row">
					<label class="field-label">Cover Image URL</label>
					<input type="text" class="field-input" bind:value={cover} placeholder="https://..." disabled={!canEdit} />
					<span class="field-hint">Recommended: 460×215px or 16:9 aspect ratio. Upload support coming soon.</span>
				</div>
				<div class="field-row">
					<label class="field-label">Cover Position</label>
					<input type="text" class="field-input" bind:value={coverPosition} placeholder="e.g. center top" disabled={!canEdit} />
				</div>
				<div class="field-row">
					<label class="field-label">Aliases</label>
					<div class="tag-editor" class:tag-editor--disabled={!canEdit}>
						{#each aliases as alias, i}
							<span class="tag-pill">{alias} {#if canEdit}<button class="tag-pill__x" onclick={() => { aliases = aliases.filter((_, j) => j !== i); }}>✕</button>{/if}</span>
						{/each}
						{#if canEdit}
							<input type="text" class="tag-editor__input" bind:value={aliasInput} placeholder="Add alias + Enter"
								onkeydown={(e) => { if (e.key === 'Enter' && aliasInput.trim()) { aliases = [...aliases, aliasInput.trim()]; aliasInput = ''; e.preventDefault(); } }} />
						{/if}
					</div>
				</div>
				<div class="field-row">
					<label class="field-label">Genres</label>
					<div class="tag-editor" class:tag-editor--disabled={!canEdit}>
						{#each genres as genre, i}
							<span class="tag-pill">{genre} {#if canEdit}<button class="tag-pill__x" onclick={() => { genres = genres.filter((_, j) => j !== i); }}>✕</button>{/if}</span>
						{/each}
						{#if canEdit}
							<input type="text" class="tag-editor__input" placeholder="Add genre + Enter"
								onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { genres = [...genres, slugify(t.value.trim())]; t.value = ''; e.preventDefault(); } }} />
						{/if}
					</div>
				</div>
				<div class="field-row">
					<label class="field-label">Platforms</label>
					<div class="tag-editor" class:tag-editor--disabled={!canEdit}>
						{#each platforms as plat, i}
							<span class="tag-pill">{plat} {#if canEdit}<button class="tag-pill__x" onclick={() => { platforms = platforms.filter((_, j) => j !== i); }}>✕</button>{/if}</span>
						{/each}
						{#if canEdit}
							<input type="text" class="tag-editor__input" placeholder="Add platform slug + Enter"
								onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { platforms = [...platforms, slugify(t.value.trim())]; t.value = ''; e.preventDefault(); } }} />
						{/if}
					</div>
				</div>
				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveGeneral} disabled={saving}>{saving ? 'Saving...' : '💾 Save General'}</button>
						<button class="btn btn--reset" onclick={() => hydrate(game)}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- CATEGORIES TAB                                                     -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'categories'}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<h3 class="subsection-title">Full Runs</h3>
				<p class="subsection-desc">Categories that require reaching an ending.</p>
				<div class="item-list">
					{#each fullRuns as item, i}
						<div class="item-card" class:item-card--open={isEditing('fr', i)}>
							<div class="item-card__header">
								<button class="item-card__toggle" onclick={() => toggleEdit('fr', i)}>
									<span class="item-card__slug">{item.slug || '(new)'}</span>
									<span class="item-card__label">{item.label || 'Untitled'}</span>
								</button>
								{#if canEdit}
									<div class="item-card__actions">
										<button class="item-btn" onclick={() => { fullRuns = moveItem(fullRuns, i, i - 1); }} disabled={i === 0}>↑</button>
										<button class="item-btn" onclick={() => { fullRuns = moveItem(fullRuns, i, i + 1); }} disabled={i === fullRuns.length - 1}>↓</button>
										<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"?`)) fullRuns = removeItem(fullRuns, i); }}>✕</button>
									</div>
								{/if}
							</div>
							{#if isEditing('fr', i)}
								<div class="item-card__body">
									{#if isLockedSlug(item.slug)}
										<div class="field-row--compact"><label>Slug</label><code class="slug-locked">{item.slug}</code></div>
									{:else}
										<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
									{/if}
									{#if isDuplicateSlug(item.slug, fullRuns, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}
									<div class="field-row--compact"><label>Label</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
									<div class="field-row--compact"><label>Description</label><textarea rows="2" bind:value={item.description} disabled={!canEdit}></textarea></div>
									<span class="field-hint">Markdown supported</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if canEdit}<button class="btn btn--add" onclick={() => { fullRuns = addItem(fullRuns, { slug: '', label: '', description: '' }); editingSection = 'fr'; editingIndex = fullRuns.length - 1; }}>+ Add Full Run Category</button>{/if}

				<h3 class="subsection-title mt-2">Mini-Challenges</h3>
				<p class="subsection-desc">Groups of in-game challenges with child categories.</p>
				<div class="item-list">
					{#each miniChallenges as group, gi}
						<div class="item-card item-card--group" class:item-card--open={isEditing('mc', gi)}>
							<div class="item-card__header">
								<button class="item-card__toggle" onclick={() => toggleEdit('mc', gi)}>
									<span class="item-card__slug">{group.slug || '(new)'}</span>
									<span class="item-card__label">{group.label || 'Untitled Group'}</span>
									<span class="item-card__count">{group.children?.length || 0} children</span>
								</button>
								{#if canEdit}
									<div class="item-card__actions">
										<button class="item-btn" onclick={() => { miniChallenges = moveItem(miniChallenges, gi, gi - 1); }} disabled={gi === 0}>↑</button>
										<button class="item-btn" onclick={() => { miniChallenges = moveItem(miniChallenges, gi, gi + 1); }} disabled={gi === miniChallenges.length - 1}>↓</button>
										<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete group "${group.label}" and all children?`)) miniChallenges = removeItem(miniChallenges, gi); }}>✕</button>
									</div>
								{/if}
							</div>
							{#if isEditing('mc', gi)}
								<div class="item-card__body">
									{#if isLockedSlug(group.slug)}
										<div class="field-row--compact"><label>Slug</label><code class="slug-locked">{group.slug}</code></div>
									{:else}
										<div class="field-row--compact"><label>Slug</label><input type="text" value={group.slug} disabled class="slug-auto" /></div>
									{/if}
									<div class="field-row--compact"><label>Label</label><input type="text" bind:value={group.label} oninput={() => { if (!isLockedSlug(group.slug)) group.slug = slugify(group.label); }} disabled={!canEdit} /></div>
									<div class="field-row--compact"><label>Description</label><textarea rows="2" bind:value={group.description} disabled={!canEdit}></textarea></div>
									<span class="field-hint">Markdown supported</span>
									<div class="children-section">
										<h4 class="children-title">Children</h4>
										{#each group.children || [] as child, ci}
											<div class="child-card">
												<div class="child-card__header">
													<span class="child-card__arrow">└</span>
													{#if isLockedSlug(child.slug)}
														<code class="slug-locked slug-locked--sm">{child.slug}</code>
													{:else}
														<input type="text" class="child-row__input" value={child.slug} disabled class="slug-auto" />
													{/if}
													<input type="text" class="child-row__input child-row__input--wide" bind:value={child.label} oninput={() => { if (!isLockedSlug(child.slug)) child.slug = slugify(child.label); }} disabled={!canEdit} />
													<label class="child-row__check"><input type="checkbox" bind:checked={child.fixed_character} disabled={!canEdit} /> Fixed char</label>
													{#if canEdit}<button class="item-btn item-btn--danger" onclick={() => { group.children = group.children.filter((_: any, j: number) => j !== ci); miniChallenges = [...miniChallenges]; }}>✕</button>{/if}
												</div>
												<div class="child-card__desc">
													<textarea rows="2" bind:value={child.description} placeholder="Description (Markdown supported)..." disabled={!canEdit}></textarea>
												</div>
											</div>
										{/each}
										{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!group.children) group.children = []; group.children = [...group.children, { slug: '', label: '', description: '', fixed_character: false }]; miniChallenges = [...miniChallenges]; }}>+ Add Child</button>{/if}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if canEdit}<button class="btn btn--add" onclick={() => { miniChallenges = addItem(miniChallenges, { slug: '', label: '', description: '', children: [] }); editingSection = 'mc'; editingIndex = miniChallenges.length - 1; }}>+ Add Mini-Challenge Group</button>{/if}

				<h3 class="subsection-title mt-2">Player-Made</h3>
				<p class="subsection-desc">Community-created challenge categories.</p>
				<div class="item-list">
					{#each playerMade as item, i}
						<div class="item-card" class:item-card--open={isEditing('pm', i)}>
							<div class="item-card__header">
								<button class="item-card__toggle" onclick={() => toggleEdit('pm', i)}>
									<span class="item-card__slug">{item.slug || '(new)'}</span>
									<span class="item-card__label">{item.label || 'Untitled'}</span>
								</button>
								{#if canEdit}
									<div class="item-card__actions">
										<button class="item-btn" onclick={() => { playerMade = moveItem(playerMade, i, i - 1); }} disabled={i === 0}>↑</button>
										<button class="item-btn" onclick={() => { playerMade = moveItem(playerMade, i, i + 1); }} disabled={i === playerMade.length - 1}>↓</button>
										<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"?`)) playerMade = removeItem(playerMade, i); }}>✕</button>
									</div>
								{/if}
							</div>
							{#if isEditing('pm', i)}
								<div class="item-card__body">
									{#if isLockedSlug(item.slug)}
										<div class="field-row--compact"><label>Slug</label><code class="slug-locked">{item.slug}</code></div>
									{:else}
										<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
									{/if}
									<div class="field-row--compact"><label>Label</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
									<div class="field-row--compact"><label>Description</label><textarea rows="2" bind:value={item.description} disabled={!canEdit}></textarea></div>
									<span class="field-hint">Markdown supported</span>
									<div class="field-row--compact"><label>Creator</label><input type="text" bind:value={item.creator} placeholder="Runner ID" disabled={!canEdit} /></div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if canEdit}<button class="btn btn--add" onclick={() => { playerMade = addItem(playerMade, { slug: '', label: '', description: '' }); editingSection = 'pm'; editingIndex = playerMade.length - 1; }}>+ Add Player-Made Category</button>{/if}

				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveCategories} disabled={saving}>{saving ? 'Saving...' : '💾 Save Categories'}</button>
						<button class="btn btn--reset" onclick={() => hydrate(game)}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- RULES TAB                                                          -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'rules'}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<p class="subsection-desc">Markdown supported. These rules are displayed on the game's Rules tab.</p>
				<textarea class="rules-textarea" rows="20" bind:value={generalRules} disabled={!canEdit}></textarea>
				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveRules} disabled={saving}>{saving ? 'Saving...' : '💾 Save Rules'}</button>
						<button class="btn btn--reset" onclick={() => { generalRules = game.general_rules || ''; }}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- CHALLENGES & GLITCHES TAB                                          -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'challenges'}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<h3 class="subsection-title">Standard Challenges</h3>
				<p class="subsection-desc">Challenge types runners can apply (e.g. Hitless, Damageless). Descriptions support Markdown.</p>
				<div class="item-list">
					{#each challengesData as item, i}
						<div class="item-card" class:item-card--open={isEditing('ch', i)}>
							<div class="item-card__header">
								<button class="item-card__toggle" onclick={() => toggleEdit('ch', i)}>
									<span class="item-card__slug">{item.slug || '(new)'}</span>
									<span class="item-card__label">{item.label || 'Untitled'}</span>
									{#if item.game_specific}<span class="badge badge--game">Game-specific</span>{/if}
								</button>
								{#if canEdit}
									<div class="item-card__actions">
										<button class="item-btn" onclick={() => { challengesData = moveItem(challengesData, i, i - 1); }} disabled={i === 0}>↑</button>
										<button class="item-btn" onclick={() => { challengesData = moveItem(challengesData, i, i + 1); }} disabled={i === challengesData.length - 1}>↓</button>
										<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"?`)) challengesData = removeItem(challengesData, i); }}>✕</button>
									</div>
								{/if}
							</div>
							{#if isEditing('ch', i)}
								<div class="item-card__body">
									{#if isLockedSlug(item.slug)}
										<div class="field-row--compact"><label>Slug</label><code class="slug-locked">{item.slug}</code></div>
									{:else}
										<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
									{/if}
									{#if isDuplicateSlug(item.slug, challengesData, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}
									<div class="field-row--compact"><label>Label</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
									<div class="field-row--compact"><label>Description</label><textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea></div>
									<span class="field-hint">Markdown supported</span>
									<label class="child-row__check mt-1"><input type="checkbox" bind:checked={item.game_specific} disabled={!canEdit} /> Game-specific challenge (unique to this game)</label>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if canEdit}
					<div class="add-row">
						<button class="btn btn--add" onclick={() => { challengesData = addItem(challengesData, { slug: '', label: '', description: '', game_specific: true }); editingSection = 'ch'; editingIndex = challengesData.length - 1; }}>+ Add Custom Challenge</button>
						<div class="preset-dropdown">
							<select class="field-input field-input--short" onchange={(e) => {
								const sel = (e.target as HTMLSelectElement).value;
								if (!sel) return;
								const preset = COMMON_CHALLENGES.find(c => c.slug === sel);
								if (preset && !challengesData.some(c => c.slug === preset.slug)) {
									challengesData = [...challengesData, { ...deepClone(preset), game_specific: false }];
									editingSection = 'ch'; editingIndex = challengesData.length - 1;
								}
								(e.target as HTMLSelectElement).value = '';
							}}>
								<option value="">+ Add common challenge…</option>
								{#each COMMON_CHALLENGES.filter(c => !challengesData.some(d => d.slug === c.slug)) as c}
									<option value={c.slug}>{c.label}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}

				<h3 class="subsection-title mt-2">Glitch Categories</h3>
				<p class="subsection-desc">Glitch policies (e.g. Unrestricted, No Major Glitches, Glitchless). Descriptions support Markdown.</p>
				<div class="item-list">
					{#each glitchesData as item, i}
						<div class="item-card" class:item-card--open={isEditing('gl', i)}>
							<div class="item-card__header">
								<button class="item-card__toggle" onclick={() => toggleEdit('gl', i)}>
									<span class="item-card__slug">{item.slug || '(new)'}</span>
									<span class="item-card__label">{item.label || 'Untitled'}</span>
									{#if item.game_specific}<span class="badge badge--game">Game-specific</span>{/if}
								</button>
								{#if canEdit}
									<div class="item-card__actions">
										<button class="item-btn" onclick={() => { glitchesData = moveItem(glitchesData, i, i - 1); }} disabled={i === 0}>↑</button>
										<button class="item-btn" onclick={() => { glitchesData = moveItem(glitchesData, i, i + 1); }} disabled={i === glitchesData.length - 1}>↓</button>
										<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"?`)) glitchesData = removeItem(glitchesData, i); }}>✕</button>
									</div>
								{/if}
							</div>
							{#if isEditing('gl', i)}
								<div class="item-card__body">
									{#if isLockedSlug(item.slug)}
										<div class="field-row--compact"><label>Slug</label><code class="slug-locked">{item.slug}</code></div>
									{:else}
										<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
									{/if}
									{#if isDuplicateSlug(item.slug, glitchesData, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}
									<div class="field-row--compact"><label>Label</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
									<div class="field-row--compact"><label>Description</label><textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea></div>
									<span class="field-hint">Markdown supported</span>
									<label class="child-row__check mt-1"><input type="checkbox" bind:checked={item.game_specific} disabled={!canEdit} /> Game-specific glitch category (unique to this game)</label>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if canEdit}
					<div class="add-row">
						<button class="btn btn--add" onclick={() => { glitchesData = addItem(glitchesData, { slug: '', label: '', description: '', game_specific: true }); editingSection = 'gl'; editingIndex = glitchesData.length - 1; }}>+ Add Custom Glitch Category</button>
						<div class="preset-dropdown">
							<select class="field-input field-input--short" onchange={(e) => {
								const sel = (e.target as HTMLSelectElement).value;
								if (!sel) return;
								const preset = COMMON_GLITCHES.find(c => c.slug === sel);
								if (preset && !glitchesData.some(c => c.slug === preset.slug)) {
									glitchesData = [...glitchesData, { ...deepClone(preset), game_specific: false }];
									editingSection = 'gl'; editingIndex = glitchesData.length - 1;
								}
								(e.target as HTMLSelectElement).value = '';
							}}>
								<option value="">+ Add common glitch category…</option>
								{#each COMMON_GLITCHES.filter(c => !glitchesData.some(d => d.slug === c.slug)) as c}
									<option value={c.slug}>{c.label}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}

				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveChallengesGlitches} disabled={saving}>{saving ? 'Saving...' : '💾 Save Challenges & Glitches'}</button>
						<button class="btn btn--reset" onclick={() => hydrate(game)}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- RESTRICTIONS TAB                                                   -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'restrictions'}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<p class="subsection-desc">Optional restrictions. A restriction can have children (e.g. "One God Only" → "Hestia Only"). Both parent and children are selectable by runners. Descriptions support Markdown.</p>
				<div class="item-list">
					{#each restrictionsData as item, i}
						<div class="item-card" class:item-card--group={item.children?.length > 0} class:item-card--open={isEditing('rs', i)}>
							<div class="item-card__header">
								<button class="item-card__toggle" onclick={() => toggleEdit('rs', i)}>
									<span class="item-card__slug">{item.slug || '(new)'}</span>
									<span class="item-card__label">{item.label || 'Untitled'}</span>
									{#if item.children?.length}<span class="item-card__count">{item.children.length} children</span>{/if}
								</button>
								{#if canEdit}
									<div class="item-card__actions">
										<button class="item-btn" onclick={() => { restrictionsData = moveItem(restrictionsData, i, i - 1); }} disabled={i === 0}>↑</button>
										<button class="item-btn" onclick={() => { restrictionsData = moveItem(restrictionsData, i, i + 1); }} disabled={i === restrictionsData.length - 1}>↓</button>
										<button class="item-btn item-btn--danger" onclick={() => { if (confirm(`Delete "${item.label}"${item.children?.length ? ' and all children' : ''}?`)) restrictionsData = removeItem(restrictionsData, i); }}>✕</button>
									</div>
								{/if}
							</div>
							{#if isEditing('rs', i)}
								<div class="item-card__body">
									{#if isLockedSlug(item.slug)}
										<div class="field-row--compact"><label>Slug</label><code class="slug-locked">{item.slug}</code></div>
									{:else}
										<div class="field-row--compact"><label>Slug</label><input type="text" value={item.slug} disabled class="slug-auto" /></div>
									{/if}
									{#if isDuplicateSlug(item.slug, restrictionsData, i)}<div class="slug-warning">⚠ This slug already exists in this list</div>{/if}
									<div class="field-row--compact"><label>Label</label><input type="text" bind:value={item.label} oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} /></div>
									<div class="field-row--compact"><label>Description</label><textarea rows="3" bind:value={item.description} disabled={!canEdit}></textarea></div>
									<span class="field-hint">Markdown supported</span>
									<div class="children-section">
										<h4 class="children-title">Children <span class="muted">(specific variants)</span></h4>
										{#each item.children || [] as child, ci}
											<div class="child-card">
												<div class="child-card__header">
													<span class="child-card__arrow">└</span>
													{#if isLockedSlug(child.slug)}
														<code class="slug-locked slug-locked--sm">{child.slug}</code>
													{:else}
														<input type="text" class="child-row__input" value={child.slug} disabled class="slug-auto" />
													{/if}
													<input type="text" class="child-row__input child-row__input--wide" bind:value={child.label} oninput={() => { if (!isLockedSlug(child.slug)) child.slug = slugify(child.label); }} disabled={!canEdit} />
													{#if canEdit}<button class="item-btn item-btn--danger" onclick={() => { item.children = item.children.filter((_: any, j: number) => j !== ci); restrictionsData = [...restrictionsData]; }}>✕</button>{/if}
												</div>
												<div class="child-card__desc">
													<textarea rows="2" bind:value={child.description} placeholder="Description (Markdown supported)..." disabled={!canEdit}></textarea>
												</div>
											</div>
										{/each}
										{#if canEdit}<button class="btn btn--add btn--add-sm" onclick={() => { if (!item.children) item.children = []; item.children = [...item.children, { slug: '', label: '', description: '' }]; restrictionsData = [...restrictionsData]; }}>+ Add Child Restriction</button>{/if}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if canEdit}<button class="btn btn--add" onclick={() => { restrictionsData = addItem(restrictionsData, { slug: '', label: '', description: '' }); editingSection = 'rs'; editingIndex = restrictionsData.length - 1; }}>+ Add Restriction</button>{/if}

				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveRestrictions} disabled={saving}>{saving ? 'Saving...' : '💾 Save Restrictions'}</button>
						<button class="btn btn--reset" onclick={() => hydrate(game)}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- CHARACTERS TAB                                                     -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'characters'}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<div class="field-row">
					<label class="toggle-row">
						<input type="checkbox" bind:checked={characterColumn.enabled} disabled={!canEdit} />
						<span>Enable Character Column</span>
					</label>
				</div>
				{#if characterColumn.enabled}
					<div class="field-row">
						<label class="field-label">Column Label</label>
						<input type="text" class="field-input field-input--short" bind:value={characterColumn.label} placeholder="Character / Weapon / Class..." disabled={!canEdit} />
					</div>
					<h3 class="subsection-title mt-1">Options</h3>
					<div class="item-list">
						{#each charactersData as item, i}
							<div class="item-card item-card--compact">
								<div class="item-card__header">
									<div class="item-card__inline">
										{#if isLockedSlug(item.slug)}
											<code class="slug-locked slug-locked--sm">{item.slug}</code>
										{:else}
											<input type="text" class="inline-input inline-input--slug slug-auto" value={item.slug} disabled />
										{/if}
										<input type="text" class="inline-input" bind:value={item.label} placeholder="Display Name" oninput={() => { if (!isLockedSlug(item.slug)) item.slug = slugify(item.label); }} disabled={!canEdit} />
									</div>
									{#if canEdit}
										<div class="item-card__actions">
											<button class="item-btn" onclick={() => { charactersData = moveItem(charactersData, i, i - 1); }} disabled={i === 0}>↑</button>
											<button class="item-btn" onclick={() => { charactersData = moveItem(charactersData, i, i + 1); }} disabled={i === charactersData.length - 1}>↓</button>
											<button class="item-btn item-btn--danger" onclick={() => { charactersData = removeItem(charactersData, i); }}>✕</button>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
					{#if canEdit}<button class="btn btn--add" onclick={() => { charactersData = addItem(charactersData, { slug: '', label: '' }); }}>+ Add Character</button>{/if}
				{/if}
				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveCharacters} disabled={saving}>{saving ? 'Saving...' : '💾 Save Characters'}</button>
						<button class="btn btn--reset" onclick={() => hydrate(game)}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- ADDITIONAL TAB 1                                                   -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'additional1' && additionalTabs.tab1.enabled}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<h3 class="subsection-title">{additionalTabs.tab1.title || 'Additional 1'}</h3>
				<p class="subsection-desc">Custom content tab. Markdown supported.</p>
				<textarea class="rules-textarea" rows="20" bind:value={additionalTabs.tab1.content} disabled={!canEdit}></textarea>
				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveAdditionalTabs} disabled={saving}>{saving ? 'Saving...' : '💾 Save'}</button>
						<button class="btn btn--reset" onclick={() => { additionalTabs = deepClone(game.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '' }, tab2: { enabled: false, title: 'Additional 2', content: '' } }); }}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- ADDITIONAL TAB 2                                                   -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'additional2' && additionalTabs.tab2.enabled}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<h3 class="subsection-title">{additionalTabs.tab2.title || 'Additional 2'}</h3>
				<p class="subsection-desc">Custom content tab. Markdown supported.</p>
				<textarea class="rules-textarea" rows="20" bind:value={additionalTabs.tab2.content} disabled={!canEdit}></textarea>
				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveAdditionalTabs} disabled={saving}>{saving ? 'Saving...' : '💾 Save'}</button>
						<button class="btn btn--reset" onclick={() => { additionalTabs = deepClone(game.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '' }, tab2: { enabled: false, title: 'Additional 2', content: '' } }); }}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- CUSTOM TABS SETTINGS                                               -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'additional-settings'}
			<section class="editor-section" class:editor-section--frozen={isFrozen && !isAdmin}>
				<h3 class="subsection-title">Custom Tab Settings</h3>
				<p class="subsection-desc">Enable up to 2 custom content tabs for this game. Use these for paths, strategies, resources, or any game-specific content.</p>

				<div class="custom-tab-config">
					<div class="custom-tab-config__item">
						<label class="toggle-row">
							<input type="checkbox" bind:checked={additionalTabs.tab1.enabled} disabled={!canEdit} />
							<span>Enable Additional Tab 1</span>
						</label>
						{#if additionalTabs.tab1.enabled}
							<div class="field-row mt-1">
								<label class="field-label">Tab Title</label>
								<input type="text" class="field-input field-input--short" bind:value={additionalTabs.tab1.title} placeholder="e.g. Paths, Strategies, Resources..." disabled={!canEdit} />
							</div>
						{/if}
					</div>
					<div class="custom-tab-config__item mt-2">
						<label class="toggle-row">
							<input type="checkbox" bind:checked={additionalTabs.tab2.enabled} disabled={!canEdit} />
							<span>Enable Additional Tab 2</span>
						</label>
						{#if additionalTabs.tab2.enabled}
							<div class="field-row mt-1">
								<label class="field-label">Tab Title</label>
								<input type="text" class="field-input field-input--short" bind:value={additionalTabs.tab2.title} placeholder="e.g. Routes, Tier Lists..." disabled={!canEdit} />
							</div>
						{/if}
					</div>
				</div>

				{#if canEdit}
					<div class="section-actions">
						<button class="btn btn--save" onclick={saveAdditionalTabs} disabled={saving}>{saving ? 'Saving...' : '💾 Save Tab Settings'}</button>
						<button class="btn btn--reset" onclick={() => { additionalTabs = deepClone(game.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '' }, tab2: { enabled: false, title: 'Additional 2', content: '' } }); }}>↩ Reset</button>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- HISTORY / SNAPSHOTS TAB                                            -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'history'}
			<section class="editor-section">
				<h3 class="subsection-title">Snapshots</h3>
				<p class="subsection-desc">Every save creates a snapshot of the previous state. Admins can rollback to any snapshot.</p>

				{#if snapshotsLoading}
					<div class="center-sm"><div class="spinner spinner--sm"></div></div>
				{:else if snapshots.length === 0}
					<div class="empty-sm"><p class="muted">No snapshots yet. They are created automatically when you save changes.</p></div>
				{:else}
					<div class="snapshot-list">
						{#each snapshots as snap}
							<div class="snapshot-row" class:snapshot-row--active={rollbackConfirm === snap.id}>
								<div class="snapshot-row__info">
									<span class="snapshot-row__date">{fmtDate(snap.created_at)}</span>
									<span class="snapshot-row__desc">{snap.description || 'Manual save'}</span>
								</div>
								<div class="snapshot-row__actions">
									{#if isAdmin}
										{#if rollbackConfirm === snap.id}
											<button class="btn btn--small btn--save" onclick={() => rollbackToSnapshot(snap.id)} disabled={saving}>{saving ? '...' : 'Confirm Rollback'}</button>
											<button class="btn btn--small" onclick={() => rollbackConfirm = null}>Cancel</button>
										{:else}
											<button class="btn btn--small btn--rollback" onclick={() => rollbackConfirm = snap.id}>↩ Rollback</button>
										{/if}
									{:else}
										<span class="muted" style="font-size:0.8rem;">Admin required</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="section-actions">
					<button class="btn" onclick={loadSnapshots} disabled={snapshotsLoading}>{snapshotsLoading ? 'Loading...' : '🔄 Refresh'}</button>
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	.center { text-align: center; padding: 4rem 0; } .center-sm { text-align: center; padding: 2rem; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	.spinner--sm { width: 24px; height: 24px; }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Frozen banner */
	.frozen-banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.9rem 1.2rem; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.4); border-radius: 10px; margin-bottom: 1rem; }
	.frozen-banner__icon { font-size: 1.5rem; flex-shrink: 0; }
	.frozen-banner__text { flex: 1; font-size: 0.9rem; }
	.frozen-banner__text strong { color: #ef4444; }

	/* Header */
	.editor-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
	.editor-header h1 { margin: 0; }
	.editor-header__actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }

	.btn { display: inline-flex; align-items: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: none; color: var(--fg); cursor: pointer; font-size: 0.9rem; text-decoration: none; font-family: inherit; }
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn--small { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
	.btn--save { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }
	.btn--save:hover { opacity: 0.9; color: #fff; }
	.btn--reset { color: var(--muted); }
	.btn--add { border-style: dashed; color: var(--muted); font-size: 0.85rem; padding: 0.4rem 0.8rem; margin-top: 0.5rem; }
	.btn--add:hover { color: var(--accent); border-color: var(--accent); }
	.btn--add-sm { font-size: 0.8rem; padding: 0.3rem 0.6rem; }
	.btn--freeze { border-color: #f59e0b; color: #f59e0b; } .btn--freeze:hover { background: #f59e0b; color: #fff; }
	.btn--unfreeze { background: #22c55e; color: #fff; border-color: #22c55e; font-weight: 600; } .btn--unfreeze:hover { opacity: 0.9; }
	.btn--delete { border-color: #ef4444; color: #ef4444; } .btn--delete:hover { background: #ef4444; color: #fff; }
	.btn--rollback { border-color: #f59e0b; color: #f59e0b; } .btn--rollback:hover { background: #f59e0b; color: #fff; }

	.role-notice { padding: 0.6rem 1rem; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; font-size: 0.85rem; margin-bottom: 1rem; }

	/* Toast */
	.toast { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; font-weight: 500; }
	.toast--success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
	.toast--error { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }

	/* Tabs */
	.tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
	.tab { background: none; border: 1px solid transparent; border-radius: 8px 8px 0 0; padding: 0.5rem 0.9rem; font-size: 0.85rem; color: var(--muted); cursor: pointer; font-family: inherit; transition: all 0.15s; }
	.tab:hover { color: var(--fg); background: rgba(255,255,255,0.03); }
	.tab--active { color: var(--accent); border-color: var(--border); border-bottom-color: var(--bg); background: var(--surface); font-weight: 600; }
	.tab__icon { font-size: 0.9rem; }

	/* Editor sections */
	.editor-section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
	.editor-section--frozen { opacity: 0.5; pointer-events: none; user-select: none; }
	.section-actions { display: flex; gap: 0.5rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
	.subsection-title { margin: 0 0 0.25rem; font-size: 1rem; }
	.subsection-desc { margin: 0 0 0.75rem; font-size: 0.85rem; color: var(--muted); }
	.mt-1 { margin-top: 1rem; } .mt-2 { margin-top: 1.5rem; }

	/* Fields */
	.field-row { margin-bottom: 0.75rem; }
	.field-label { display: block; font-weight: 600; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.03em; }
	.field-input { width: 100%; padding: 0.5rem 0.7rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; box-sizing: border-box; }
	.field-input:focus { outline: none; border-color: var(--accent); }
	.field-input:disabled { opacity: 0.5; cursor: not-allowed; }
	.field-input--short { max-width: 300px; }
	.field-row--compact { display: grid; grid-template-columns: 90px 1fr; gap: 0.4rem; align-items: start; margin-bottom: 0.4rem; }
	.field-row--compact label { font-size: 0.78rem; font-weight: 600; color: var(--muted); padding-top: 0.55rem; }
	.field-row--compact input, .field-row--compact textarea { width: 100%; padding: 0.4rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--fg); font-size: 0.85rem; font-family: inherit; box-sizing: border-box; }
	.field-row--compact input:focus, .field-row--compact textarea:focus { outline: none; border-color: var(--accent); }
	.field-row--compact input:disabled, .field-row--compact textarea:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Tag editor */
	.tag-editor { display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0.4rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; min-height: 38px; align-items: center; }
	.tag-editor:focus-within { border-color: var(--accent); }
	.tag-editor--disabled { opacity: 0.5; pointer-events: none; }
	.tag-editor__input { flex: 1; min-width: 120px; border: none; background: none; color: var(--fg); font-size: 0.85rem; font-family: inherit; padding: 0.2rem 0.3rem; outline: none; }
	.tag-pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.5rem; background: var(--accent); color: #fff; border-radius: 12px; font-size: 0.78rem; font-weight: 500; }
	.tag-pill__x { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.7rem; padding: 0 2px; }
	.tag-pill__x:hover { color: #fff; }

	.toggle-row { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.9rem; cursor: pointer; }
	.toggle-row input { width: 18px; height: 18px; accent-color: var(--accent); }

	/* Item cards */
	.item-list { display: flex; flex-direction: column; gap: 0.35rem; }
	.item-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	.item-card--open { border-color: var(--accent); }
	.item-card--group { border-left: 3px solid var(--accent); }
	.item-card--compact .item-card__header { padding: 0.35rem 0.5rem; }
	.item-card__header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.65rem; }
	.item-card__toggle { display: flex; align-items: center; gap: 0.5rem; flex: 1; background: none; border: none; color: var(--fg); cursor: pointer; font-family: inherit; font-size: inherit; text-align: left; padding: 0; min-width: 0; }
	.item-card__slug { font-size: 0.72rem; color: var(--muted); font-family: monospace; background: var(--surface); padding: 0.1rem 0.35rem; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
	.item-card__label { font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.item-card__count { font-size: 0.72rem; color: var(--muted); white-space: nowrap; }
	.item-card__actions { display: flex; gap: 0.15rem; flex-shrink: 0; }
	.item-card__inline { display: flex; gap: 0.35rem; flex: 1; min-width: 0; }
	.item-card__body { border-top: 1px solid var(--border); padding: 0.75rem; }
	.item-btn { background: none; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); cursor: pointer; font-size: 0.75rem; padding: 0.2rem 0.4rem; font-family: inherit; line-height: 1; }
	.item-btn:hover { color: var(--fg); border-color: var(--fg); }
	.item-btn:disabled { opacity: 0.25; cursor: not-allowed; }
	.item-btn--danger:hover { color: #ef4444; border-color: #ef4444; }

	.inline-input { flex: 1; min-width: 0; padding: 0.3rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--fg); font-size: 0.85rem; font-family: inherit; }
	.inline-input:focus { outline: none; border-color: var(--accent); }
	.inline-input:disabled { opacity: 0.5; cursor: not-allowed; }
	.inline-input--slug { max-width: 140px; font-family: monospace; font-size: 0.8rem; }

	/* Slug locking */
	.slug-locked { display: inline-block; padding: 0.35rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem; color: var(--muted); }
	.slug-locked--sm { padding: 0.25rem 0.45rem; font-size: 0.75rem; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.slug-auto { opacity: 0.5; font-style: italic; }
	.slug-warning { padding: 0.35rem 0.6rem; margin: 0.25rem 0; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; font-size: 0.8rem; color: #ef4444; }
	.field-hint { display: block; font-size: 0.75rem; color: var(--muted); margin-top: 0.25rem; font-style: italic; }

	/* Badges */
	.badge { padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; white-space: nowrap; }
	.badge--game { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }

	/* Add row with preset dropdown */
	.add-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
	.preset-dropdown select { font-size: 0.85rem; min-width: 200px; }

	/* Custom tab config */
	.custom-tab-config__item { padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }

	.children-section { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
	.children-title { font-size: 0.85rem; font-weight: 700; margin: 0 0 0.5rem; }
	.children-title .muted { font-weight: 400; font-size: 0.78rem; }
	.child-row { display: flex; gap: 0.35rem; align-items: center; margin-bottom: 0.35rem; }
	.child-row__input { padding: 0.35rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--fg); font-size: 0.82rem; font-family: inherit; width: 110px; }
	.child-row__input--wide { flex: 1; }
	.child-row__input:focus { outline: none; border-color: var(--accent); }
	.child-row__input:disabled { opacity: 0.5; }
	.child-row__check { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--muted); white-space: nowrap; cursor: pointer; }
	.child-row__check input { width: 14px; height: 14px; accent-color: var(--accent); }
	.child-card { margin-bottom: 0.5rem; padding-left: 0.5rem; border-left: 2px solid var(--border); }
	.child-card__header { display: flex; gap: 0.35rem; align-items: center; }
	.child-card__arrow { color: var(--muted); font-family: monospace; font-size: 0.85rem; flex-shrink: 0; }
	.child-card__desc { margin-top: 0.25rem; padding-left: 1.2rem; }
	.child-card__desc textarea { width: 100%; padding: 0.35rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--fg); font-size: 0.82rem; font-family: inherit; box-sizing: border-box; }
	.child-card__desc textarea:focus { outline: none; border-color: var(--accent); }
	.child-card__desc textarea:disabled { opacity: 0.5; }

	.rules-textarea { width: 100%; padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; color: var(--fg); font-size: 0.9rem; font-family: 'SF Mono', 'Fira Code', monospace; line-height: 1.6; resize: vertical; box-sizing: border-box; }
	.rules-textarea:focus { outline: none; border-color: var(--accent); }
	.rules-textarea:disabled { opacity: 0.5; }

	/* Snapshots */
	.snapshot-list { display: flex; flex-direction: column; gap: 0.35rem; }
	.snapshot-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.65rem 0.85rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.snapshot-row--active { border-color: #f59e0b; background: rgba(245, 158, 11, 0.05); }
	.snapshot-row__info { flex: 1; min-width: 0; }
	.snapshot-row__date { display: block; font-size: 0.82rem; font-weight: 600; }
	.snapshot-row__desc { display: block; font-size: 0.78rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.snapshot-row__actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
	.empty-sm { text-align: center; padding: 1.5rem; }
	.muted { color: var(--muted); }

	@media (max-width: 640px) {
		.tabs { gap: 0.15rem; } .tab { padding: 0.4rem 0.5rem; font-size: 0.78rem; } .tab__icon { display: none; }
		.editor-section { padding: 1rem; }
		.field-row--compact { grid-template-columns: 1fr; } .field-row--compact label { padding-top: 0; }
		.item-card__slug { display: none; }
		.child-row { flex-wrap: wrap; }
		.editor-header { flex-direction: column; align-items: flex-start; }
		.frozen-banner { flex-direction: column; text-align: center; }
		.snapshot-row { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
	}
</style>
