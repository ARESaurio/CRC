<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole, getAccessToken } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import type { Game, FullRunCategory, MiniChallengeGroup, PlayerMadeChallenge, ChallengeType, GlitchCategory, Restriction, CharacterColumn, CharacterOption } from '$types';
	import { deepClone } from './_helpers.js';

	import GeneralTab from './GeneralTab.svelte';
	import CategoriesTab from './CategoriesTab.svelte';
	import RulesTab from './RulesTab.svelte';
	import ChallengesTab from './ChallengesTab.svelte';
	import RestrictionsTab from './RestrictionsTab.svelte';
	import CharactersTab from './CharactersTab.svelte';
	import CustomTabsSettings from './CustomTabsSettings.svelte';
	import AdditionalContentTab from './AdditionalContentTab.svelte';
	import HistoryTab from './HistoryTab.svelte';

	// ── Auth / access state ─────────────────────────────────────────────────
	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let lastSaveAt = $state(0);
	let toast = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let game = $state<Game | null>(null);
	let activeTab = $state('general');
	let userRole = $state<{ admin: boolean; superAdmin: boolean; moderator: boolean; verifier: boolean; runnerId: string | null; gameIds: string[] } | null>(null);
	let userId = $state<string | null>(null);

	const gameId = $derived($page.params.game_id ?? '');

	// ── Additional Tabs ──────────────────────────────────────────────────────
	let additionalTabs = $state<{ tab1: { enabled: boolean; title: string; content: string }; tab2: { enabled: boolean; title: string; content: string } }>({
		tab1: { enabled: false, title: 'Additional 1', content: '' },
		tab2: { enabled: false, title: 'Additional 2', content: '' }
	});

	// ── Permission Derivations ───────────────────────────────────────────────
	const isSuperAdmin = $derived(userRole?.superAdmin === true);
	const isAdmin = $derived(userRole?.admin === true);
	const isModerator = $derived(userRole?.moderator === true && !userRole?.admin);
	const canEdit = $derived(!game?.frozen_at || isAdmin);
	const canEditMeta = $derived(canEdit && isAdmin);
	const canDelete = $derived(isSuperAdmin);
	const canFreeze = $derived(isAdmin);
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
	let fullRuns = $state<FullRunCategory[]>([]);
	let miniChallenges = $state<MiniChallengeGroup[]>([]);
	let playerMade = $state<PlayerMadeChallenge[]>([]);
	let generalRules = $state('');
	let challengesData = $state<ChallengeType[]>([]);
	let glitchesData = $state<GlitchCategory[]>([]);
	let restrictionsData = $state<Restriction[]>([]);
	let characterColumn = $state<CharacterColumn>({ enabled: false, label: 'Character' });
	let charactersData = $state<CharacterOption[]>([]);

	// History / Snapshots
	let snapshots = $state<any[]>([]);
	let snapshotsLoading = $state(false);
	let rollbackConfirm = $state<string | null>(null);

	// Track original slugs (read-only after load)
	let originalSlugs = $state<Set<string>>(new Set());

	// ── Helpers ──────────────────────────────────────────────────────────────
	function showToast(type: 'success' | 'error', text: string) {
		toast = { type, text };
		setTimeout(() => toast = null, 4000);
	}

	function hydrate(g: Game) {
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

		const slugs = new Set<string>();
		for (const item of [...fullRuns, ...miniChallenges, ...playerMade, ...challengesData, ...glitchesData, ...restrictionsData, ...charactersData]) {
			if (item.slug) slugs.add(item.slug);
			if ('children' in item && item.children) for (const c of item.children) if (c.slug) slugs.add(c.slug);
		}
		originalSlugs = slugs;
	}

	// ── Worker Call Helper ───────────────────────────────────────────────────
	async function workerCall(endpoint: string, payload: Record<string, any>): Promise<{ ok: boolean; data?: any; error?: string }> {
		const token = await getAccessToken();
		if (!token) return { ok: false, error: 'Not authenticated. Please sign in again.' };
		try {
			const res = await fetch(`${PUBLIC_WORKER_URL}${endpoint}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...payload, token })
			});
			const data = await res.json();
			if (res.ok && data.ok) return { ok: true, data };
			return { ok: false, error: data.error || `Request failed (${res.status})` };
		} catch (err: any) {
			return { ok: false, error: err?.message || 'Network error' };
		}
	}

	// ── Save ─────────────────────────────────────────────────────────────────
	async function saveSection(sectionName: string, updates: Record<string, any>) {
		if (!canEdit) { showToast('error', '🔒 Game is frozen. Only admins can unfreeze.'); return false; }
		const now = Date.now();
		if (now - lastSaveAt < 3000) { showToast('error', 'Please wait a moment before saving again.'); return false; }
		saving = true;
		lastSaveAt = now;
		try {
			const result = await workerCall('/game-editor/save', { game_id: gameId, section_name: sectionName, updates });
			if (!result.ok) { showToast('error', `Save failed: ${result.error}`); saving = false; return false; }
			if (result.data?.game) { game = result.data.game as Game; hydrate(game); }
			else { game = { ...game, ...updates } as Game; }
			showToast('success', `${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} saved!`);
			saving = false;
			return true;
		} catch (err: any) {
			showToast('error', `Error: ${err?.message || 'Unknown'}`);
			saving = false;
			return false;
		}
	}

	async function saveGeneral() { await saveSection('general', { game_name: gameName, game_name_aliases: aliases, status: gameStatus, timing_method: timingMethod, genres, platforms, cover: cover || null, cover_position: coverPosition || null }); }
	async function saveCategories() { await saveSection('categories', { full_runs: fullRuns, mini_challenges: miniChallenges, player_made: playerMade }); }
	async function saveRules() { await saveSection('rules', { general_rules: generalRules }); }
	async function saveChallengesGlitches() { await saveSection('challenges', { challenges_data: challengesData, glitches_data: glitchesData }); }
	async function saveRestrictions() { await saveSection('restrictions', { restrictions_data: restrictionsData }); }
	async function saveCharacters() { await saveSection('characters', { character_column: characterColumn, characters_data: charactersData }); }
	async function saveAdditionalTabs() { await saveSection('additional_tabs', { additional_tabs: additionalTabs }); }

	// ── Freeze / Unfreeze ────────────────────────────────────────────────────
	async function toggleFreeze() {
		if (!canFreeze) return;
		saving = true;
		const nowFrozen = !isFrozen;
		const result = await workerCall('/game-editor/freeze', { game_id: gameId, freeze: nowFrozen });
		if (!result.ok) { showToast('error', `Freeze failed: ${result.error}`); saving = false; return; }
		game = { ...game, frozen_at: result.data?.frozen_at ?? null, frozen_by: result.data?.frozen_by ?? null } as Game;
		showToast('success', nowFrozen ? '🔒 Game frozen.' : '🔓 Game unfrozen.');
		saving = false;
	}

	// ── Delete ───────────────────────────────────────────────────────────────
	async function deleteGame() {
		if (!canDelete) return;
		const confirm1 = prompt(`Type "${gameId}" to permanently delete this game:`);
		if (confirm1 !== gameId) { showToast('error', 'Delete cancelled — game ID did not match.'); return; }
		saving = true;
		const result = await workerCall('/game-editor/delete', { game_id: gameId, confirm_game_id: confirm1 });
		if (!result.ok) { showToast('error', `Delete failed: ${result.error}`); saving = false; return; }
		goto('/admin/game-editor');
	}

	// ── Snapshots ────────────────────────────────────────────────────────────
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
		const result = await workerCall('/game-editor/rollback', { game_id: gameId, snapshot_id: snapshotId });
		if (!result.ok) { showToast('error', `Rollback failed: ${result.error}`); saving = false; return; }
		if (result.data?.game) { game = result.data.game as Game; hydrate(game!); }
		rollbackConfirm = null;
		showToast('success', 'Game rolled back successfully.');
		await loadSnapshots();
		saving = false;
	}

	// ── Data Loading ─────────────────────────────────────────────────────────
	async function loadGame() {
		loading = true;
		const { data, error } = await supabase.from('games').select('*').eq('game_id', gameId).single();
		if (error || !data) { showToast('error', 'Game not found'); loading = false; return; }
		game = data as Game;
		hydrate(data as Game);
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
				authorized = role?.admin ? true : !!(role?.moderator && gameId && role.gameIds?.includes(gameId));
				checking = false;
				if (authorized) loadGame();
			}
		});
		return unsub;
	});
</script>

<svelte:head><title>Edit {game?.game_name || gameId} | Admin | CRC</title></svelte:head>

<div class="page-width game-editor">
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
					<button class="btn btn--small btn--freeze" onclick={toggleFreeze} disabled={saving}>🔒 Freeze</button>
				{/if}
				{#if canDelete}
					<button class="btn btn--small btn--delete" onclick={deleteGame} disabled={saving}>🗑️ Delete</button>
				{/if}
			</div>
		</div>

		{#if isModerator}
			<div class="role-notice">You are editing as a <strong>Game Moderator</strong>. Deletion and freeze controls are restricted to Admins.</div>
		{/if}

		{#if toast}
			<div class="toast toast--{toast.type}">{toast.text}</div>
		{/if}

		<nav class="game-tabs">
			{#each tabs as t}
				<button class="game-tab" class:game-tab--active={activeTab === t.id}
					onclick={() => { activeTab = t.id; if (t.id === 'history' && snapshots.length === 0) loadSnapshots(); }}>
					<span class="tab__icon">{t.icon}</span> {t.label}
				</button>
			{/each}
		</nav>

		{#if activeTab === 'general'}
			<GeneralTab
				bind:gameName bind:aliases bind:aliasInput bind:gameStatus
				bind:timingMethod bind:genres bind:platforms bind:cover bind:coverPosition
				{canEdit} {canEditMeta} {saving} {gameId}
				onSave={saveGeneral}
				onReset={() => game && hydrate(game)}
				{showToast}
			/>
		{/if}

		{#if activeTab === 'categories'}
			<CategoriesTab
				bind:fullRuns bind:miniChallenges bind:playerMade
				{challengesData} {restrictionsData} {characterColumn} {charactersData}
				{originalSlugs} {canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveCategories}
				onReset={() => game && hydrate(game)}
			/>
		{/if}

		{#if activeTab === 'rules'}
			<RulesTab
				bind:generalRules
				{canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveRules}
				onReset={() => { generalRules = game!.general_rules || ''; }}
			/>
		{/if}

		{#if activeTab === 'challenges'}
			<ChallengesTab
				bind:challengesData bind:glitchesData
				{originalSlugs} {canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveChallengesGlitches}
				onReset={() => game && hydrate(game)}
			/>
		{/if}

		{#if activeTab === 'restrictions'}
			<RestrictionsTab
				bind:restrictionsData
				{originalSlugs} {canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveRestrictions}
				onReset={() => game && hydrate(game)}
			/>
		{/if}

		{#if activeTab === 'characters'}
			<CharactersTab
				bind:characterColumn bind:charactersData
				{originalSlugs} {canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveCharacters}
				onReset={() => game && hydrate(game)}
			/>
		{/if}

		{#if activeTab === 'additional1' && additionalTabs.tab1.enabled}
			<AdditionalContentTab
				bind:tabData={additionalTabs.tab1}
				{canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveAdditionalTabs}
				onReset={() => { additionalTabs = deepClone(game!.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '' }, tab2: { enabled: false, title: 'Additional 2', content: '' } }); }}
			/>
		{/if}

		{#if activeTab === 'additional2' && additionalTabs.tab2.enabled}
			<AdditionalContentTab
				bind:tabData={additionalTabs.tab2}
				{canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveAdditionalTabs}
				onReset={() => { additionalTabs = deepClone(game!.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '' }, tab2: { enabled: false, title: 'Additional 2', content: '' } }); }}
			/>
		{/if}

		{#if activeTab === 'additional-settings'}
			<CustomTabsSettings
				bind:additionalTabs
				{canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveAdditionalTabs}
				onReset={() => { additionalTabs = deepClone(game!.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '' }, tab2: { enabled: false, title: 'Additional 2', content: '' } }); }}
			/>
		{/if}

		{#if activeTab === 'history'}
			<HistoryTab
				bind:snapshots bind:snapshotsLoading bind:rollbackConfirm
				{isAdmin} {saving}
				onRollback={rollbackToSnapshot}
				onRefresh={loadSnapshots}
			/>
		{/if}
	{/if}
</div>
