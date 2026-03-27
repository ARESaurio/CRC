<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { type SectionId } from '../../consensus';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Separator from '$lib/components/ui/separator/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Pencil, Eye, Save } from 'lucide-svelte';
	import { deepClone } from '$lib/components/game-editor/_helpers.js';

	// Shared tab components (same ones the admin game editor uses)
	import CategoriesTab from '$lib/components/game-editor/CategoriesTab.svelte';
	import ChallengesTab from '$lib/components/game-editor/ChallengesTab.svelte';
	import RestrictionsTab from '$lib/components/game-editor/RestrictionsTab.svelte';
	import CharactersTab from '$lib/components/game-editor/CharactersTab.svelte';
	import DifficultiesTab from '$lib/components/game-editor/DifficultiesTab.svelte';
	import AchievementsTab from '$lib/components/game-editor/AchievementsTab.svelte';
	import RulesTab from '$lib/components/game-editor/RulesTab.svelte';

	let {
		section,
		initialData,
		existingTitle,
		existingNotes,
		game,
		onSave,
		onClose
	}: {
		section: SectionId;
		initialData: any;
		existingTitle: string;
		existingNotes: string;
		game: any;
		onSave: (data: any, title: string, notes: string) => void;
		onClose: () => void;
	} = $props();

	let title = $state(existingTitle);
	let notes = $state(existingNotes);
	let saving = $state(false);

	// ── Per-section bindable state ──────────────────────────────────────
	// Categories
	let fullRuns = $state(deepClone(initialData.full_runs || []));
	let miniChallenges = $state(deepClone(initialData.mini_challenges || []));
	let playerMade = $state(deepClone(initialData.player_made || []));

	// Rules
	let generalRules = $state(initialData.general_rules || '');

	// Challenges
	let challengesData = $state(deepClone(initialData.challenges_data || []));
	let glitchesData = $state(deepClone(initialData.glitches_data || []));
	let nmgRules = $state(initialData.nmg_rules || '');
	let glitchDocLinks = $state(initialData.glitch_doc_links || '');

	// Restrictions
	let restrictionsData = $state(deepClone(initialData.restrictions_data || []));

	// Characters
	let characterColumn = $state(deepClone(initialData.character_column || { enabled: false, label: 'Character' }));
	let charactersData = $state(deepClone(initialData.characters_data || []));

	// Difficulties
	let difficultyColumn = $state(deepClone(initialData.difficulty_column || { enabled: false, label: 'Difficulty' }));
	let difficultiesData = $state(deepClone(initialData.difficulties_data || []));

	// Achievements
	let communityAchievements = $state(deepClone(initialData.community_achievements || []));

	// Overview (text only — no matching admin tab, keep inline)
	let overviewContent = $state(initialData.content || '');
	let showPreview = $state(false);

	// ── Cross-section context from live game (read-only, for dropdowns) ──
	const gameChallenges = $derived(game.challenges_data || []);
	const gameRestrictions = $derived(game.restrictions_data || []);
	const gameCharacterColumn = $derived(game.character_column || { enabled: false, label: 'Character' });
	const gameCharacters = $derived(game.characters_data || []);

	// ── Collect current data into section-specific object ────────────
	function collectData(): any {
		switch (section) {
			case 'overview': return { content: overviewContent };
			case 'categories': return { full_runs: fullRuns, mini_challenges: miniChallenges, player_made: playerMade };
			case 'rules': return { general_rules: generalRules };
			case 'challenges': return { challenges_data: challengesData, glitches_data: glitchesData, nmg_rules: nmgRules, glitch_doc_links: glitchDocLinks };
			case 'restrictions': return { restrictions_data: restrictionsData };
			case 'characters': return { character_column: characterColumn, characters_data: charactersData };
			case 'difficulties': return { difficulty_column: difficultyColumn, difficulties_data: difficultiesData };
			case 'achievements': return { community_achievements: communityAchievements };
			default: return {};
		}
	}

	// ── Save & Reset ─────────────────────────────────────────────────
	async function handleSave() {
		saving = true;
		await onSave(collectData(), title.trim(), notes.trim());
		saving = false;
	}

	function handleReset() {
		fullRuns = deepClone(initialData.full_runs || []);
		miniChallenges = deepClone(initialData.mini_challenges || []);
		playerMade = deepClone(initialData.player_made || []);
		generalRules = initialData.general_rules || '';
		challengesData = deepClone(initialData.challenges_data || []);
		glitchesData = deepClone(initialData.glitches_data || []);
		nmgRules = initialData.nmg_rules || '';
		glitchDocLinks = initialData.glitch_doc_links || '';
		restrictionsData = deepClone(initialData.restrictions_data || []);
		characterColumn = deepClone(initialData.character_column || { enabled: false, label: 'Character' });
		charactersData = deepClone(initialData.characters_data || []);
		difficultyColumn = deepClone(initialData.difficulty_column || { enabled: false, label: 'Difficulty' });
		difficultiesData = deepClone(initialData.difficulties_data || []);
		communityAchievements = deepClone(initialData.community_achievements || []);
		overviewContent = initialData.content || '';
	}

	// No locked slugs in forum drafts (everything is new/proposed)
	const originalSlugs = new Set<string>();
</script>

<Dialog.Root open={true} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
	<Dialog.Overlay />
	<Dialog.Content class="editor-dialog">
		<Dialog.Header>
			<Dialog.Title>
				<Pencil size={14} /> Edit {section.charAt(0).toUpperCase() + section.slice(1)} Draft
			</Dialog.Title>
			<Dialog.Close>&times;</Dialog.Close>
		</Dialog.Header>

		<div class="editor-modal__body">
			<!-- Draft metadata -->
			<div class="field-group">
				<label class="field-label">Draft Title <span class="field-hint">(brief summary of your proposal)</span></label>
				<input class="field-input" type="text" bind:value={title} placeholder="e.g. Reworked hitless categories" maxlength="200" />
			</div>
			<div class="field-group">
				<label class="field-label">Notes <span class="field-hint">(explain your reasoning)</span></label>
				<textarea class="field-textarea" bind:value={notes} rows="2" placeholder="Why these changes?" maxlength="1000"></textarea>
			</div>

			<Separator.Root class="divider" />

			<!-- ── Section-specific editor (real tab components) ──────────── -->

			{#if section === 'overview'}
				<!-- Overview is text-only, no matching admin tab -->
				<div class="rules-toolbar">
					<ToggleGroup.Root class="preview-toggle" value={showPreview ? 'preview' : 'edit'} onValueChange={(v: string) => { showPreview = v === 'preview'; }}>
						<ToggleGroup.Item value="edit"><Pencil size={14} /> Edit</ToggleGroup.Item>
						<ToggleGroup.Item value="preview"><Eye size={14} /> Preview</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				{#if showPreview}
					<div class="rules-preview">
						{#if overviewContent.trim()}
							{@html renderMarkdown(overviewContent)}
						{:else}
							<p class="muted">Nothing to preview.</p>
						{/if}
					</div>
				{:else}
					<textarea class="field-textarea field-textarea--tall" bind:value={overviewContent} placeholder="Game overview / description (Markdown supported)..."></textarea>
				{/if}
				<div class="section-actions">
					<button class="btn btn--save" onclick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</button>
					<button class="btn btn--reset" onclick={handleReset}>Reset</button>
				</div>

			{:else if section === 'categories'}
				<CategoriesTab
					bind:fullRuns
					bind:miniChallenges
					bind:playerMade
					challengesData={gameChallenges}
					restrictionsData={gameRestrictions}
					characterColumn={gameCharacterColumn}
					charactersData={gameCharacters}
					{originalSlugs}
					canEdit={true}
					isFrozen={false}
					isAdmin={false}
					{saving}
					onSave={handleSave}
					onReset={handleReset}
				/>

			{:else if section === 'rules'}
				<RulesTab
					bind:generalRules
					canEdit={true}
					isFrozen={false}
					isAdmin={false}
					{saving}
					onSave={handleSave}
					onReset={handleReset}
				/>

			{:else if section === 'challenges'}
				<ChallengesTab
					bind:challengesData
					bind:glitchesData
					bind:nmgRules
					bind:glitchDocLinks
					{originalSlugs}
					canEdit={true}
					isFrozen={false}
					isAdmin={false}
					{saving}
					onSave={handleSave}
					onReset={handleReset}
				/>

			{:else if section === 'restrictions'}
				<RestrictionsTab
					bind:restrictionsData
					{originalSlugs}
					canEdit={true}
					isFrozen={false}
					isAdmin={false}
					{saving}
					onSave={handleSave}
					onReset={handleReset}
				/>

			{:else if section === 'characters'}
				<CharactersTab
					bind:characterColumn
					bind:charactersData
					{originalSlugs}
					canEdit={true}
					isFrozen={false}
					isAdmin={false}
					{saving}
					onSave={handleSave}
					onReset={handleReset}
				/>

			{:else if section === 'difficulties'}
				<DifficultiesTab
					bind:difficultyColumn
					bind:difficultiesData
					{originalSlugs}
					canEdit={true}
					isFrozen={false}
					isAdmin={false}
					{saving}
					onSave={handleSave}
					onReset={handleReset}
				/>

			{:else if section === 'achievements'}
				<AchievementsTab
					bind:communityAchievements
					{originalSlugs}
					canEdit={true}
					isFrozen={false}
					isAdmin={false}
					{saving}
					onSave={handleSave}
					onReset={handleReset}
				/>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.editor-dialog) { max-width: 780px; width: 94%; max-height: 85vh; display: flex; flex-direction: column; }
	.editor-modal__body { padding: 1.25rem; overflow-y: auto; flex: 1; }

	/* Fields */
	.field-group { margin-bottom: 0.75rem; }
	.field-label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem; }
	.field-hint { font-weight: 400; color: var(--muted); font-size: 0.78rem; }
	.field-input { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.88rem; box-sizing: border-box; }
	.field-input:focus { outline: none; border-color: var(--accent); }
	.field-textarea { width: 100%; padding: 0.45rem 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.88rem; resize: vertical; box-sizing: border-box; }
	.field-textarea:focus { outline: none; border-color: var(--accent); }
	.field-textarea--tall { min-height: 300px; }
	:global(.divider) { margin: 1rem 0; }
	.muted { color: var(--muted); }

	/* Overview toolbar */
	.rules-toolbar { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; }
	:global(.preview-toggle) { display: flex; gap: 0.25rem; border: none; overflow: visible; }
	:global(.preview-toggle [data-toggle-group-item]) { padding: 0.35rem 0.65rem; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; font-size: 0.82rem; cursor: pointer; color: var(--muted); font-family: inherit; }
	:global(.preview-toggle [data-toggle-group-item][data-state="on"]) { background: var(--accent); color: #fff; border-color: var(--accent); }
	.rules-preview { padding: 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; min-height: 200px; max-height: 400px; overflow-y: auto; }

	/* Save/Reset for overview (other sections use their tab's built-in buttons) */
	.section-actions { display: flex; gap: 0.5rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
</style>
