<script lang="ts">
	import { formatDate, formatTime } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { page } from '$app/stores';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { CheckCircle, Play, ExternalLink, Filter, X, ChevronUp, ChevronDown, Check } from 'lucide-svelte';
	import * as Button from '$lib/components/ui/button/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import * as Switch from '$lib/components/ui/switch/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';

	let { data } = $props();
	const game = $derived(data.game);
	const cat = $derived(data.category);

	// ── Config ──
	const PAGE_SIZE = 25;

	// ── Filter & Sort State ──
	let query = $state('');
	let sortKey = $state<'date' | 'time'>('date');
	let sortDir = $state<'desc' | 'asc'>('desc');
	let showAdvanced = $state(false);
	let verifiedOnly = $state(false);

	// Advanced filter selections
	let selectedCharacter = $state<{ slug: string; label: string } | null>(null);
	let selectedChallenges = $state<Map<string, string>>(new Map());
	let selectedRestrictions = $state<Map<string, string>>(new Map());
	let selectedGlitch = $state<{ slug: string; label: string } | null>(null);

	// Combobox state
	let charSearch = $state(''); let charFilterText = $state('');
	let challengeSearch = $state(''); let challengeFilterText = $state('');
	let restrictionSearch = $state(''); let restrictionFilterText = $state('');
	let glitchSearch = $state(''); let glitchFilterText = $state('');

	// ── Available options from game data ──
	const hasCharacters = $derived(game.character_column?.enabled && (game.characters_data?.length ?? 0) > 0);
	const characterLabel = $derived(game.character_column?.label || 'Character');
	const hasDifficulties = $derived(game.difficulty_column?.enabled && (game.difficulties_data?.length ?? 0) > 0);
	const difficultyLabel = $derived(game.difficulty_column?.label || 'Difficulty');
	const hasChallenges = $derived((game.challenges_data?.length ?? 0) > 0);
	const hasRestrictions = $derived((game.restrictions_data?.length ?? 0) > 0);
	const hasGlitches = $derived((game.glitches_data?.length ?? 0) > 0);
	const hasAnyAdvanced = $derived(hasCharacters || hasChallenges || hasRestrictions || hasGlitches);

	// Flatten items with children for lookups and search
	function flattenWithChildren(items: any[]): [string, string][] {
		const flat: [string, string][] = [];
		for (const item of items) {
			flat.push([item.slug, item.label]);
			if (item.children?.length) {
				for (const child of item.children) flat.push([child.slug, `${item.label} › ${child.label}`]);
			}
		}
		return flat;
	}
	function flattenForSearch(items: any[]): { slug: string; label: string }[] {
		return flattenWithChildren(items).map(([slug, label]) => ({ slug, label }));
	}

	// Lookup maps
	const challengeMap: Map<string, string> = $derived(new Map(flattenWithChildren(game.challenges_data || [])));
	const restrictionMap: Map<string, string> = $derived(new Map(flattenWithChildren(game.restrictions_data || [])));
	const characterMap = $derived(new Map(flattenWithChildren(game.characters_data || [])));
	const difficultyMap = $derived(new Map(flattenWithChildren(game.difficulties_data || [])));
	const glitchMap = $derived(new Map(flattenWithChildren(game.glitches_data || [])));

	const activeFilterCount = $derived(
		(selectedCharacter ? 1 : 0) + selectedChallenges.size + selectedRestrictions.size + (selectedGlitch ? 1 : 0) + (verifiedOnly ? 1 : 0)
	);

	// ── Typeahead helpers ──
	function norm(s: string) { return s.trim().toLowerCase(); }

	function filterItems(items: { slug: string; label: string }[], search: string, excludeSet?: Map<string, string>) {
		const q = norm(search);
		let list = items;
		if (excludeSet) list = list.filter(i => !excludeSet.has(i.slug));
		if (!q) return list.slice(0, 20);
		return list.filter(i => norm(i.label).includes(q) || norm(i.slug).includes(q)).slice(0, 20);
	}

	function clearCharacter() { selectedCharacter = null; charSearch = ''; }
	function addChallenge(c: { slug: string; label: string }) { selectedChallenges = new Map([...selectedChallenges, [c.slug, c.label]]); challengeSearch = ''; }
	function removeChallenge(slug: string) { const m = new Map(selectedChallenges); m.delete(slug); selectedChallenges = m; }
	function addRestriction(r: { slug: string; label: string }) { selectedRestrictions = new Map([...selectedRestrictions, [r.slug, r.label]]); restrictionSearch = ''; }
	function removeRestriction(slug: string) { const m = new Map(selectedRestrictions); m.delete(slug); selectedRestrictions = m; }
	function clearGlitch() { selectedGlitch = null; glitchSearch = ''; }
	function resetFilters() { clearCharacter(); selectedChallenges = new Map(); challengeSearch = ''; selectedRestrictions = new Map(); restrictionSearch = ''; clearGlitch(); verifiedOnly = false; }

	function resolveToSlugs(values: string[], lookupMap: Map<string, string>): string[] {
		const labelToSlug = new Map<string, string>();
		for (const [slug, label] of lookupMap) labelToSlug.set(norm(label), slug);
		return values.map(v => { const n = norm(v); if (lookupMap.has(n)) return n; return labelToSlug.get(n) || n; });
	}

	// ── Filtered + Sorted Runs ──
	const processedRuns = $derived.by(() => {
		let runs = [...data.runs];

		if (query.trim()) {
			const q = norm(query);
			runs = runs.filter((r: any) => {
				const fields = [r.runner, r.character, ...(r.standard_challenges || []), ...(r.restrictions || []), r.runner_notes || ''].filter(Boolean).join(' ');
				return norm(fields).includes(q);
			});
		}

		if (verifiedOnly) runs = runs.filter((r: any) => r.verified);

		if (selectedCharacter) {
			const slug = norm(selectedCharacter.slug);
			runs = runs.filter((r: any) => norm(r.character || '') === slug);
		}
		if (selectedChallenges.size > 0) {
			const needed = [...selectedChallenges.keys()].map(norm);
			runs = runs.filter((r: any) => { const s = resolveToSlugs(r.standard_challenges || [], challengeMap).map(norm); return needed.every(n => s.includes(n)); });
		}
		if (selectedRestrictions.size > 0) {
			const needed = [...selectedRestrictions.keys()].map(norm);
			runs = runs.filter((r: any) => { const ids = r.restriction_ids || r.restrictions || []; const s = resolveToSlugs(ids, restrictionMap).map(norm); return needed.every(n => s.includes(n)); });
		}
		if (selectedGlitch) {
			const slug = norm(selectedGlitch.slug);
			runs = runs.filter((r: any) => norm(r.glitch_id || '') === slug);
		}

		runs.sort((a: any, b: any) => {
			if (sortKey === 'time') {
				const ta = parseTime(a.time_primary); const tb = parseTime(b.time_primary);
				return sortDir === 'asc' ? ta - tb : tb - ta;
			}
			const da = new Date(a.date_completed).getTime() || 0; const db = new Date(b.date_completed).getTime() || 0;
			return sortDir === 'desc' ? db - da : da - db;
		});
		return runs;
	});

	function parseTime(t: string): number {
		if (!t || t === '—') return Infinity;
		const parts = t.split(':').map(Number);
		if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
		if (parts.length === 2) return parts[0] * 60 + parts[1];
		return parseFloat(t) || Infinity;
	}

	// ── Pagination ──
	let currentPage = $state(1);
	$effect(() => { query; selectedCharacter; selectedChallenges; selectedRestrictions; selectedGlitch; verifiedOnly; currentPage = 1; });
	const totalPages = $derived(Math.max(1, Math.ceil(processedRuns.length / PAGE_SIZE)));
	const safeCurrentPage = $derived(Math.min(currentPage, totalPages));
	const pagedRuns = $derived(() => { const s = (safeCurrentPage - 1) * PAGE_SIZE; return processedRuns.slice(s, s + PAGE_SIZE); });
	const showingStart = $derived(processedRuns.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1);
	const showingEnd = $derived(Math.min(safeCurrentPage * PAGE_SIZE, processedRuns.length));

	let tableEl: HTMLElement | undefined = $state();
	let expandedNoteIndex = $state<number | null>(null);
	function goToPage(p: number) { currentPage = Math.max(1, Math.min(p, totalPages)); tableEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
	function toggleSort(key: 'date' | 'time') { if (sortKey === key) { sortDir = sortDir === 'desc' ? 'asc' : 'desc'; } else { sortKey = key; sortDir = key === 'time' ? 'asc' : 'desc'; } }

	// ── URL Hash filter support ──
	$effect(() => {
		const hash = $page.url.hash;
		if (!hash || !hash.includes('filters=')) return;
		try {
			const fd = JSON.parse(decodeURIComponent(hash.split('filters=')[1]));
			if (fd.challenges) { const m = new Map<string, string>(); for (const id of fd.challenges) m.set(id, challengeMap.get(id) || id); selectedChallenges = m; }
			if (fd.restrictions) { const m = new Map<string, string>(); for (const id of fd.restrictions) m.set(id, restrictionMap.get(id) || id); selectedRestrictions = m; }
			if (fd.character) { const id = Array.isArray(fd.character) ? fd.character[0] : fd.character; if (id) selectedCharacter = { slug: id, label: characterMap.get(id) || id }; }
			if (fd.glitch) { const id = Array.isArray(fd.glitch) ? fd.glitch[0] : fd.glitch; if (id) selectedGlitch = { slug: id, label: glitchMap.get(id) || id }; }
			if (selectedChallenges.size || selectedRestrictions.size || selectedCharacter || selectedGlitch) showAdvanced = true;
			history.replaceState(null, '', $page.url.pathname + $page.url.search);
		} catch (e) { console.error('Error parsing filter hash:', e); }
	});

	const showRestrictions = $derived(data.runs.some((r: any) => r.restrictions?.length || r.restriction_ids?.length));
	const hasAnyNotes = $derived(data.runs.some((r: any) => r.runner_notes));
	const hasAnyVerified = $derived(data.runs.some((r: any) => r.verified));

	// ── Tier & Category Nav ──
	const currentTier = $derived(data.tier);
	const tiers = $derived([
		...(game.full_runs?.length ? [{ id: 'full-runs', label: m.game_category_tier_full_runs() }] : []),
		...(game.mini_challenges?.length ? [{ id: 'mini-challenges', label: m.game_category_tier_mini() }] : []),
		...(game.player_made?.length ? [{ id: 'player-made', label: m.game_category_tier_player() }] : [])
	]);
	// Build grouped structure: [{ parent, children }] — all tiers support children
	const categoryGroups = $derived(
		(currentTier === 'mini-challenges' ? game.mini_challenges
			: currentTier === 'full-runs' ? game.full_runs
			: game.player_made || []).map((g: any) => ({
			parent: { slug: g.slug, label: g.label },
			children: (g.children || []).map((c: any) => ({ slug: c.slug, label: c.label }))
		}))
	);

	// Parent is active if it's directly selected OR if a child of it is selected
	const activeParentSlug = $derived(cat.parentGroup || (cat.isGroup ? cat.slug : null));
</script>

<svelte:head>
	<title>{cat.label} - {game.game_name} | CRC</title>
</svelte:head>

<!-- Tier Tabs -->
{#if tiers.length > 1}
	<nav class="runner-tabs runs-tier-tabs tabs--flush" aria-label="Run tiers">
		{#each tiers as tier}
			{@const firstCat = tier.id === 'full-runs' ? game.full_runs?.[0]?.slug
				: tier.id === 'mini-challenges' ? game.mini_challenges?.[0]?.slug
				: game.player_made?.[0]?.slug}
			<a
				href="/games/{game.game_id}/runs/{tier.id}/{firstCat}"
				class="tab"
				class:active={currentTier === tier.id}
				data-sveltekit-noscroll
			>{tier.label}</a>
		{/each}
	</nav>
{/if}

<!-- Category Sub-Tabs -->
{#if categoryGroups.length > 1 || categoryGroups.some(g => g.children.length > 0)}
	<div class="runs-category-nav">
		<div class="cat-parents">
			{#each categoryGroups as group}
				<a
					href="/games/{game.game_id}/runs/{currentTier}/{group.parent.slug}"
					class="cat-parent"
					class:active={cat.slug === group.parent.slug || activeParentSlug === group.parent.slug}
					data-sveltekit-noscroll
				>{group.parent.label}</a>
			{/each}
		</div>
		{#each categoryGroups as group}
			{#if group.children.length > 0 && activeParentSlug === group.parent.slug}
				<div class="cat-children">
					{#each group.children as child}
						<a
							href="/games/{game.game_id}/runs/{currentTier}/{child.slug}"
							class="cat-child"
							class:active={cat.slug === child.slug}
							data-sveltekit-noscroll
						>{child.label}</a>
					{/each}
				</div>
			{/if}
		{/each}
	</div>
{/if}

<h2>{cat.label}</h2>
{#if cat.description}<div class="cat-desc muted">{@html renderMarkdown(cat.description)}</div>{/if}
{#if cat.parentGroupLabel}<p class="muted">{m.game_category_part_of({ name: cat.parentGroupLabel })}</p>{/if}

{#if data.runs.length === 0}
	<div class="card" style="margin-top:1rem;">
		<p class="muted">{m.game_category_empty()}</p>
		<a href={localizeHref(`/games/${game.game_id}/submit`)} class="btn btn--small">{m.game_submit_run()}</a>
	</div>
{:else}
	<!-- Filter Bar -->
	<div class="filter-bar" bind:this={tableEl}>
		<div class="filter-input">
			<input type="text" placeholder={m.game_category_filter_placeholder()} bind:value={query} class="filter-input__field" />
			{#if query}<button class="filter-input__clear" onclick={() => query = ''} aria-label="Clear filter"><X size={14} /></button>{/if}
		</div>
		{#if hasAnyAdvanced || hasAnyVerified}
			<button class="btn btn--filter-toggle" class:is-active={showAdvanced} onclick={() => showAdvanced = !showAdvanced} aria-expanded={showAdvanced}>
				<span class="filter-toggle__icon">{showAdvanced ? 'chevron-up' : 'chevron-down'}</span> {m.game_category_advanced()}
				{#if activeFilterCount > 0}<span class="filter-badge">{activeFilterCount}</span>{/if}
			</button>
		{/if}
	</div>

	<!-- Advanced Filters Panel -->
	{#if showAdvanced}
		<div class="advanced-filters">
			<div class="filter-groups">
				{#if hasCharacters}
					<div class="filter-group">
						<label class="filter-group__label">{characterLabel}</label>
						<div class="combobox-wrap">
							<Combobox.Root class="combobox-single" bind:inputValue={charSearch} onInputValueChange={(v: string) => { charFilterText = v; }} onValueChange={(v: string) => { const items = flattenForSearch(game.characters_data || []); const match = items.find(i => i.slug === v); if (match) { selectedCharacter = match; } }} onOpenChange={(o: boolean) => { if (!o) charFilterText = ''; }}>
								<Combobox.Input placeholder="Type a {characterLabel.toLowerCase()}..." />
								<Combobox.Content>
									{#each filterItems(flattenForSearch(game.characters_data || []), charFilterText) as c}
										<Combobox.Item value={c.slug} label={c.label}>{c.label}</Combobox.Item>
									{/each}
									{#if filterItems(flattenForSearch(game.characters_data || []), charFilterText).length === 0}
										<div class="combobox-empty">{m.game_rb_no_matches()}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
							{#if selectedCharacter}<button class="combobox-clear" onclick={clearCharacter}><X size={14} /></button>{/if}
						</div>
					</div>
				{/if}

				{#if hasChallenges}
					<div class="filter-group">
						<label class="filter-group__label">{m.game_category_challenge_label()}</label>
						<div class="combobox-wrap">
							<Combobox.Root class="combobox-single" bind:inputValue={challengeSearch} onInputValueChange={(v: string) => { challengeFilterText = v; }} onValueChange={(v: string) => { const items = flattenForSearch(game.challenges_data || []); const match = items.find(i => i.slug === v); if (match) addChallenge(match); }} onOpenChange={(o: boolean) => { if (!o) challengeFilterText = ''; }}>
								<Combobox.Input placeholder="Type a challenge..." />
								<Combobox.Content>
									{#each filterItems(flattenForSearch(game.challenges_data || []), challengeFilterText, selectedChallenges) as c}
										<Combobox.Item value={c.slug} label={c.label}>{c.label}</Combobox.Item>
									{/each}
									{#if filterItems(flattenForSearch(game.challenges_data || []), challengeFilterText, selectedChallenges).length === 0}
										<div class="combobox-empty">{selectedChallenges.size === (game.challenges_data?.length || 0) ? m.game_category_all_selected() : 'No matches'}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
						</div>
					</div>
				{/if}

				{#if hasRestrictions}
					<div class="filter-group">
						<label class="filter-group__label">{m.game_category_restriction_label()}</label>
						<div class="combobox-wrap">
							<Combobox.Root class="combobox-single" bind:inputValue={restrictionSearch} onInputValueChange={(v: string) => { restrictionFilterText = v; }} onValueChange={(v: string) => { const items = flattenForSearch(game.restrictions_data || []); const match = items.find(i => i.slug === v); if (match) addRestriction(match); }} onOpenChange={(o: boolean) => { if (!o) restrictionFilterText = ''; }}>
								<Combobox.Input placeholder="Type a restriction..." />
								<Combobox.Content>
									{#each filterItems(game.restrictions_data || [], restrictionFilterText, selectedRestrictions) as r}
										<Combobox.Item value={r.slug} label={r.label}>{r.label}</Combobox.Item>
									{/each}
									{#if filterItems(game.restrictions_data || [], restrictionFilterText, selectedRestrictions).length === 0}
										<div class="combobox-empty">{selectedRestrictions.size === (game.restrictions_data?.length || 0) ? m.game_category_all_selected() : 'No matches'}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
						</div>
					</div>
				{/if}

				{#if hasGlitches}
					<div class="filter-group">
						<label class="filter-group__label">{m.game_rb_glitch_label()}</label>
						<div class="combobox-wrap">
							<Combobox.Root class="combobox-single" bind:inputValue={glitchSearch} onInputValueChange={(v: string) => { glitchFilterText = v; }} onValueChange={(v: string) => { const items = flattenForSearch(game.glitches_data || []); const match = items.find(i => i.slug === v); if (match) { selectedGlitch = match; } }} onOpenChange={(o: boolean) => { if (!o) glitchFilterText = ''; }}>
								<Combobox.Input placeholder="Type a glitch category..." />
								<Combobox.Content>
									{#each filterItems(flattenForSearch(game.glitches_data || []), glitchFilterText) as g}
										<Combobox.Item value={g.slug} label={g.label}>{g.label}</Combobox.Item>
									{/each}
									{#if filterItems(flattenForSearch(game.glitches_data || []), glitchFilterText).length === 0}
										<div class="combobox-empty">{m.game_rb_no_matches()}</div>
									{/if}
								</Combobox.Content>
							</Combobox.Root>
							{#if selectedGlitch}<button class="combobox-clear" onclick={clearGlitch}><X size={14} /></button>{/if}
						</div>
					</div>
				{/if}

				<!-- Verified filter -->
				<div class="filter-group">
					<label class="filter-group__label">{m.game_category_verification_label()}</label>
					<label class="verified-toggle">
						<Switch.Root bind:checked={verifiedOnly} />
						<span>{m.game_category_verified_only()}</span>
					</label>
				</div>
			</div>

			{#if activeFilterCount > 0}
				<div class="filter-chips-row">
					<div class="filter-chips">
						{#if selectedCharacter}<button class="chip" onclick={clearCharacter}>{selectedCharacter.label} <X size={10} /></button>{/if}
						{#each [...selectedChallenges] as [slug, label]}<button class="chip" onclick={() => removeChallenge(slug)}>{label} <X size={10} /></button>{/each}
						{#each [...selectedRestrictions] as [slug, label]}<button class="chip chip--restriction" onclick={() => removeRestriction(slug)}>{label} <X size={10} /></button>{/each}
						{#if selectedGlitch}<button class="chip chip--glitch" onclick={clearGlitch}>{selectedGlitch.label} <X size={10} /></button>{/if}
						{#if verifiedOnly}<button class="chip chip--verified" onclick={() => verifiedOnly = false}>{m.game_category_verified_chip()} <X size={10} /></button>{/if}
					</div>
					<Button.Root variant="outline" size="sm" onclick={resetFilters}>{m.game_category_remove_all()}</Button.Root>
				</div>
			{/if}
		</div>
	{/if}

	<div class="results-status"><span class="muted">{#if processedRuns.length === data.runs.length}{m.game_category_showing_all({ count: String(data.runs.length) })}{:else}{m.game_category_found({ found: String(processedRuns.length), total: String(data.runs.length) })}{/if}</span></div>

	<!-- Runs Table -->
	<div class="table-wrap">
		<table class="runs-table">
			<thead><tr>
				<th>#</th><th>{m.runners_heading()}</th>
				{#if game.character_column?.enabled}<th>{game.character_column.label}</th>{/if}
				{#if game.difficulty_column?.enabled}<th>{game.difficulty_column.label}</th>{/if}
				<th>{m.game_category_th_challenges()}</th>
				{#if showRestrictions}<th>{m.game_category_th_restrictions()}</th>{/if}
				<th><button class="th-sort" class:th-sort--active={sortKey === 'time'} onclick={() => toggleSort('time')}>{m.game_category_th_time()}{#if game.timing_method} ({game.timing_method}){/if} {#if sortKey === 'time'}{sortDir === 'asc' ? 'chevron-up' : 'chevron-down'}{:else}<span class="th-sort__hint">⇅</span>{/if}</button></th>
				<th><button class="th-sort" class:th-sort--active={sortKey === 'date'} onclick={() => toggleSort('date')}>{m.game_category_th_date()} {#if sortKey === 'date'}{sortDir === 'desc' ? 'chevron-down' : 'chevron-up'}{:else}<span class="th-sort__hint">⇅</span>{/if}</button></th>
				<th>{m.game_category_th_video()}</th>
				<th class="col-verified-head" title={m.game_category_verified()}><Check size={12} /></th>
				{#if hasAnyNotes}<th>{m.game_category_th_notes()}</th>{/if}
			</tr></thead>
			<tbody>
				{#each pagedRuns() as run, i}
					<tr>
						<td class="col-rank">{showingStart + i}</td>
						<td><a href="/runners/{run.runner_id}">{run.runner}</a></td>
						{#if game.character_column?.enabled}<td>{characterMap.get(run.character || '') || run.character || '—'}</td>{/if}
						{#if game.difficulty_column?.enabled}<td>{difficultyMap.get(run.difficulty || '') || run.difficulty || '—'}</td>{/if}
						<td>{#each run.standard_challenges || [] as ch}<span class="tag tag--small">{challengeMap.get(ch) || ch}</span>{/each}{#if !run.standard_challenges?.length}—{/if}</td>
						{#if showRestrictions}<td>{#each run.restriction_ids || run.restrictions || [] as r}<span class="tag tag--small tag--restriction">{restrictionMap.get(r) || r}</span>{/each}{#if !(run.restriction_ids?.length || run.restrictions?.length)}—{/if}</td>{/if}
						<td class="col-time">{formatTime(run.time_primary)}</td>
						<td class="col-date">{formatDate(run.date_completed)}</td>
						<td>{#if run.video_url}{@const src = run.video_url.includes('youtube') || run.video_url.includes('youtu.be') ? 'YouTube' : run.video_url.includes('twitch') ? 'Twitch' : 'Watch'}<a href={run.video_url} target="_blank" rel="noopener" class="video-link">▶ {src}</a>{:else}—{/if}</td>
						<td class="col-verified">{#if run.verified}<span class="verified-check" title="Verified"><Check size={12} /></span>{/if}</td>
						{#if hasAnyNotes}<td class="col-notes">{#if run.runner_notes}{@const noteIdx = showingStart + i - 1}<button class="notes-toggle" onclick={() => expandedNoteIndex = expandedNoteIndex === noteIdx ? null : noteIdx}>{#if expandedNoteIndex === noteIdx}<span class="notes-expanded">{@html renderMarkdown(run.runner_notes)}</span>{:else}<span class="notes-text">{run.runner_notes}</span>{/if}</button>{/if}</td>{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<Pagination.Root bind:page={currentPage} count={processedRuns.length} perPage={PAGE_SIZE} class="pagination">
			<Pagination.PrevButton onclick={() => tableEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{m.game_category_prev()}</Pagination.PrevButton>
			<span class="pagination__status">{m.game_category_page_status({ current: String(safeCurrentPage), total: String(totalPages), start: String(showingStart), end: String(showingEnd), count: String(processedRuns.length) })}</span>
			<Pagination.NextButton onclick={() => tableEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{m.game_category_next()}</Pagination.NextButton>
		</Pagination.Root>
	{:else}
		<p class="pagination__status muted" style="text-align: center; margin-top: 0.75rem;">{m.game_category_showing_range({ start: String(showingStart), end: String(showingEnd), count: String(processedRuns.length) })}</p>
	{/if}
{/if}

<style>
	:global(.runs-tier-tabs) { top: 115px !important; }
	:global(.runs-category-nav) { margin-bottom: 1rem; position: sticky; top: 155px; z-index: 49; background: var(--bg); }
	:global(.cat-parents) {
		display: flex; flex-wrap: wrap; gap: 0; border-bottom: 2px solid var(--border);
	}
	:global(.cat-parent) {
		padding: 0.5rem 1rem; background: var(--surface); border: 1px solid var(--border); border-bottom: none;
		border-radius: 8px 8px 0 0; color: var(--text-muted); text-decoration: none; white-space: nowrap;
		font-size: 0.9rem; font-weight: 700; letter-spacing: 0.01em; margin-bottom: -2px;
		transition: color 0.15s, background 0.15s;
	}
	:global(.cat-parent:hover) { color: var(--fg); }
	:global(.cat-parent.active) { color: var(--accent); background: var(--bg); border-color: var(--border); border-bottom-color: var(--bg); }
	:global(.cat-children) {
		display: flex; flex-wrap: wrap; gap: 0.25rem; padding: 0.5rem 0.5rem;
		border-bottom: 1px solid var(--border); border-left: 3px solid var(--accent);
		margin-left: 0.5rem;
	}
	:global(.cat-child) {
		padding: 0.3rem 0.75rem; font-size: 0.8rem; color: var(--text-muted);
		text-decoration: none; border-radius: 4px; white-space: nowrap;
		transition: color 0.15s, background 0.15s;
	}
	:global(.cat-child:hover) { color: var(--fg); background: var(--surface); }
	:global(.cat-child.active) { color: var(--accent); font-weight: 600; background: rgba(99, 102, 241, 0.1); }
	h2 { margin-bottom: 0.5rem; }
	.filter-bar { display: flex; align-items: center; gap: 0.75rem; margin-top: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.filter-input { position: relative; flex: 1; min-width: 200px; }
	.filter-input__field { width: 100%; padding: 0.5rem 0.75rem; padding-right: 2rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.filter-input__field:focus { outline: none; border-color: var(--accent); }
	.filter-input__field::placeholder { color: var(--text-muted); }
	.filter-input__clear { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.85rem; padding: 0.25rem; }
	.filter-input__clear:hover { color: var(--fg); }
	.btn--filter-toggle { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.85rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--muted); cursor: pointer; font-size: 0.85rem; font-family: inherit; white-space: nowrap; }
	.btn--filter-toggle:hover { border-color: var(--accent); color: var(--fg); }
	.btn--filter-toggle.is-active { border-color: var(--accent); color: var(--accent); }
	.filter-toggle__icon { font-size: 0.7rem; }
	.filter-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 0 5px; }
	.advanced-filters { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
	.filter-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
	.filter-group__label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.3rem; }
	.combobox-wrap { position: relative; }
	.combobox-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 2px 5px; border-radius: 3px; z-index: 1; }
	.combobox-clear:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
	.combobox-empty { padding: 0.5rem 0.6rem; color: var(--muted); font-size: 0.8rem; }
	.filter-chips-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); flex-wrap: wrap; }
	.filter-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; flex: 1; }
	.chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.6rem; border-radius: 20px; font-size: 0.8rem; background: rgba(99, 102, 241, 0.15); color: #818cf8; border: none; cursor: pointer; font-family: inherit; }
	.chip:hover { background: rgba(99, 102, 241, 0.25); }
	.chip--restriction { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.chip--restriction:hover { background: rgba(245, 158, 11, 0.25); }
	.chip--glitch { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.chip--glitch:hover { background: rgba(16, 185, 129, 0.25); }
	.chip--verified { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
	.chip--verified:hover { background: rgba(56, 189, 248, 0.25); }

	/* Verified toggle */
	.verified-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; padding: 0.45rem 0; color: var(--fg); }

	.results-status { margin-bottom: 0.5rem; font-size: 0.8rem; }
	.table-wrap { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; }
	th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
	th { font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); position: sticky; top: 0; background: var(--bg); z-index: 1; }
	td a { color: var(--accent); text-decoration: none; }
	td a:hover { text-decoration: underline; }
	.col-rank { color: var(--text-muted); font-size: 0.8rem; width: 2rem; }
	.col-time { font-family: monospace; font-size: 0.9rem; white-space: nowrap; }
	.col-date { white-space: nowrap; font-size: 0.85rem; }
	.th-sort { background: none; border: none; color: var(--text-muted); cursor: pointer; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0; font-family: inherit; }
	.th-sort:hover { color: var(--fg); }
	.th-sort--active { color: var(--accent); }
	.th-sort__hint { opacity: 0.4; font-size: 0.7em; }

	/* Verified column */
	.col-verified-head { text-align: center; width: 2.5rem; }
	.col-verified { text-align: center; width: 2.5rem; }
	.verified-check { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; font-size: 0.7rem; font-weight: 700; background: rgba(16, 185, 129, 0.2); color: #10b981; }

	/* Notes column */
	.col-notes { max-width: 200px; }
	.notes-toggle { display: block; background: none; border: none; color: inherit; cursor: pointer; font-family: inherit; font-size: inherit; padding: 0; text-align: left; width: 100%; }
	.notes-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; color: var(--muted); }
	.notes-expanded { display: block; font-size: 0.8rem; color: var(--fg); white-space: normal; }
	.notes-expanded :global(p) { margin: 0.2rem 0; }
	.notes-expanded :global(a) { color: var(--accent); }
	.cat-desc { font-size: 0.9rem; margin-bottom: 0.5rem; }
	.cat-desc :global(p) { margin: 0.25rem 0; }
	.cat-desc :global(ul), .cat-desc :global(ol) { margin: 0.25rem 0; padding-left: 1.25rem; }
	.cat-desc :global(a) { color: var(--accent); }

	.tag--small { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: 500; margin-right: 0.25rem; background: rgba(99, 102, 241, 0.12); color: #818cf8; }
	.tag--restriction { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
	.video-link { white-space: nowrap; }
	:global(.pagination.ui-pagination) { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1rem; padding: 0.5rem 0; }
	:global(.pagination__status) { font-size: 0.8rem; color: var(--text-muted); }
	.btn { display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; font-family: inherit; }
	.btn:hover { border-color: var(--accent); }
	.btn--small { padding: 0.3rem 0.6rem; font-size: 0.8rem; }
	@media (max-width: 768px) { th, td { padding: 0.4rem 0.5rem; font-size: 0.85rem; } .col-rank { display: none; } th:first-child { display: none; } .filter-groups { grid-template-columns: 1fr; } .col-notes { max-width: 120px; } }
</style>
