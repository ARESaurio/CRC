<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { session, isLoading } from '$stores/auth';
	import { showToast } from '$stores/toast';
	import { goto } from '$app/navigation';
	import { checkAdminRole, getAccessToken } from '$lib/admin';
	import { supabase } from '$lib/supabase';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import type { Game, FullRunCategory, MiniChallengeGroup, PlayerMadeChallenge, ChallengeType, GlitchCategory, Restriction, CharacterColumn, CharacterOption, DifficultyColumn, DifficultyOption, GameResource } from '$types';
	import { deepClone } from '$lib/components/game-editor/_helpers.js';
	import {
		ClipboardList, FolderOpen, ScrollText, Zap, Lock,
		Drama, BarChart3, Medal, Paperclip, Plus, Clock, BookOpen,
		Settings as SettingsIcon, LockOpen, Trash2, Save, FileEdit as FileEditIcon, RefreshCw, ArrowLeft} from 'lucide-svelte';

	import GeneralTab from './GeneralTab.svelte';
	import CategoriesTab from '$lib/components/game-editor/CategoriesTab.svelte';
	import RulesTab from '$lib/components/game-editor/RulesTab.svelte';
	import ChallengesTab from '$lib/components/game-editor/ChallengesTab.svelte';
	import RestrictionsTab from '$lib/components/game-editor/RestrictionsTab.svelte';
	import CharactersTab from '$lib/components/game-editor/CharactersTab.svelte';
	import DifficultiesTab from '$lib/components/game-editor/DifficultiesTab.svelte';
	import ResourcesTab from '$lib/components/game-editor/ResourcesTab.svelte';
	import CustomTabsSettings from './CustomTabsSettings.svelte';
	import AdditionalContentTab from './AdditionalContentTab.svelte';
	import HistoryTab from './HistoryTab.svelte';
	import AchievementsTab from '$lib/components/game-editor/AchievementsTab.svelte';

	// ── Auth / access state ─────────────────────────────────────────────────
	let checking = $state(true);
	let authorized = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let lastSaveAt = $state(0);
	let game = $state<Game | null>(null);
	let activeTab = $state('general');
	let userRole = $state<{ admin: boolean; superAdmin: boolean; moderator: boolean; verifier: boolean; runnerId: string | null; gameIds: string[] } | null>(null);
	let userId = $state<string | null>(null);

	const gameId = $derived($page.params.game_id ?? '');

	// ── Additional Tabs ──────────────────────────────────────────────────────
	let additionalTabs = $state<{ tab1: import('$types').AdditionalTabData; tab2: import('$types').AdditionalTabData }>({
		tab1: { enabled: false, title: 'Additional 1', content: '', items: [] },
		tab2: { enabled: false, title: 'Additional 2', content: '', items: [] }
	});

	// ── Permission Derivations ───────────────────────────────────────────────
	const isSuperAdmin = $derived(userRole?.superAdmin === true);
	const isAdmin = $derived(userRole?.admin === true);
	const isModerator = $derived(userRole?.moderator === true && !userRole?.admin);
	const canEdit = $derived(!game?.frozen_at || isAdmin);
	const canEditMeta = $derived(canEdit && isAdmin);
	const canDelete = $derived(isSuperAdmin);
	const canFreeze = $derived(isAdmin || isModerator);
	const isFrozen = $derived(!!game?.frozen_at);

	const tabs: { id: string; label: string; icon: any }[] = $derived([
		{ id: 'general', label: 'General', icon: ClipboardList },
		{ id: 'categories', label: 'Categories', icon: FolderOpen },
		{ id: 'rules', label: 'Rules', icon: ScrollText },
		{ id: 'challenges', label: 'Challenges & Glitches', icon: Zap },
		{ id: 'restrictions', label: 'Restrictions', icon: Lock },
		{ id: 'characters', label: 'Characters', icon: Drama },
		{ id: 'difficulties', label: 'Difficulties', icon: BarChart3 },
		{ id: 'achievements', label: 'Achievements', icon: Medal },
		{ id: 'resources', label: 'Resources', icon: BookOpen },
		...(additionalTabs.tab1.enabled ? [{ id: 'additional1', label: additionalTabs.tab1.title || 'Additional 1', icon: Paperclip }] : []),
		...(additionalTabs.tab2.enabled ? [{ id: 'additional2', label: additionalTabs.tab2.title || 'Additional 2', icon: Paperclip }] : []),
		{ id: 'additional-settings', label: 'Custom Tabs', icon: Plus },
		{ id: 'history', label: 'History', icon: Clock },
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
	let isModded = $state(false);
	let baseGame = $state('');
	let releaseYear = $state<number | null>(null);
	let fullRuns = $state<FullRunCategory[]>([]);
	let miniChallenges = $state<MiniChallengeGroup[]>([]);
	let playerMade = $state<PlayerMadeChallenge[]>([]);
	let generalRules = $state('');
	let challengesData = $state<ChallengeType[]>([]);
	let glitchesData = $state<GlitchCategory[]>([]);
	let restrictionsData = $state<Restriction[]>([]);
	let characterColumn = $state<CharacterColumn>({ enabled: false, label: 'Character' });
	let charactersData = $state<CharacterOption[]>([]);
	let difficultyColumn = $state<DifficultyColumn>({ enabled: false, label: 'Difficulty' });
	let difficultiesData = $state<DifficultyOption[]>([]);
	let nmgRules = $state('');
	let glitchDocLinks = $state('');
	let communityAchievements = $state<import('$types').CommunityAchievementDef[]>([]);
	let gameContent = $state('');
	let resourcesData = $state<GameResource[]>([]);

	// History / Snapshots
	let snapshots = $state<any[]>([]);
	let snapshotsLoading = $state(false);
	let rollbackConfirm = $state<string | null>(null);

	// Track original slugs (read-only after load)
	let originalSlugs = $state<Set<string>>(new Set());

	// ── Draft State ─────────────────────────────────────────────────────────
	let draftStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let draftExists = $state(false);
	let draftLoading = $state(true);
	let draftRestored = $state(false);

	// ── Helpers ──────────────────────────────────────────────────────────────

	function hydrate(g: Game) {
		gameName = g.game_name || '';
		aliases = [...(g.game_name_aliases || [])];
		gameStatus = g.status || 'Active';
		timingMethod = g.timing_method || '';
		genres = [...(g.genres || [])];
		platforms = [...(g.platforms || [])];
		cover = g.cover || '';
		coverPosition = g.cover_position || '';
		isModded = g.is_modded || false;
		baseGame = g.base_game || '';
		releaseYear = g.release_year ?? null;
		fullRuns = deepClone(g.full_runs || []);
		miniChallenges = deepClone(g.mini_challenges || []);
		playerMade = deepClone(g.player_made || []);
		generalRules = g.general_rules || '';
		challengesData = deepClone(g.challenges_data || []);
		glitchesData = deepClone(g.glitches_data || []);
		restrictionsData = deepClone(g.restrictions_data || []);
		characterColumn = deepClone(g.character_column || { enabled: false, label: 'Character' });
		charactersData = deepClone(g.characters_data || []);
		difficultyColumn = deepClone(g.difficulty_column || { enabled: false, label: 'Difficulty' });
		difficultiesData = deepClone(g.difficulties_data || []);
		nmgRules = g.nmg_rules || '';
		glitchDocLinks = g.glitch_doc_links || '';
		communityAchievements = deepClone(g.community_achievements || []);
		gameContent = g.content || '';
		resourcesData = deepClone(g.resources_data || []);
		additionalTabs = deepClone(g.additional_tabs || {
			tab1: { enabled: false, title: 'Additional 1', content: '', items: [] },
			tab2: { enabled: false, title: 'Additional 2', content: '', items: [] }
		});

		const slugs = new Set<string>();
		for (const item of [...fullRuns, ...miniChallenges, ...playerMade, ...challengesData, ...glitchesData, ...restrictionsData, ...charactersData, ...difficultiesData, ...communityAchievements]) {
			if (item.slug) slugs.add(item.slug);
			if ('children' in item && Array.isArray(item.children)) for (const c of item.children) if (c.slug) slugs.add(c.slug);
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
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				},
				body: JSON.stringify(payload)
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
		if (!canEdit) { showToast('error', 'Game is frozen. Unfreeze it to make changes.'); return false; }
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
			// Clear draft after successful save
			deleteDraft();
			saving = false;
			return true;
		} catch (err: any) {
			showToast('error', `Error: ${err?.message || 'Unknown'}`);
			saving = false;
			return false;
		}
	}

	async function saveGeneral() { await saveSection('general', { game_name: gameName, game_name_aliases: aliases, status: gameStatus, timing_method: timingMethod, genres, platforms, cover: cover || null, cover_position: coverPosition || null, release_year: releaseYear || null, is_modded: isModded, base_game: isModded && baseGame ? baseGame : null, content: gameContent }); }
	async function saveCategories() { await saveSection('categories', { full_runs: fullRuns, mini_challenges: miniChallenges, player_made: playerMade }); }
	async function saveRules() { await saveSection('rules', { general_rules: generalRules }); }
	async function saveChallengesGlitches() { await saveSection('challenges', { challenges_data: challengesData, glitches_data: glitchesData, nmg_rules: nmgRules || null, glitch_doc_links: glitchDocLinks || null }); }
	async function saveRestrictions() { await saveSection('restrictions', { restrictions_data: restrictionsData }); }
	async function saveCharacters() { await saveSection('characters', { character_column: characterColumn, characters_data: charactersData }); }
	async function saveDifficulties() { await saveSection('difficulties', { difficulty_column: difficultyColumn, difficulties_data: difficultiesData }); }
	async function saveAchievements() { await saveSection('achievements', { community_achievements: communityAchievements }); }
	async function saveResources() { await saveSection('resources', { resources_data: resourcesData }); }
	async function saveAdditionalTabs() { await saveSection('additional_tabs', { additional_tabs: additionalTabs }); }

	// ── Freeze / Unfreeze ────────────────────────────────────────────────────
	async function toggleFreeze() {
		if (!canFreeze) return;
		saving = true;
		const nowFrozen = !isFrozen;
		const result = await workerCall('/game-editor/freeze', { game_id: gameId, freeze: nowFrozen });
		if (!result.ok) { showToast('error', `Freeze failed: ${result.error}`); saving = false; return; }
		game = { ...game, frozen_at: result.data?.frozen_at ?? null, frozen_by: result.data?.frozen_by ?? null } as Game;
		showToast('success', nowFrozen ? 'Game frozen.' : 'Game unfrozen.');
		saving = false;
	}

	// ── Delete ───────────────────────────────────────────────────────────────
	let deleteDialogOpen = $state(false);
	let deleteConfirmInput = $state('');
	const deleteInputMatches = $derived(deleteConfirmInput === gameId);

	async function executeDelete() {
		if (!canDelete || !deleteInputMatches) return;
		deleteDialogOpen = false;
		saving = true;
		const result = await workerCall('/game-editor/delete', { game_id: gameId, confirm_game_id: deleteConfirmInput });
		if (!result.ok) { showToast('error', `Delete failed: ${result.error}`); saving = false; return; }
		goto('/admin/game-editor');
	}

	// ── Re-import from Submission ────────────────────────────────────────────
	let reimporting = $state(false);
	let reimportConfirmOpen = $state(false);
	async function reimportFromSubmission() {
		if (!isAdmin) return;
		reimporting = true;
		const result = await workerCall('/game-editor/reimport', { game_id: gameId });
		if (!result.ok) { showToast('error', `Re-import failed: ${result.error}`); reimporting = false; return; }
		if (result.data?.game) { game = result.data.game as Game; hydrate(game!); }
		showToast('success', 'Game data re-imported from submission.');
		reimporting = false;
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

	// ── Draft Save/Load ─────────────────────────────────────────────────────
	function serializeEditorState() {
		return {
			gameName, aliases, gameStatus, timingMethod, genres, platforms,
			cover, coverPosition, isModded, baseGame,
			fullRuns, miniChallenges, playerMade, generalRules,
			challengesData, glitchesData, restrictionsData,
			characterColumn, charactersData, difficultyColumn, difficultiesData,
			nmgRules, glitchDocLinks, additionalTabs,
		};
	}

	function loadEditorFromDraft(d: any) {
		if (!d) return;
		gameName = d.gameName ?? gameName;
		aliases = d.aliases ?? aliases;
		gameStatus = d.gameStatus ?? gameStatus;
		timingMethod = d.timingMethod ?? timingMethod;
		genres = d.genres ?? genres;
		platforms = d.platforms ?? platforms;
		cover = d.cover ?? cover;
		coverPosition = d.coverPosition ?? coverPosition;
		isModded = d.isModded ?? isModded;
		baseGame = d.baseGame ?? baseGame;
		fullRuns = d.fullRuns ? deepClone(d.fullRuns) : fullRuns;
		miniChallenges = d.miniChallenges ? deepClone(d.miniChallenges) : miniChallenges;
		playerMade = d.playerMade ? deepClone(d.playerMade) : playerMade;
		generalRules = d.generalRules ?? generalRules;
		challengesData = d.challengesData ? deepClone(d.challengesData) : challengesData;
		glitchesData = d.glitchesData ? deepClone(d.glitchesData) : glitchesData;
		restrictionsData = d.restrictionsData ? deepClone(d.restrictionsData) : restrictionsData;
		characterColumn = d.characterColumn ? deepClone(d.characterColumn) : characterColumn;
		charactersData = d.charactersData ? deepClone(d.charactersData) : charactersData;
		difficultyColumn = d.difficultyColumn ? deepClone(d.difficultyColumn) : difficultyColumn;
		difficultiesData = d.difficultiesData ? deepClone(d.difficultiesData) : difficultiesData;
		nmgRules = d.nmgRules ?? nmgRules;
		glitchDocLinks = d.glitchDocLinks ?? glitchDocLinks;
		additionalTabs = d.additionalTabs ? deepClone(d.additionalTabs) : additionalTabs;
	}

	async function checkForDraft() {
		if (!userId) { draftLoading = false; return; }
		try {
			const { data: draft, error } = await supabase
				.from('game_editor_drafts')
				.select('draft_data')
				.eq('user_id', userId)
				.eq('game_id', gameId)
				.maybeSingle();
			if (!error && draft?.draft_data) {
				draftExists = true;
				loadEditorFromDraft(draft.draft_data);
				draftRestored = true;
				showToast('success', 'Draft loaded — unsaved changes restored.');
			}
		} catch { /* silent — table may not exist yet */ }
		draftLoading = false;
	}

	async function loadDraft() {
		if (!userId) return;
		try {
			const { data: draft } = await supabase
				.from('game_editor_drafts')
				.select('draft_data')
				.eq('user_id', userId)
				.eq('game_id', gameId)
				.maybeSingle();
			if (draft?.draft_data) {
				loadEditorFromDraft(draft.draft_data);
				showToast('success', 'Draft loaded — unsaved changes restored.');
			}
		} catch { /* silent */ }
	}

	async function startFresh() {
		await deleteDraft();
		window.location.reload();
	}

	async function saveDraft() {
		if (!userId) return;
		draftStatus = 'saving';
		try {
			const { error } = await supabase
				.from('game_editor_drafts')
				.upsert({
					user_id: userId,
					game_id: gameId,
					draft_data: serializeEditorState(),
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
		if (!userId) return;
		try {
			await supabase
				.from('game_editor_drafts')
				.delete()
				.eq('user_id', userId)
				.eq('game_id', gameId);
			draftExists = false;
			draftRestored = false;
		} catch { /* silent */ }
	}

	// ── Data Loading ─────────────────────────────────────────────────────────
	async function loadGame() {
		loading = true;
		const { data, error } = await supabase.from('games').select('*').eq('game_id', gameId).single();
		if (error || !data) { showToast('error', 'Game not found'); loading = false; return; }
		game = data as Game;
		hydrate(data as Game);
		loading = false;
		// Check for draft after game loads
		await checkForDraft();
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
	<p class="back"><ArrowLeft size={14} /> <a href={localizeHref('/admin/game-editor')}>All Games</a></p>

	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.ge_checking()}</p></div>
	{:else if !authorized}
		<div class="center">
			<h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> Access Denied</h2>
			<p class="muted">{isModerator ? 'You are not assigned to moderate this game.' : 'Game Editor is available to Admins and Game Moderators.'}</p>
			<a href={localizeHref('/admin/game-editor')} class="btn">{m.ge_back()}</a>
		</div>
	{:else if loading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.ge_loading()}</p></div>
	{:else if !game}
		<div class="center"><h2>{m.ge_not_found()}</h2><a href={localizeHref('/admin/game-editor')} class="btn">{m.ge_back()}</a></div>
	{:else}
		{#if isFrozen}
			<div class="frozen-banner">
				<span class="frozen-banner__icon"><Lock size={22} /></span>
				<div class="frozen-banner__text">
					<strong>{m.ge_frozen()}</strong> All edits are blocked.
					{#if canFreeze}You can unfreeze it below.{:else}Contact an admin to unfreeze.{/if}
				</div>
				{#if canFreeze}
					<button class="btn btn--unfreeze" onclick={toggleFreeze} disabled={saving}>{saving ? '...' : 'Unfreeze'}</button>
				{/if}
			</div>
		{/if}

		<div class="editor-header">
			<h1>{game.game_name}</h1>
			<div class="editor-header__actions">
				<a href={localizeHref(`/games/${gameId}`)} class="btn btn--small" target="_blank">{m.ge_view_site()}</a>
				{#if isAdmin}
					<button class="btn btn--small btn--reimport" onclick={() => { reimportConfirmOpen = true; }} disabled={reimporting || saving}><RefreshCw size={14} /> {reimporting ? 'Importing…' : 'Re-import'}</button>
				{/if}
				{#if canFreeze && !isFrozen}
					<button class="btn btn--small btn--freeze" onclick={toggleFreeze} disabled={saving}><Lock size={14} /> Freeze</button>
				{/if}
				{#if canDelete}
					<button class="btn btn--small btn--delete" onclick={() => { deleteConfirmInput = ''; deleteDialogOpen = true; }} disabled={saving}><Trash2 size={14} /> Delete</button>
				{/if}
			</div>
		</div>

		{#if isModerator}
			<div class="role-notice">You are editing as a <strong>{m.ge_game_mod()}</strong>. Deletion is restricted to Admins.</div>
		{/if}

		{#if draftRestored}
			<div class="draft-bar">
				<span class="draft-bar__text"><FileEditIcon size={14} style="display:inline-block;vertical-align:-0.125em;" /> This editor was restored from your last session.</span>
				<div class="draft-bar__actions">
					<Button.Root size="sm" onclick={startFresh}>Start Over</Button.Root>
				</div>
			</div>
		{/if}

		<!-- Draft save bar -->
		{#if canEdit}
			<div class="draft-bar">
				<span class="draft-bar__text"><Save size={14} style="display:inline-block;vertical-align:-0.125em;" /> Save your work-in-progress before navigating away.</span>
				<div class="draft-bar__actions">
					<button class="btn btn--small btn--draft" onclick={saveDraft} disabled={draftStatus === 'saving'}>
						{#if draftStatus === 'saving'}{m.btn_draft_saving()}{:else if draftStatus === 'saved'}{m.btn_draft_saved()}{:else if draftStatus === 'error'}{m.btn_draft_save_failed()}{:else}{m.btn_save_draft()}{/if}
					</button>
					{#if draftExists}
						<button class="btn btn--small btn--reset" onclick={deleteDraft}>Discard Draft</button>
					{/if}
				</div>
			</div>
		{/if}

		<Tabs.Root bind:value={activeTab} onValueChange={(v: string) => { if (v === 'history' && snapshots.length === 0) loadSnapshots(); }}>
		<Tabs.List variant="game" flush>
			{#each tabs as t}
				{@const Icon = t.icon}
				<Tabs.Trigger variant="game" value={t.id}>
					<span class="tab__icon"><Icon size={14} /></span> {t.label}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>
		</Tabs.Root>

		{#if activeTab === 'general'}
			<GeneralTab
				bind:gameName bind:aliases bind:aliasInput bind:gameStatus
				bind:timingMethod bind:genres bind:platforms bind:cover bind:coverPosition
				bind:isModded bind:baseGame bind:gameContent bind:releaseYear
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
				bind:challengesData bind:glitchesData bind:nmgRules bind:glitchDocLinks
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

		{#if activeTab === 'difficulties'}
			<DifficultiesTab
				bind:difficultyColumn bind:difficultiesData
				{originalSlugs} {canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveDifficulties}
				onReset={() => game && hydrate(game)}
			/>
		{/if}

		{#if activeTab === 'achievements'}
			<AchievementsTab
				bind:communityAchievements
				{originalSlugs} {canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveAchievements}
				onReset={() => game && hydrate(game)}
			/>
		{/if}

		{#if activeTab === 'resources'}
			<ResourcesTab
				bind:resourcesData
				{canEdit} {saving}
				onSave={saveResources}
				onReset={() => game && hydrate(game)}
			/>
		{/if}

		{#if activeTab === 'additional1' && additionalTabs.tab1.enabled}
			<AdditionalContentTab
				bind:tabData={additionalTabs.tab1}
				{canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveAdditionalTabs}
				onReset={() => { additionalTabs = deepClone(game!.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '', items: [] }, tab2: { enabled: false, title: 'Additional 2', content: '', items: [] } }); }}
			/>
		{/if}

		{#if activeTab === 'additional2' && additionalTabs.tab2.enabled}
			<AdditionalContentTab
				bind:tabData={additionalTabs.tab2}
				{canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveAdditionalTabs}
				onReset={() => { additionalTabs = deepClone(game!.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '', items: [] }, tab2: { enabled: false, title: 'Additional 2', content: '', items: [] } }); }}
			/>
		{/if}

		{#if activeTab === 'additional-settings'}
			<CustomTabsSettings
				bind:additionalTabs
				{canEdit} {isFrozen} {isAdmin} {saving}
				onSave={saveAdditionalTabs}
				onReset={() => { additionalTabs = deepClone(game!.additional_tabs || { tab1: { enabled: false, title: 'Additional 1', content: '', items: [] }, tab2: { enabled: false, title: 'Additional 2', content: '', items: [] } }); }}
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

<AlertDialog.Root bind:open={reimportConfirmOpen}>
	<AlertDialog.Overlay />
	<AlertDialog.Content>
		<AlertDialog.Title>Re-import from submission?</AlertDialog.Title>
		<AlertDialog.Description>This will overwrite categories, challenges, characters, difficulties, and rules with the submitted data. A snapshot will be saved first.</AlertDialog.Description>
		<div class="alert-dialog-actions">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="btn btn--danger" onclick={reimportFromSubmission}>Re-import</AlertDialog.Action>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root open={deleteDialogOpen} onOpenChange={(o: boolean) => { if (!o) deleteDialogOpen = false; }}>
	<Dialog.Overlay />
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Game</Dialog.Title>
			<Dialog.Description>This action is permanent and cannot be undone. Type <strong>{gameId}</strong> to confirm.</Dialog.Description>
		</Dialog.Header>
		<input
			type="text"
			class="delete-confirm-input"
			bind:value={deleteConfirmInput}
			placeholder={gameId}
			autocomplete="off"
			spellcheck="false"
		/>
		<Dialog.Footer>
			<Dialog.Close class="btn btn--small">Cancel</Dialog.Close>
			<button class="btn btn--small btn--delete" disabled={!deleteInputMatches} onclick={executeDelete}>Delete permanently</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	.delete-confirm-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--fg);
		font-size: 0.9rem;
		margin-top: 0.5rem;
	}
	.delete-confirm-input::placeholder { color: var(--muted); opacity: 0.5; }
</style>
