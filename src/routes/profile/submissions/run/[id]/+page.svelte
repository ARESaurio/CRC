<script lang="ts">
	import { X } from 'lucide-svelte';
	import { user } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { isValidVideoUrl } from '$lib/utils';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import { showToast } from '$stores/toast';
	import { getAccessToken } from '$lib/admin';
	import { goto } from '$app/navigation';
	import { PUBLIC_WORKER_URL } from '$env/static/public';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import AuthGuard from '$components/auth/AuthGuard.svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

	let { data } = $props();
	const run = $derived(data.run);
	const game = $derived(data.game);
	const allPlatforms = $derived(data.platforms || []);

	const gamePlatforms = $derived(
		game.platforms?.length
			? allPlatforms.filter((p: any) => game.platforms.includes(p.id))
			: allPlatforms
	);

	// ── Claim lock ──
	const CLAIM_TTL_MS = 14 * 24 * 60 * 60 * 1000;
	const locked = $derived(
		!!(run.claimed_by && run.claimed_at && (Date.now() - new Date(run.claimed_at).getTime()) < CLAIM_TTL_MS)
	);

	// ── Form State (pre-filled from existing run) ──
	let categoryTier = $state(run.category_tier || '');
	let categorySlug = $state(run.category || '');
	let platform = $state(run.platform || '');
	let character = $state(run.character || '');
	let selectedChallenges = $state<string[]>(run.standard_challenges || []);
	let glitchId = $state(run.glitch_id || '');
	let selectedRestrictions = $state<string[]>(run.restrictions || []);
	let difficulty = $state(run.difficulty || '');
	let runTimeRta = $state(run.time_rta || '');
	let runTimePrimary = $state(run.time_primary || '');
	let dateCompleted = $state(run.run_date || '');
	let videoUrl = $state(run.video_url || '');
	let submitterNotes = $state(run.submitter_notes || '');

	// ── Combobox State (pre-filled) ──
	let platformSearch = $state(gamePlatforms.find((p: any) => p.id === run.platform)?.label || '');
	let platformFilterText = $state('');
	let charSearch = $state((game.characters_data || []).find((c: any) => c.slug === run.character)?.label || '');
	let charFilterText = $state('');
	let glitchSearch = $state((game.glitches_data || []).find((g: any) => g.slug === run.glitch_id)?.label || '');
	let glitchFilterText = $state('');
	let diffSearch = $state((game.difficulties_data || []).find((d: any) => d.slug === run.difficulty)?.label || '');
	let diffFilterText = $state('');

	// ── UI State ──
	let saving = $state(false);
	let errorMsg = $state('');

	// ── Game timing config ──
	const gameTimingMethod = $derived(game.timing_method || '');
	const hasGameTiming = $derived(!!gameTimingMethod && gameTimingMethod.toLowerCase() !== 'rta');
	const gameTimingLabel = $derived(gameTimingMethod || 'Primary Time');
	const showRtaSeparately = $derived(hasGameTiming);

	// ── Derived category options ──
	function buildTiers() {
		const tiers: { value: string; label: string; categories: { slug: string; label: string; fixed_loadout?: any }[] }[] = [];
		if (game.full_runs?.length) tiers.push({ value: 'full_runs', label: 'Full Runs', categories: game.full_runs.map((c: any) => ({ slug: c.slug, label: c.label, fixed_loadout: c.fixed_loadout })) });
		if (game.mini_challenges?.length) {
			const cats: any[] = [];
			for (const group of game.mini_challenges) {
				if (group.children?.length) {
					for (const child of group.children) cats.push({ slug: child.slug, label: `${group.label} › ${child.label}`, fixed_loadout: child.fixed_loadout });
				} else {
					cats.push({ slug: group.slug, label: group.label, fixed_loadout: group.fixed_loadout });
				}
			}
			tiers.push({ value: 'mini_challenges', label: 'Mini-Challenges', categories: cats });
		}
		if (game.player_made?.length) tiers.push({ value: 'player_made', label: 'Player-Made', categories: game.player_made.map((c: any) => ({ slug: c.slug, label: c.label, fixed_loadout: c.fixed_loadout })) });
		return tiers;
	}
	const tierOptions = $derived(buildTiers());
	const currentTier = $derived(tierOptions.find(t => t.value === categoryTier));
	const categoryOptions = $derived(currentTier?.categories || []);

	// ── Fixed Loadout ──
	const selectedCategory = $derived(categoryOptions.find(c => c.slug === categorySlug));
	const fixedLoadout = $derived(selectedCategory?.fixed_loadout?.enabled ? selectedCategory.fixed_loadout : null);

	// ── Validation ──
	const videoValid = $derived(!videoUrl || isValidVideoUrl(videoUrl));
	const notesWarning = $derived(checkBannedTerms(submitterNotes));
	const canSave = $derived(
		!!categoryTier && !!categorySlug && !!videoUrl && videoValid && !notesWarning && !locked
	);

	// ── Helpers ──
	function filterItems(items: { id?: string; slug?: string; label: string }[], search: string) {
		if (!search) return items.slice(0, 20);
		const lower = search.toLowerCase();
		return items.filter(item => item.label.toLowerCase().includes(lower)).slice(0, 20);
	}
	function clearPlatform() { platform = ''; platformSearch = ''; }
	function clearCharacter() { character = ''; charSearch = ''; }
	function clearGlitch() { glitchId = ''; glitchSearch = ''; }
	function clearDifficulty() { difficulty = ''; diffSearch = ''; }

	function toggleChallenge(slug: string) {
		if (selectedChallenges.includes(slug)) selectedChallenges = selectedChallenges.filter(s => s !== slug);
		else selectedChallenges = [...selectedChallenges, slug];
	}

	let expandedRestrictions = $state<Set<string>>(new Set());
	function toggleRestrictionExpand(slug: string) {
		const next = new Set(expandedRestrictions);
		if (next.has(slug)) next.delete(slug); else next.add(slug);
		expandedRestrictions = next;
	}
	function toggleRestriction(slug: string, parentRestriction?: any) {
		if (parentRestriction?.child_select === 'single') {
			const siblings = parentRestriction.children?.map((c: any) => c.slug) || [];
			selectedRestrictions = [...selectedRestrictions.filter(r => !siblings.includes(r)), slug];
		} else {
			if (selectedRestrictions.includes(slug)) selectedRestrictions = selectedRestrictions.filter(s => s !== slug);
			else selectedRestrictions = [...selectedRestrictions, slug];
		}
	}

	// ── Save ──
	async function handleSave() {
		if (!canSave) return;
		saving = true;
		errorMsg = '';

		try {
			const token = await getAccessToken();
			if (!token) throw new Error('Not authenticated');

			const payload: Record<string, any> = {
				run_id: run.public_id,
				category: categorySlug,
				category_tier: categoryTier,
				standard_challenges: selectedChallenges,
				character: character || null,
				difficulty: difficulty || null,
				glitch_id: glitchId || null,
				restrictions: selectedRestrictions,
				platform: platform || null,
				video_url: videoUrl,
				run_date: dateCompleted || null,
				time_rta: runTimeRta || null,
				time_primary: runTimePrimary || null,
				submitter_notes: submitterNotes || null,
			};

			const res = await fetch(`${PUBLIC_WORKER_URL}/edit-pending-run`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
				body: JSON.stringify(payload)
			});
			const data = await res.json();

			if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save changes');

			showToast('success', 'Changes saved');
			goto(localizeHref('/profile/submissions'));
		} catch (err: any) {
			errorMsg = err.message || 'Failed to save changes';
		}

		saving = false;
	}
</script>

<svelte:head><title>Edit Run — {game.game_name} | CRC</title></svelte:head>

<AuthGuard>
	<div class="page-width">
		<div class="edit-run-page">
			<p class="muted mb-2"><a href={localizeHref('/profile/submissions')}>← {m.user_menu_submissions()}</a></p>
			<h1>✏️ Edit Pending Run</h1>
			<p class="muted mb-3">Editing your <strong>{game.game_name}</strong> run submission.</p>

			{#if run.status !== 'pending'}
				<div class="alert alert--error">This submission is no longer pending and cannot be edited.</div>
			{:else if locked}
				<div class="lock-banner">
					<span>🔒</span>
					<span>{m.submissions_locked_message()}</span>
				</div>
			{/if}

			<form class="submit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
				<!-- Category -->
				<div class="submit-section">
					<p class="submit-section__title">{m.submit_run_section_category()} <span class="req">*</span></p>
					<div class="field-row">
						<div class="field">
							<label for="tier" class="field-label">{m.submit_run_tier()} <span class="req">*</span></label>
							<Select.Root bind:value={categoryTier} disabled={locked}>
								<Select.Trigger>{tierOptions.find(t => t.value === categoryTier)?.label || m.submit_run_select_tier()}</Select.Trigger>
								<Select.Content>
									{#each tierOptions as tier}
										<Select.Item value={tier.value} label={tier.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="field">
							<label for="category" class="field-label">{m.submit_run_section_category()} <span class="req">*</span></label>
							<Select.Root bind:value={categorySlug} disabled={locked || !categoryTier}>
								<Select.Trigger>{categoryOptions.find((c: any) => c.slug === categorySlug)?.label || m.submit_run_select_category()}</Select.Trigger>
								<Select.Content>
									{#each categoryOptions as cat}
										<Select.Item value={cat.slug} label={cat.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>
				</div>

				<!-- Platform -->
				<div class="submit-section">
					<p class="submit-section__title">{m.submit_run_section_platform()}</p>
					<div class="field" style="max-width: 300px;">
						<div class="combobox-wrap" oninput={(e: Event) => { platformFilterText = (e.target as HTMLInputElement).value; }}>
							<Combobox.Root class="combobox-single" bind:inputValue={platformSearch} onValueChange={(v: string) => { platform = v; }} onOpenChange={(o: boolean) => { if (!o) platformFilterText = ''; }} disabled={locked}>
								<Combobox.Input placeholder={m.submit_run_type_platform()} />
								<Combobox.Content>
									{#each filterItems(gamePlatforms, platformFilterText) as p}
										<Combobox.Item value={p.id ?? ''} label={p.label}>{p.label}</Combobox.Item>
									{/each}
									{#if filterItems(gamePlatforms, platformFilterText).length === 0}
										<div class="combobox-empty">{m.submit_run_no_matches()}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
							{#if platform}<button type="button" class="combobox-clear" onclick={clearPlatform}><X size={14} /></button>{/if}
						</div>
					</div>
				</div>

				<!-- Character -->
				{#if game.character_column?.enabled && game.characters_data?.length}
					<div class="submit-section">
						<p class="submit-section__title">{game.character_column.label}{#if fixedLoadout?.character} <span class="fixed-badge">🔒 {m.submit_run_fixed_badge()}</span>{/if}</p>
						<div class="field">
							<div class="combobox-wrap" oninput={(e: Event) => { charFilterText = (e.target as HTMLInputElement).value; }}>
								<Combobox.Root class="combobox-single" bind:inputValue={charSearch} onValueChange={(v: string) => { character = v; }} onOpenChange={(o: boolean) => { if (!o) charFilterText = ''; }} disabled={locked || !!fixedLoadout?.character}>
									<Combobox.Input placeholder="Type a {game.character_column.label.toLowerCase()}..." />
									<Combobox.Content>
										{#each filterItems(game.characters_data || [], charFilterText) as c}
											<Combobox.Item value={c.slug ?? ''} label={c.label}>{c.label}</Combobox.Item>
										{/each}
										{#if filterItems(game.characters_data || [], charFilterText).length === 0}
											<div class="combobox-empty">{m.submit_run_no_matches()}</div>
										{/if}
									</Combobox.Content>
								</Combobox.Root>
								{#if character && !fixedLoadout?.character}<button type="button" class="combobox-clear" onclick={clearCharacter}><X size={14} /></button>{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Difficulty -->
				{#if game.difficulty_column?.enabled && game.difficulties_data?.length}
					<div class="submit-section">
						<p class="submit-section__title">{game.difficulty_column.label}</p>
						<div class="field">
							<div class="combobox-wrap" oninput={(e: Event) => { diffFilterText = (e.target as HTMLInputElement).value; }}>
								<Combobox.Root class="combobox-single" bind:inputValue={diffSearch} onValueChange={(v: string) => { difficulty = v; }} onOpenChange={(o: boolean) => { if (!o) diffFilterText = ''; }} disabled={locked}>
									<Combobox.Input placeholder="Type a {game.difficulty_column.label.toLowerCase()}..." />
									<Combobox.Content>
										{#each filterItems(game.difficulties_data || [], diffFilterText) as d}
											<Combobox.Item value={d.slug ?? ''} label={d.label}>{d.label}</Combobox.Item>
										{/each}
										{#if filterItems(game.difficulties_data || [], diffFilterText).length === 0}
											<div class="combobox-empty">{m.submit_run_no_matches()}</div>
										{/if}
									</Combobox.Content>
								</Combobox.Root>
								{#if difficulty}<button type="button" class="combobox-clear" onclick={clearDifficulty}><X size={14} /></button>{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Challenges -->
				{#if game.challenges_data?.length}
					<div class="submit-section">
						<p class="submit-section__title">{m.submit_run_section_challenges()}</p>
						<p class="submit-section__sub">{m.submit_run_challenges_sub()}</p>
						<div class="chip-grid">
							{#each game.challenges_data as ch}
								{@const isLocked = locked || fixedLoadout?.challenge === ch.slug}
								<button type="button" class="chip" class:chip--active={selectedChallenges.includes(ch.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleChallenge(ch.slug); }} disabled={isLocked}>{ch.label}{#if fixedLoadout?.challenge === ch.slug} 🔒{/if}</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Glitch Category -->
				{#if game.glitches_data?.length}
					<div class="submit-section">
						<p class="submit-section__title">{m.submit_run_section_glitch()}</p>
						<div class="field">
							<div class="combobox-wrap" oninput={(e: Event) => { glitchFilterText = (e.target as HTMLInputElement).value; }}>
								<Combobox.Root class="combobox-single" bind:inputValue={glitchSearch} onValueChange={(v: string) => { glitchId = v; }} onOpenChange={(o: boolean) => { if (!o) glitchFilterText = ''; }} disabled={locked}>
									<Combobox.Input placeholder={m.submit_run_type_glitch()} />
									<Combobox.Content>
										{#each filterItems(game.glitches_data || [], glitchFilterText) as g}
											<Combobox.Item value={g.slug ?? ''} label={g.label}>{g.label}</Combobox.Item>
										{/each}
										{#if filterItems(game.glitches_data || [], glitchFilterText).length === 0}
											<div class="combobox-empty">{m.submit_run_no_matches()}</div>
										{/if}
									</Combobox.Content>
								</Combobox.Root>
								{#if glitchId}<button type="button" class="combobox-clear" onclick={clearGlitch}><X size={14} /></button>{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Restrictions -->
				{#if game.restrictions_data?.length}
					<div class="submit-section">
						<p class="submit-section__title">{m.submit_run_section_restrictions()}</p>
						<p class="submit-section__sub">{m.submit_run_restrictions_sub()}</p>
						<div class="chip-grid">
							{#each game.restrictions_data as r}
								{@const isLocked = locked || fixedLoadout?.restriction === r.slug}
								{@const hasChildren = (r.children?.length ?? 0) > 0}
								{@const isExpanded = expandedRestrictions.has(r.slug)}
								{#if hasChildren}
									<button type="button" class="chip chip--parent" class:chip--expanded={isExpanded} onclick={() => toggleRestrictionExpand(r.slug)}>
										{r.label} <span class="chip__arrow">{isExpanded ? '▲' : '▼'}</span>
									</button>
									{#if isExpanded}
										<div class="chip-children">
											{#if r.child_select === 'single'}<span class="chip-children__hint">{m.submit_run_pick_one()}</span>{/if}
											{#each r.children as child}
												{@const childLocked = locked || fixedLoadout?.restriction === child.slug}
												<button type="button" class="chip" class:chip--active={selectedRestrictions.includes(child.slug)} class:chip--locked={childLocked} onclick={() => { if (!childLocked) toggleRestriction(child.slug, r); }} disabled={childLocked}>{child.label}</button>
											{/each}
										</div>
									{/if}
								{:else}
									<button type="button" class="chip" class:chip--active={selectedRestrictions.includes(r.slug)} class:chip--locked={isLocked} onclick={() => { if (!isLocked) toggleRestriction(r.slug); }} disabled={isLocked}>{r.label}</button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<!-- Timing -->
				<div class="submit-section">
					<p class="submit-section__title">{m.submit_run_section_timing()}</p>
					<div class="field-row">
						{#if showRtaSeparately}
							<div class="field">
								<label for="time-primary" class="field-label">{m.submit_run_time_label({ label: gameTimingLabel })}</label>
								<input id="time-primary" type="text" bind:value={runTimePrimary} placeholder={m.submit_run_time_placeholder()} disabled={locked} />
							</div>
						{/if}
						<div class="field">
							<label for="time-rta" class="field-label">{m.submit_run_rta_time()}</label>
							<input id="time-rta" type="text" bind:value={runTimeRta} placeholder={m.submit_run_time_placeholder()} disabled={locked} />
						</div>
					</div>
				</div>

				<!-- Date -->
				<div class="submit-section">
					<p class="submit-section__title">{m.submit_run_section_date()}</p>
					<div class="field" style="max-width: 240px;">
						<input type="date" bind:value={dateCompleted} max={new Date().toISOString().split('T')[0]} disabled={locked} />
					</div>
				</div>

				<!-- Video -->
				<div class="submit-section">
					<p class="submit-section__title">{m.submit_run_section_video()} <span class="req">*</span></p>
					<div class="field">
						<label for="video" class="field-label">{m.submit_run_video_url()} <span class="req">*</span></label>
						<input id="video" type="url" bind:value={videoUrl} required placeholder={m.submit_run_video_placeholder()} class:field--error={videoUrl && !videoValid} disabled={locked} />
						{#if videoUrl && !videoValid}
							<span class="field-error">{m.submit_run_video_error()}</span>
						{/if}
					</div>
				</div>

				<!-- Notes -->
				<div class="submit-section">
					<p class="submit-section__title">{m.submit_run_section_notes()}</p>
					<div class="field">
						<textarea bind:value={submitterNotes} placeholder={m.submit_run_notes_placeholder()} maxlength="500" rows="3" disabled={locked} class:field--error={!!notesWarning}></textarea>
						<div class="field-row-between">
							{#if notesWarning}<span class="field-error">{notesWarning}</span>{:else}<span></span>{/if}
							<span class="field-hint">{submitterNotes.length}/500</span>
						</div>
					</div>
				</div>

				{#if errorMsg}
					<div class="alert alert--error">{errorMsg}</div>
				{/if}

				<div class="form-actions">
					<a href={localizeHref('/profile/submissions')} class="btn">{m.btn_cancel()}</a>
					<Button.Root variant="accent" size="lg" type="submit" disabled={!canSave || saving || locked}>
						{saving ? m.btn_saving() : m.btn_save_changes()}
					</Button.Root>
				</div>
			</form>
		</div>
	</div>
</AuthGuard>

<style>
	.edit-run-page { max-width: 680px; margin: 2rem auto; }
	.mb-2 { margin-bottom: 0.75rem; }
	.mb-3 { margin-bottom: 1rem; }

	.lock-banner {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.75rem 1rem; margin-bottom: 1.5rem;
		background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2);
		border-radius: 8px; color: #fbbf24;
	}

	.submit-form { display: flex; flex-direction: column; gap: 1.25rem; }
	.submit-section { }
	.submit-section__title { margin: 0 0 0.25rem; font-weight: 600; font-size: 0.95rem; }
	.submit-section__sub { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--muted); }
	.req { color: #ef4444; }

	.field-row { display: flex; gap: 1rem; flex-wrap: wrap; }
	.field-row > .field { flex: 1; min-width: 200px; }
	.field { display: flex; flex-direction: column; gap: 0.25rem; }
	.field-label { font-size: 0.8rem; font-weight: 500; color: var(--muted); }
	.field-hint { font-size: 0.75rem; color: var(--muted); }
	.field-error { font-size: 0.8rem; color: #ef4444; }
	.field-row-between { display: flex; justify-content: space-between; align-items: center; }
	.field--error { border-color: #ef4444 !important; }

	.fixed-badge { font-size: 0.75rem; color: #fbbf24; }

	/* Combobox */
	.combobox-wrap { position: relative; }
	.combobox-clear { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted); font-size: 0.9rem; padding: 0; z-index: 1; }
	.combobox-clear:hover { color: #ef4444; }
	.combobox-empty { padding: 0.4rem 0.6rem; color: var(--muted); font-size: 0.85rem; }

	/* Chips */
	.chip-grid { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.chip { padding: 0.35rem 0.75rem; border-radius: 20px; font-size: 0.8rem; cursor: pointer; border: 1px solid var(--border); background: transparent; color: var(--fg); font-family: inherit; transition: all 0.15s; }
	.chip:hover:not(:disabled) { border-color: var(--accent); }
	.chip--active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
	.chip--locked { opacity: 0.5; cursor: default; }
	.chip--parent { font-weight: 600; }
	.chip__arrow { font-size: 0.65rem; margin-left: 0.15rem; }
	.chip-children { display: flex; flex-wrap: wrap; gap: 0.4rem; width: 100%; padding-left: 1rem; }
	.chip-children__hint { font-size: 0.75rem; color: var(--muted); width: 100%; }

	/* Actions */
	.form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--border); }

	.alert--error { padding: 0.75rem 1rem; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 0.9rem; }

	input, textarea { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.75rem; color: var(--fg); font-family: inherit; font-size: 0.9rem; }
	input:disabled, textarea:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
