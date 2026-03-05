<script lang="ts">
	import { goto } from '$app/navigation';
	import { adminAction } from '$lib/admin';
	import { supabase } from '$lib/supabase';

	let { data } = $props();
	const game = data.game;
	const gd = game.game_data || {};

	// ── Editable state (hydrated from pending game data) ──────────────────
	let gameName = $state(game.game_name || '');
	let aliases = $state((game.game_name_aliases || []).join(', '));
	let description = $state(game.description || '');
	let selectedPlatforms = $state<string[]>(game.platforms || []);
	let selectedGenres = $state<string[]>(game.genres || []);
	let rules = $state(game.rules || '');
	let timingMethod = $state(gd.timing_method || 'RTA');

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

	const TABS = [
		{ id: 'general', label: 'General', icon: '📋' },
		{ id: 'categories', label: 'Categories', icon: '📂' },
		{ id: 'challenges', label: 'Challenges', icon: '⚡' },
		{ id: 'characters', label: 'Characters', icon: '🎭' },
		{ id: 'restrictions', label: 'Restrictions', icon: '🔒' },
		{ id: 'glitches', label: 'Glitches', icon: '🎲' },
		{ id: 'notes', label: 'Review Notes', icon: '📝' },
	];

	// ── Helpers ───────────────────────────────────────────────────────────
	const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	function addChallenge() { challenges = [...challenges, { slug: '', label: '', description: '', exceptions: '' }]; }
	function removeChallenge(i: number) { challenges = challenges.filter((_, idx) => idx !== i); }

	function addFullRun() { fullRuns = [...fullRuns, { slug: '', label: '', description: '', exceptions: '' }]; }
	function removeFullRun(i: number) { fullRuns = fullRuns.filter((_, idx) => idx !== i); }

	function addMiniGroup() { miniChallenges = [...miniChallenges, { slug: '', label: '', description: '', exceptions: '', children: [] }]; }
	function removeMiniGroup(i: number) { miniChallenges = miniChallenges.filter((_, idx) => idx !== i); }
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

	function addRestriction() { restrictions = [...restrictions, { slug: '', label: '', description: '', exceptions: '', children: [] }]; }
	function removeRestriction(i: number) { restrictions = restrictions.filter((_, idx) => idx !== i); }
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

	function addGlitch() { glitches = [...glitches, { slug: '', label: '', description: '' }]; }
	function removeGlitch(i: number) { glitches = glitches.filter((_, idx) => idx !== i); }

	function addCharacter() { characterOptions = [...characterOptions, '']; }
	function removeCharacter(i: number) { characterOptions = characterOptions.filter((_, idx) => idx !== i); }

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
		};

		// Update pending_games directly via Supabase (admin has RLS access)
		const { error } = await supabase
			.from('pending_games')
			.update({
				game_name: gameName.trim(),
				game_name_aliases: aliases.split(',').map(a => a.trim()).filter(Boolean),
				description: description.trim() || null,
				platforms: selectedPlatforms,
				genres: selectedGenres,
				rules: rules.trim() || null,
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
	<p class="muted">Edit the submission data below, then add review notes and save. The submitter will be notified.</p>

	{#if msg}
		<div class="alert" class:alert--success={msg.type === 'success'} class:alert--error={msg.type === 'error'}>{msg.text}</div>
	{/if}

	{#if game.submitter_notes}
		<div class="submitter-notes">
			<span class="submitter-notes__label">Submitter Notes:</span>
			<p>{game.submitter_notes}</p>
		</div>
	{/if}

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
				<div class="field"><label class="fl">Game Name</label><input type="text" class="fi" bind:value={gameName} /></div>
				<div class="field"><label class="fl">Aliases (comma-separated)</label><input type="text" class="fi" bind:value={aliases} /></div>
				<div class="field"><label class="fl">Description</label><textarea class="fi" rows="3" bind:value={description}></textarea></div>
				<div class="field"><label class="fl">Timing Method</label><input type="text" class="fi" bind:value={timingMethod} /></div>
				<div class="field">
					<label class="fl">Platforms</label>
					<div class="chip-editor">
						{#each selectedPlatforms as p, i}
							<span class="chip-ed">{p} <button type="button" class="chip-ed__x" onclick={() => selectedPlatforms = selectedPlatforms.filter((_, j) => j !== i)}>✕</button></span>
						{/each}
						<input type="text" class="chip-ed__input" placeholder="Add platform + Enter"
							onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { selectedPlatforms = [...selectedPlatforms, t.value.trim()]; t.value = ''; e.preventDefault(); } }} />
					</div>
				</div>
				<div class="field">
					<label class="fl">Genres</label>
					<div class="chip-editor">
						{#each selectedGenres as g, i}
							<span class="chip-ed">{g} <button type="button" class="chip-ed__x" onclick={() => selectedGenres = selectedGenres.filter((_, j) => j !== i)}>✕</button></span>
						{/each}
						<input type="text" class="chip-ed__input" placeholder="Add genre + Enter"
							onkeydown={(e) => { const t = e.target as HTMLInputElement; if (e.key === 'Enter' && t.value.trim()) { selectedGenres = [...selectedGenres, t.value.trim()]; t.value = ''; e.preventDefault(); } }} />
					</div>
				</div>
				<div class="field"><label class="fl">General Rules</label><textarea class="fi" rows="4" bind:value={rules}></textarea></div>
			</div>
		{/if}

		<!-- Categories -->
		{#if activeTab === 'categories'}
			<div class="tab-body">
				<h3 class="section-title">Full Run Categories</h3>
				{#each fullRuns as item, i}
					<div class="item-row">
						<div class="item-row__fields">
							<input type="text" class="fi fi--sm" bind:value={fullRuns[i].label} placeholder="Label" oninput={() => { fullRuns[i].slug = slugify(fullRuns[i].label); fullRuns = [...fullRuns]; }} />
							<textarea class="fi fi--sm" rows="2" bind:value={fullRuns[i].description} placeholder="Description (optional)"></textarea>
							<textarea class="fi fi--sm" rows="2" bind:value={fullRuns[i].exceptions} placeholder="Exceptions (optional)"></textarea>
						</div>
						<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeFullRun(i)}>✕</button>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addFullRun}>+ Add Full Run</button>

				<h3 class="section-title mt-2">Mini-Challenge Groups</h3>
				{#each miniChallenges as group, gi}
					<div class="item-group">
						<div class="item-row">
							<div class="item-row__fields">
								<input type="text" class="fi fi--sm" bind:value={miniChallenges[gi].label} placeholder="Group label" oninput={() => { miniChallenges[gi].slug = slugify(miniChallenges[gi].label); miniChallenges = [...miniChallenges]; }} />
								<textarea class="fi fi--sm" rows="2" bind:value={miniChallenges[gi].description} placeholder="Description (optional)"></textarea>
							</div>
							<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeMiniGroup(gi)}>✕</button>
						</div>
						{#if group.children?.length}
							<div class="children-indent">
								{#each group.children as child, ci}
									<div class="item-row">
										<div class="item-row__fields">
											<input type="text" class="fi fi--sm" bind:value={miniChallenges[gi].children[ci].label} placeholder="Child label" oninput={() => { miniChallenges[gi].children[ci].slug = slugify(miniChallenges[gi].children[ci].label); miniChallenges = [...miniChallenges]; }} />
											<textarea class="fi fi--sm" rows="1" bind:value={miniChallenges[gi].children[ci].description} placeholder="Description"></textarea>
										</div>
										<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeMiniChild(gi, ci)}>✕</button>
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
				<h3 class="section-title">Challenges</h3>
				{#each challenges as item, i}
					<div class="item-row">
						<div class="item-row__fields">
							<input type="text" class="fi fi--sm" bind:value={challenges[i].label} placeholder="Label" oninput={() => { challenges[i].slug = slugify(challenges[i].label); challenges = [...challenges]; }} />
							<textarea class="fi fi--sm" rows="2" bind:value={challenges[i].description} placeholder="Description (optional)"></textarea>
							<textarea class="fi fi--sm" rows="2" bind:value={challenges[i].exceptions} placeholder="Exceptions (optional)"></textarea>
						</div>
						<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeChallenge(i)}>✕</button>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addChallenge}>+ Add Challenge</button>
			</div>
		{/if}

		<!-- Characters -->
		{#if activeTab === 'characters'}
			<div class="tab-body">
				<label class="toggle-row"><input type="checkbox" bind:checked={characterEnabled} /> Enable Character/Weapon/Class Column</label>
				{#if characterEnabled}
					<div class="field mt-1"><label class="fl">Column Label</label><input type="text" class="fi" bind:value={characterLabel} placeholder="Character" /></div>
					<div class="field">
						<label class="fl">Options</label>
						{#each characterOptions as _, i}
							<div class="item-row">
								<input type="text" class="fi fi--sm" bind:value={characterOptions[i]} placeholder="e.g. Knight, Mage" />
								<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeCharacter(i)}>✕</button>
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
				<h3 class="section-title">Restrictions</h3>
				{#each restrictions as item, i}
					<div class="item-group">
						<div class="item-row">
							<div class="item-row__fields">
								<input type="text" class="fi fi--sm" bind:value={restrictions[i].label} placeholder="Label" oninput={() => { restrictions[i].slug = slugify(restrictions[i].label); restrictions = [...restrictions]; }} />
								<textarea class="fi fi--sm" rows="2" bind:value={restrictions[i].description} placeholder="Description (optional)"></textarea>
								<textarea class="fi fi--sm" rows="2" bind:value={restrictions[i].exceptions} placeholder="Exceptions (optional)"></textarea>
							</div>
							<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeRestriction(i)}>✕</button>
						</div>
						{#if item.children?.length}
							<div class="children-indent">
								{#each item.children as child, ci}
									<div class="item-row">
										<div class="item-row__fields">
											<input type="text" class="fi fi--sm" bind:value={restrictions[i].children[ci].label} placeholder="Child label" oninput={() => { restrictions[i].children[ci].slug = slugify(restrictions[i].children[ci].label); restrictions = [...restrictions]; }} />
											<textarea class="fi fi--sm" rows="1" bind:value={restrictions[i].children[ci].description} placeholder="Description"></textarea>
										</div>
										<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeRestrictionChild(i, ci)}>✕</button>
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
				<h3 class="section-title">Glitch Categories</h3>
				{#each glitches as item, i}
					<div class="item-row">
						<div class="item-row__fields">
							<input type="text" class="fi fi--sm" bind:value={glitches[i].label} placeholder="Label" oninput={() => { glitches[i].slug = slugify(glitches[i].label); glitches = [...glitches]; }} />
							<textarea class="fi fi--sm" rows="2" bind:value={glitches[i].description} placeholder="Description (optional)"></textarea>
						</div>
						<button type="button" class="btn-icon btn-icon--danger" onclick={() => removeGlitch(i)}>✕</button>
					</div>
				{/each}
				<button type="button" class="btn btn--sm" onclick={addGlitch}>+ Add Glitch Category</button>

				<div class="field mt-2"><label class="fl">NMG Rules</label><textarea class="fi" rows="3" bind:value={nmgRules} placeholder="What qualifies as a major glitch for this game?"></textarea></div>
				<div class="field"><label class="fl">Glitch Documentation Links</label><textarea class="fi" rows="2" bind:value={glitchDocLinks} placeholder="Links to guides, wikis..."></textarea></div>
			</div>
		{/if}

		<!-- Review Notes -->
		{#if activeTab === 'notes'}
			<div class="tab-body">
				<h3 class="section-title">Review Notes</h3>
				<p class="muted mb-1">Summarize what you changed and why. This will be sent to the submitter.</p>
				<textarea class="fi" rows="6" bind:value={reviewerNotes} placeholder="e.g. Fixed category names, added missing restrictions, corrected timing method..."></textarea>

				{#if game.reviewer_notes}
					<div class="previous-notes mt-2">
						<span class="previous-notes__label">Previous reviewer notes:</span>
						<p>{game.reviewer_notes}</p>
					</div>
				{/if}
			</div>
		{/if}

	</div>

	<!-- Action bar -->
	<div class="action-bar">
		<a href="/admin/games" class="btn">Cancel</a>
		<button type="button" class="btn btn--primary" onclick={handleSave} disabled={saving || !reviewerNotes.trim()}>
			{saving ? 'Saving...' : 'Save Changes & Request Revision'}
		</button>
	</div>
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	h1 { margin: 0 0 0.25rem; }

	.alert { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
	.alert--success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
	.alert--error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }

	.submitter-notes { padding: 0.75rem 1rem; background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; margin: 1rem 0; font-size: 0.9rem; }
	.submitter-notes__label { font-weight: 600; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
	.submitter-notes p { margin: 0.25rem 0 0; white-space: pre-wrap; }

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
	.chip-ed__x { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.85rem; }
	.chip-ed__x:hover { color: #fff; }
	.chip-ed__input { border: none; background: transparent; color: var(--fg); font-size: 0.88rem; outline: none; flex: 1; min-width: 120px; padding: 0.15rem 0; }

	/* Item rows */
	.item-row { display: flex; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.75rem; }
	.item-row__fields { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
	.item-group { padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.75rem; }
	.children-indent { margin: 0.5rem 0 0.5rem 1.25rem; padding-left: 0.75rem; border-left: 2px solid var(--border); }

	.btn-icon { background: none; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; padding: 0.3rem 0.5rem; font-size: 1rem; color: var(--muted); flex-shrink: 0; }
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

	@media (max-width: 600px) {
		.item-row { flex-direction: column; }
		.action-bar { flex-direction: column; }
		.action-bar .btn { width: 100%; justify-content: center; }
	}
</style>
