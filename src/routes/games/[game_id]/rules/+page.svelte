<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
	const game = $derived(data.game);
	const globalChallenges = $derived(data.globalChallenges || {});

	/** Get the description for a challenge, falling back to the global definition */
	function challengeDescription(ch: { slug: string; description?: string }): string | undefined {
		if (ch.description) return ch.description;
		const global = globalChallenges[ch.slug];
		return global?.description || undefined;
	}

	// ── Rule Builder state ──
	let rbOpen = $state(false);
	let showPulse = $state(false);

	$effect(() => {
		const key = `crc-rb-seen-${game.game_id}`;
		if (typeof localStorage !== 'undefined' && !localStorage.getItem(key)) {
			showPulse = true;
		}
	});

	function toggleRuleBuilder() {
		rbOpen = !rbOpen;
		if (showPulse) {
			showPulse = false;
			const key = `crc-rb-seen-${game.game_id}`;
			if (typeof localStorage !== 'undefined') localStorage.setItem(key, '1');
		}
	}

	// All categories flattened for the picker
	const allCategories = $derived.by(() => {
		const cats: { slug: string; label: string; tier: string; tierSlug: string; description?: string; exceptions?: string }[] = [];
		for (const c of game.full_runs || []) cats.push({ slug: c.slug, label: c.label, tier: 'full_runs', tierSlug: 'full-runs', description: c.description, exceptions: c.exceptions });
		for (const g of game.mini_challenges || []) {
			cats.push({ slug: g.slug, label: g.label, tier: 'mini_challenges', tierSlug: 'mini-challenges', description: g.description, exceptions: g.exceptions });
			for (const ch of g.children || []) cats.push({ slug: g.slug + '/' + ch.slug, label: g.label + ' › ' + ch.label, tier: 'mini_challenges', tierSlug: 'mini-challenges' });
		}
		for (const c of game.player_made || []) cats.push({ slug: c.slug, label: c.label, tier: 'player_made', tierSlug: 'player-made', description: c.description, exceptions: c.exceptions });
		return cats;
	});

	const hasCharacters = $derived(game.character_column?.enabled && (game.characters_data?.length ?? 0) > 0);
	const characterLabel = $derived(game.character_column?.label || 'Character');
	const hasDifficulties = $derived(game.difficulty_column?.enabled && (game.difficulties_data?.length ?? 0) > 0);
	const difficultyLabel = $derived(game.difficulty_column?.label || 'Difficulty');
	const hasChallenges = $derived((game.challenges_data?.length ?? 0) > 0);
	const hasRestrictions = $derived((game.restrictions_data?.length ?? 0) > 0);
	const hasGlitches = $derived((game.glitches_data?.length ?? 0) > 0);
	const showRuleBuilder = $derived(allCategories.length > 0 && hasChallenges);

	// Selections
	let selectedCategory = $state<typeof allCategories[0] | null>(null);
	let selectedCharacter = $state<{ slug: string; label: string; description?: string } | null>(null);
	let selectedChallenges = $state<{ slug: string; label: string; description?: string; exceptions?: string }[]>([]);
	let selectedRestrictions = $state<{ slug: string; label: string; description?: string; exceptions?: string; children?: any[]; child_select?: string }[]>([]);
	let selectedGlitch = $state<{ slug: string; label: string; description?: string; exceptions?: string } | null>(null);
	let selectedDifficulty = $state<{ slug: string; label: string } | null>(null);

	// Typeahead state
	let catSearch = $state(''); let catOpen = $state(false);
	let charSearch = $state(''); let charOpen = $state(false);
	let challengeSearch = $state(''); let challengeOpen = $state(false);
	let restrictionSearch = $state(''); let restrictionOpen = $state(false);
	let glitchSearch = $state(''); let glitchOpen = $state(false);
	let diffSearch = $state(''); let diffOpen = $state(false);

	function norm(s: string) { return s.trim().toLowerCase(); }
	function handleBlur(closeFn: () => void) { setTimeout(closeFn, 180); }

	function filterItems(items: any[], search: string, excludeSlugs?: string[]) {
		const q = norm(search);
		let list = excludeSlugs ? items.filter((i: any) => !excludeSlugs.includes(i.slug)) : items;
		if (!q) return list.slice(0, 20);
		return list.filter((i: any) => norm(i.label).includes(q) || norm(i.slug).includes(q)).slice(0, 20);
	}

	// Category
	function selectCategory(c: typeof allCategories[0]) { selectedCategory = c; catSearch = c.label; catOpen = false; }
	function clearCategory() { selectedCategory = null; catSearch = ''; }

	// Character
	function selectChar(c: any) { selectedCharacter = c; charSearch = c.label; charOpen = false; }
	function clearChar() { selectedCharacter = null; charSearch = ''; }

	// Challenges (multi)
	function addChallenge(c: any) { selectedChallenges = [...selectedChallenges, c]; challengeSearch = ''; challengeOpen = false; }
	function removeChallenge(slug: string) { selectedChallenges = selectedChallenges.filter(c => c.slug !== slug); }

	// Restrictions (multi — parent + optional child sub-select)
	function addRestriction(r: any) {
		selectedRestrictions = [...selectedRestrictions, r];
		restrictionSearch = ''; restrictionOpen = false;
		// If this restriction has children, initialize with no child selected
		if (r.children?.length) {
			restrictionChildSelections = { ...restrictionChildSelections, [r.slug]: null };
		}
	}
	function removeRestriction(slug: string) {
		selectedRestrictions = selectedRestrictions.filter(r => r.slug !== slug);
		const { [slug]: _, ...rest } = restrictionChildSelections;
		restrictionChildSelections = rest;
	}
	// Track child selections per parent restriction: parentSlug → child object or null
	let restrictionChildSelections = $state<Record<string, any>>({});
	function selectRestrictionChild(parentSlug: string, child: any) {
		restrictionChildSelections = { ...restrictionChildSelections, [parentSlug]: child };
	}
	function clearRestrictionChild(parentSlug: string) {
		restrictionChildSelections = { ...restrictionChildSelections, [parentSlug]: null };
	}

	// Glitch
	function selectGlitchItem(g: any) { selectedGlitch = g; glitchSearch = g.label; glitchOpen = false; }
	function clearGlitchItem() { selectedGlitch = null; glitchSearch = ''; }
	function selectDiff(d: any) { selectedDifficulty = d; diffSearch = d.label; diffOpen = false; }
	function clearDiff() { selectedDifficulty = null; diffSearch = ''; }

	function resetAll() {
		clearCategory(); clearChar(); clearGlitchItem(); clearDiff();
		selectedChallenges = []; challengeSearch = '';
		selectedRestrictions = []; restrictionSearch = '';
		restrictionChildSelections = {};
	}

	const hasSelections = $derived(selectedCategory || selectedCharacter || selectedDifficulty || selectedChallenges.length > 0 || selectedRestrictions.length > 0 || selectedGlitch);

	// Export ruleset as text
	function exportRuleset() {
		const lines: string[] = [];
		lines.push(`${game.game_name} — Custom Ruleset`);
		lines.push('='.repeat(40));
		lines.push('');
		if (selectedCategory) {
			lines.push(`Category: ${selectedCategory.label}`);
			if (selectedCategory.description) lines.push(`  ${selectedCategory.description.replace(/\n/g, '\n  ')}`);
			if (selectedCategory.exceptions) lines.push(`  Exceptions: ${selectedCategory.exceptions.replace(/\n/g, '\n  ')}`);
			lines.push('');
		}
		if (selectedCharacter) {
			lines.push(`${characterLabel}: ${selectedCharacter.label}`);
			if (selectedCharacter.description) lines.push(`  ${selectedCharacter.description.replace(/\n/g, '\n  ')}`);
			lines.push('');
		}
		if (selectedDifficulty) {
			lines.push(`${difficultyLabel}: ${selectedDifficulty.label}`);
			lines.push('');
		}
		for (const ch of selectedChallenges) {
			lines.push(`Challenge: ${ch.label}`);
			const chDesc = challengeDescription(ch);
			if (chDesc) lines.push(`  ${chDesc.replace(/\n/g, '\n  ')}`);
			if (ch.exceptions) lines.push(`  Exceptions: ${ch.exceptions.replace(/\n/g, '\n  ')}`);
			lines.push('');
		}
		for (const r of selectedRestrictions) {
			const child = restrictionChildSelections[r.slug];
			lines.push(`Restriction: ${r.label}${child ? ' › ' + child.label : ''}`);
			if (child?.description) lines.push(`  ${child.description.replace(/\n/g, '\n  ')}`);
			else if (r.description) lines.push(`  ${r.description.replace(/\n/g, '\n  ')}`);
			if (child?.exceptions) lines.push(`  Exceptions: ${child.exceptions.replace(/\n/g, '\n  ')}`);
			else if (r.exceptions) lines.push(`  Exceptions: ${r.exceptions.replace(/\n/g, '\n  ')}`);
			lines.push('');
		}
		if (selectedGlitch) {
			lines.push(`Glitch Rules: ${selectedGlitch.label}`);
			if (selectedGlitch.description) lines.push(`  ${selectedGlitch.description.replace(/\n/g, '\n  ')}`);
			if (selectedGlitch.exceptions) lines.push(`  Exceptions: ${selectedGlitch.exceptions.replace(/\n/g, '\n  ')}`);
			lines.push('');
		}
		lines.push(`Generated from: ${window.location.origin}/games/${game.game_id}/rules`);
		lines.push(`Date: ${new Date().toLocaleDateString()}`);

		const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${game.game_id}-ruleset.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Build "Find Runners" URL
	const findRunnersUrl = $derived.by(() => {
		if (!selectedCategory) return '';
		const tierSlug = selectedCategory.tierSlug;
		const catSlug = selectedCategory.slug;
		let url = `/games/${game.game_id}/runs/${tierSlug}/${catSlug}`;
		const fd: any = {};
		if (selectedChallenges.length) fd.challenges = selectedChallenges.map(c => c.slug);
		if (selectedRestrictions.length) fd.restrictions = selectedRestrictions.map(r => {
			const child = restrictionChildSelections[r.slug];
			return child ? r.slug + '/' + child.slug : r.slug;
		});
		if (selectedCharacter) fd.character = selectedCharacter.slug;
		if (selectedGlitch) fd.glitch = selectedGlitch.slug;
		if (Object.keys(fd).length) url += '#filters=' + encodeURIComponent(JSON.stringify(fd));
		return url;
	});
</script>

<svelte:head>
	<title>{m.game_rules_page_title({ name: game.game_name })}</title>
</svelte:head>

<h1>{m.game_rules_page_heading()}</h1>
<p class="muted mb-4">{m.game_rules_page_desc({ name: game.game_name })}</p>

<!-- ═══ Rule Builder ═══ -->
{#if showRuleBuilder}
	<div class="card rb-card">
		<div class="rb-header">
			<span class="muted rb-subtitle">{m.game_rb_subtitle()}</span>
			<button class="btn btn--filter-toggle" class:is-active={rbOpen} class:rb-pulse={showPulse && !rbOpen} onclick={toggleRuleBuilder} aria-expanded={rbOpen}>
				<span class="filter-toggle__icon">{rbOpen ? '▲' : '▼'}</span> {rbOpen ? m.game_rb_close() : m.game_rb_open()}
			</button>
		</div>

		{#if rbOpen}
			<div class="rb-content">
				<div class="rb-groups">
					<!-- Category -->
					<div class="rb-group">
						<label class="rb-label">{m.game_rb_category_label()}</label>
						<div class="ta">
							<input type="text" class="rb-field" placeholder={m.game_rb_category_placeholder()} autocomplete="off" bind:value={catSearch}
								onclick={() => catOpen = !catOpen} oninput={() => { if (!catOpen) catOpen = true; }}
								onblur={() => handleBlur(() => { catOpen = false; if (selectedCategory) catSearch = selectedCategory.label; else catSearch = ''; })} />
							{#if selectedCategory}<button class="ta__clear" onclick={clearCategory}>✕</button>{/if}
							{#if catOpen}
								{@const matches = filterItems(allCategories, catSearch)}
								<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.game_rb_no_matches()}</li>{:else}{#each matches as c}<li><button class="ta__opt" class:ta__opt--active={selectedCategory?.slug === c.slug} onmousedown={() => selectCategory(c)}>{c.label}</button></li>{/each}{/if}</ul>
							{/if}
						</div>
					</div>

					<!-- Character -->
					{#if hasCharacters}
						<div class="rb-group">
							<label class="rb-label">{characterLabel}</label>
							<div class="ta">
								<input type="text" class="rb-field" placeholder="Type a {characterLabel.toLowerCase()}..." autocomplete="off" bind:value={charSearch}
									onclick={() => charOpen = !charOpen} oninput={() => { if (!charOpen) charOpen = true; }}
									onblur={() => handleBlur(() => { charOpen = false; if (selectedCharacter) charSearch = selectedCharacter.label; else charSearch = ''; })} />
								{#if selectedCharacter}<button class="ta__clear" onclick={clearChar}>✕</button>{/if}
								{#if charOpen}
									{@const matches = filterItems(game.characters_data || [], charSearch)}
									<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.game_rb_no_matches()}</li>{:else}{#each matches as c}<li><button class="ta__opt" class:ta__opt--active={selectedCharacter?.slug === c.slug} onmousedown={() => selectChar(c)}>{c.label}</button></li>{/each}{/if}</ul>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Difficulty -->
					{#if hasDifficulties}
						<div class="rb-group">
							<label class="rb-label">{difficultyLabel}</label>
							<div class="ta">
								<input type="text" class="rb-field" placeholder="Type a {difficultyLabel.toLowerCase()}..." autocomplete="off" bind:value={diffSearch}
									onclick={() => diffOpen = !diffOpen} oninput={() => { if (!diffOpen) diffOpen = true; }}
									onblur={() => handleBlur(() => { diffOpen = false; if (selectedDifficulty) diffSearch = selectedDifficulty.label; else diffSearch = ''; })} />
								{#if selectedDifficulty}<button class="ta__clear" onclick={clearDiff}>✕</button>{/if}
								{#if diffOpen}
									{@const matches = filterItems(game.difficulties_data || [], diffSearch)}
									<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.game_rb_no_matches()}</li>{:else}{#each matches as d}<li><button class="ta__opt" class:ta__opt--active={selectedDifficulty?.slug === d.slug} onmousedown={() => selectDiff(d)}>{d.label}</button></li>{/each}{/if}</ul>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Challenges -->
					{#if hasChallenges}
						<div class="rb-group">
							<label class="rb-label">{m.game_rb_challenges_label()}</label>
							<div class="ta">
								<input type="text" class="rb-field" placeholder={m.game_rb_challenges_placeholder()} autocomplete="off" bind:value={challengeSearch}
									onclick={() => challengeOpen = !challengeOpen} oninput={() => { if (!challengeOpen) challengeOpen = true; }}
									onblur={() => handleBlur(() => { challengeOpen = false; challengeSearch = ''; })} />
								{#if challengeOpen}
									{@const matches = filterItems(game.challenges_data || [], challengeSearch, selectedChallenges.map(c => c.slug))}
									<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.game_rb_no_matches()}</li>{:else}{#each matches as c}<li><button class="ta__opt" onmousedown={() => addChallenge(c)}>{c.label}</button></li>{/each}{/if}</ul>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Restrictions -->
					{#if hasRestrictions}
						<div class="rb-group">
							<label class="rb-label">{m.game_rb_restrictions_label()}</label>
							<div class="ta">
								<input type="text" class="rb-field" placeholder={m.game_rb_restrictions_placeholder()} autocomplete="off" bind:value={restrictionSearch}
									onclick={() => restrictionOpen = !restrictionOpen} oninput={() => { if (!restrictionOpen) restrictionOpen = true; }}
									onblur={() => handleBlur(() => { restrictionOpen = false; restrictionSearch = ''; })} />
								{#if restrictionOpen}
									{@const matches = filterItems(game.restrictions_data || [], restrictionSearch, selectedRestrictions.map(r => r.slug))}
									<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.game_rb_no_matches()}</li>{:else}{#each matches as r}<li><button class="ta__opt" onmousedown={() => addRestriction(r)}>{r.label}{#if r.children?.length} <span class="ta__opt-hint">({m.game_rb_options({ count: String(r.children.length) })})</span>{/if}</button></li>{/each}{/if}</ul>
								{/if}
							</div>
							{#each selectedRestrictions.filter(r => r.children?.length) as parentR}
								<div class="rb-child-select">
									<label class="rb-label rb-label--child">{m.game_rb_pick_variation({ name: parentR.label })}</label>
									<select class="rb-field rb-field--child" value={restrictionChildSelections[parentR.slug]?.slug ?? ''} onchange={(e) => {
										const slug = e.currentTarget.value;
										if (!slug) { clearRestrictionChild(parentR.slug); return; }
										const child = parentR.children?.find((c: any) => c.slug === slug);
										if (child) selectRestrictionChild(parentR.slug, child);
									}}>
										<option value="">{m.game_rb_select_variation()}</option>
										{#each parentR.children as child}
											<option value={child.slug}>{child.label}</option>
										{/each}
									</select>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Glitches -->
					{#if hasGlitches}
						<div class="rb-group">
							<label class="rb-label">{m.game_rb_glitch_label()}</label>
							<div class="ta">
								<input type="text" class="rb-field" placeholder={m.game_rb_glitch_placeholder()} autocomplete="off" bind:value={glitchSearch}
									onclick={() => glitchOpen = !glitchOpen} oninput={() => { if (!glitchOpen) glitchOpen = true; }}
									onblur={() => handleBlur(() => { glitchOpen = false; if (selectedGlitch) glitchSearch = selectedGlitch.label; else glitchSearch = ''; })} />
								{#if selectedGlitch}<button class="ta__clear" onclick={clearGlitchItem}>✕</button>{/if}
								{#if glitchOpen}
									{@const matches = filterItems(game.glitches_data || [], glitchSearch)}
									<ul class="ta__list">{#if matches.length === 0}<li class="ta__empty">{m.game_rb_no_matches()}</li>{:else}{#each matches as g}<li><button class="ta__opt" class:ta__opt--active={selectedGlitch?.slug === g.slug} onmousedown={() => selectGlitchItem(g)}>{g.label}</button></li>{/each}{/if}</ul>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Chips + Reset -->
				{#if hasSelections}
					<div class="rb-chips-row">
						<div class="rb-chips">
							{#if selectedCategory}<button class="chip chip--cat" onclick={clearCategory}>{selectedCategory.label} ✕</button>{/if}
							{#if selectedCharacter}<button class="chip" onclick={clearChar}>{selectedCharacter.label} ✕</button>{/if}
							{#if selectedDifficulty}<button class="chip" onclick={clearDiff}>{selectedDifficulty.label} ✕</button>{/if}
							{#each selectedChallenges as c}<button class="chip" onclick={() => removeChallenge(c.slug)}>{c.label} ✕</button>{/each}
							{#each selectedRestrictions as r}<button class="chip chip--restriction" onclick={() => removeRestriction(r.slug)}>{r.label}{#if restrictionChildSelections[r.slug]} › {restrictionChildSelections[r.slug].label}{/if} ✕</button>{/each}
							{#if selectedGlitch}<button class="chip chip--glitch" onclick={clearGlitchItem}>{selectedGlitch.label} ✕</button>{/if}
						</div>
						<button class="btn btn--small btn--outline" onclick={resetAll}>{m.game_rb_remove_all()}</button>
					</div>
				{/if}

				<!-- Rules Summary Panel -->
				{#if hasSelections}
					<div class="rb-summary">
						<h3>{m.game_rb_your_ruleset()}</h3>
						{#if selectedCategory}
							<div class="rb-rule">
								<strong>{m.game_rb_category()}</strong> {selectedCategory.label}
								{#if selectedCategory.description}<div class="rb-rule__desc">{@html renderMarkdown(selectedCategory.description)}</div>{/if}
								{#if selectedCategory.exceptions}<div class="rb-rule__exceptions">{@html renderMarkdown(selectedCategory.exceptions)}</div>{/if}
							</div>
						{/if}
						{#if selectedCharacter}
							<div class="rb-rule">
								<strong>{characterLabel}:</strong> {selectedCharacter.label}
								{#if selectedCharacter.description}<div class="rb-rule__desc">{@html renderMarkdown(selectedCharacter.description)}</div>{/if}
							</div>
						{/if}
						{#if selectedDifficulty}
							<div class="rb-rule">
								<strong>{difficultyLabel}:</strong> {selectedDifficulty.label}
							</div>
						{/if}
						{#each selectedChallenges as ch}
							{@const chDesc = challengeDescription(ch)}
							<div class="rb-rule">
								<strong>{m.game_rb_challenge()}</strong> {ch.label}
								{#if chDesc}<div class="rb-rule__desc">{@html renderMarkdown(chDesc)}</div>{/if}
								{#if ch.exceptions}<div class="rb-rule__exceptions">{@html renderMarkdown(ch.exceptions)}</div>{/if}
							</div>
						{/each}
						{#each selectedRestrictions as r}
							<div class="rb-rule">
								<strong>{m.game_rb_restriction()}</strong> {r.label}{#if restrictionChildSelections[r.slug]} › {restrictionChildSelections[r.slug].label}{/if}
								{#if restrictionChildSelections[r.slug]?.description}<div class="rb-rule__desc">{@html renderMarkdown(restrictionChildSelections[r.slug].description)}</div>
								{:else if r.description}<div class="rb-rule__desc">{@html renderMarkdown(r.description)}</div>{/if}
								{#if restrictionChildSelections[r.slug]?.exceptions}<div class="rb-rule__exceptions">{@html renderMarkdown(restrictionChildSelections[r.slug].exceptions)}</div>
								{:else if r.exceptions}<div class="rb-rule__exceptions">{@html renderMarkdown(r.exceptions)}</div>{/if}
							</div>
						{/each}
						{#if selectedGlitch}
							<div class="rb-rule">
								<strong>{m.game_rb_glitch_rules()}</strong> {selectedGlitch.label}
								{#if selectedGlitch.description}<div class="rb-rule__desc">{@html renderMarkdown(selectedGlitch.description)}</div>{/if}
								{#if selectedGlitch.exceptions}<div class="rb-rule__exceptions">{@html renderMarkdown(selectedGlitch.exceptions)}</div>{/if}
							</div>
						{/if}

						{#if findRunnersUrl}
							<div class="rb-actions">
								<button class="btn btn--outline" onclick={exportRuleset}>{m.game_rb_export()}</button>
								<a href={findRunnersUrl} class="btn btn--primary">{m.game_rb_see_runners()}</a>
							</div>
						{:else}
							<div class="rb-actions">
								<button class="btn btn--outline" onclick={exportRuleset}>{m.game_rb_export()}</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<!-- ═══ Static Rules Reference (Accordions) ═══ -->
{#if game.general_rules}
	<details class="rules-accordion" open>
		<summary class="rules-accordion__header">
			<h2 class="rules-accordion__title">{m.game_rules_general()}</h2>
			<span class="rules-accordion__chevron">▼</span>
		</summary>
		<div class="rules-accordion__body">
			<div class="card">{@html renderMarkdown(game.general_rules)}</div>
		</div>
	</details>
{/if}

{#if game.challenges_data?.length}
	<details class="rules-accordion">
		<summary class="rules-accordion__header">
			<h2 class="rules-accordion__title">{m.game_rules_challenge_types()}</h2>
			<span class="rules-accordion__count">{game.challenges_data.length}</span>
			<span class="rules-accordion__chevron">▼</span>
		</summary>
		<div class="rules-accordion__body">
			{#each game.challenges_data as challenge}
				{@const desc = challengeDescription(challenge)}
				<div class="card rule-card">
					<h3>{challenge.label}</h3>
					{#if desc}{@html renderMarkdown(desc)}{/if}
					{#if challenge.exceptions}<div class="rule-exceptions"><span class="rule-exceptions__label">{m.game_rules_exceptions()}</span><div class="rule-exceptions__body">{@html renderMarkdown(challenge.exceptions)}</div></div>{/if}
				</div>
			{/each}
		</div>
	</details>
{/if}

{#if game.restrictions_data?.length}
	<details class="rules-accordion">
		<summary class="rules-accordion__header">
			<h2 class="rules-accordion__title">{m.game_rules_restrictions()}</h2>
			<span class="rules-accordion__count">{game.restrictions_data.length}</span>
			<span class="rules-accordion__chevron">▼</span>
		</summary>
		<div class="rules-accordion__body">
			{#each game.restrictions_data as restriction}
				<div class="card rule-card">
					{#if restriction.children?.length}
						<h3>{restriction.label}</h3>
						{#if restriction.description}{@html renderMarkdown(restriction.description)}{/if}
						{#if restriction.exceptions}<div class="rule-exceptions"><span class="rule-exceptions__label">{m.game_rules_exceptions()}</span><div class="rule-exceptions__body">{@html renderMarkdown(restriction.exceptions)}</div></div>{/if}
						<details class="rule-parent">
							<summary class="rule-parent__header">
								<span class="rule-parent__toggle">{restriction.children.length === 1 ? m.game_rules_variations({ count: String(restriction.children.length) }).split(' | ')[0] : m.game_rules_variations({ count: String(restriction.children.length) }).split(' | ')[1]}</span>
								<span class="rule-parent__chevron">▼</span>
							</summary>
							<div class="rule-parent__body">
								<div class="rule-children">
									<span class="rule-children__mode">{restriction.child_select === 'multi' ? m.game_rules_select_any() : m.game_rules_select_one()}</span>
									{#each restriction.children as child, ci}
										{#if ci > 0}<div class="rule-child__separator"></div>{/if}
										<details class="rule-child-accordion">
											<summary class="rule-child-accordion__header">
												<span class="rule-child-accordion__chevron">▶</span>
												<span class="rule-child-accordion__label">└ {child.label}</span>
											</summary>
											<div class="rule-child-accordion__body">
												{#if child.description}{@html renderMarkdown(child.description)}{/if}
												{#if child.exceptions}<div class="rule-exceptions"><span class="rule-exceptions__label">{m.game_rules_exceptions()}</span><div class="rule-exceptions__body">{@html renderMarkdown(child.exceptions)}</div></div>{/if}
											</div>
										</details>
									{/each}
								</div>
							</div>
						</details>
					{:else}
						<h3>{restriction.label}</h3>
						{#if restriction.description}{@html renderMarkdown(restriction.description)}{/if}
						{#if restriction.exceptions}<div class="rule-exceptions"><span class="rule-exceptions__label">{m.game_rules_exceptions()}</span><div class="rule-exceptions__body">{@html renderMarkdown(restriction.exceptions)}</div></div>{/if}
					{/if}
				</div>
			{/each}
		</div>
	</details>
{/if}

{#if game.glitches_data?.length || game.nmg_rules || game.glitch_doc_links}
	<details class="rules-accordion">
		<summary class="rules-accordion__header">
			<h2 class="rules-accordion__title">{m.game_rules_glitch_categories()}</h2>
			{#if game.glitches_data?.length}<span class="rules-accordion__count">{game.glitches_data.length}</span>{/if}
			<span class="rules-accordion__chevron">▼</span>
		</summary>
		<div class="rules-accordion__body">
			{#if game.glitches_data?.length}
				{#each game.glitches_data as glitch}
					<div class="card rule-card">
						<h3>{glitch.label}</h3>
						{#if glitch.description}{@html renderMarkdown(glitch.description)}{/if}
						{#if glitch.exceptions}<div class="rule-exceptions"><span class="rule-exceptions__label">{m.game_rules_exceptions()}</span><div class="rule-exceptions__body">{@html renderMarkdown(glitch.exceptions)}</div></div>{/if}
					</div>
				{/each}
			{/if}

			{#if game.nmg_rules}
				<div class="card rule-card rule-card--nmg">
					<h3>{m.game_rules_nmg()}</h3>
					{@html renderMarkdown(game.nmg_rules)}
				</div>
			{/if}

			{#if game.glitch_doc_links}
				<div class="card rule-card rule-card--docs">
					<h3>{m.game_rules_glitch_docs()}</h3>
					{@html renderMarkdown(game.glitch_doc_links)}
				</div>
			{/if}
		</div>
	</details>
{/if}

<style>
	h1 { margin-bottom: 0; }
	.mb-4 { margin-bottom: 1.5rem; }
	h2 { margin-bottom: 0.75rem; }
	.rule-card { margin-bottom: 0.75rem; }
	.rule-card h3 { margin: 0 0 0.5rem; color: var(--accent); }
	.rule-card--nmg { border-left: 3px solid #f59e0b; }
	.rule-card--nmg h3 { color: #f59e0b; }
	.rule-card--docs { border-left: 3px solid var(--accent); }

	/* Parent accordion (restrictions with children) */
	.rule-parent { margin-top: 0.75rem; border-top: 1px dashed var(--border); padding-top: 0.75rem; }
	.rule-parent__header { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; list-style: none; user-select: none; padding: 0; }
	.rule-parent__header::-webkit-details-marker { display: none; }
	.rule-parent__header::marker { display: none; content: ''; }
	.rule-parent__toggle { font-size: 0.8rem; font-weight: 600; color: var(--accent); }
	.rule-parent__chevron { font-size: 0.65rem; color: var(--muted); transition: transform 0.2s; }
	.rule-parent[open] > .rule-parent__header .rule-parent__chevron { transform: rotate(180deg); }
	.rule-parent__body { margin-top: 0.5rem; }

	/* Child rules */
	.rule-children { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border); }
	.rule-children__mode { display: block; font-size: 0.8rem; color: var(--muted); font-style: italic; margin-bottom: 0.5rem; }

	/* Child accordion */
	.rule-child-accordion { margin-left: 1rem; }
	.rule-child-accordion__header { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; list-style: none; user-select: none; padding: 0.3rem 0; }
	.rule-child-accordion__header::-webkit-details-marker { display: none; }
	.rule-child-accordion__header::marker { display: none; content: ''; }
	.rule-child-accordion__chevron { font-size: 0.55rem; color: var(--muted); transition: transform 0.2s; flex-shrink: 0; }
	.rule-child-accordion[open] > .rule-child-accordion__header .rule-child-accordion__chevron { transform: rotate(90deg); }
	.rule-child-accordion__label { font-size: 0.95rem; font-weight: 600; color: var(--accent); }
	.rule-child-accordion__body { padding: 0.25rem 0 0.25rem 1.35rem; }

	/* Separator between children */
	.rule-child__separator { height: 1px; background: var(--border); margin: 0.25rem 1rem; opacity: 0.5; }

	/* Rule builder — child sub-select */
	.rb-child-select { margin-top: 0.5rem; }
	.rb-label--child { font-size: 0.75rem; color: var(--accent); margin-bottom: 0.2rem; }
	.rb-field--child { font-size: 0.85rem; padding: 0.4rem 0.6rem; }
	.ta__opt-hint { font-size: 0.75rem; color: var(--muted); }

	/* Exception / blockquote callouts inside rule content */
	.rule-card :global(blockquote),
	.card :global(blockquote) {
		margin: 0.75rem 0;
		padding: 0.6rem 0.85rem;
		border-left: 3px solid #f59e0b;
		background: rgba(245, 158, 11, 0.08);
		border-radius: 0 6px 6px 0;
		font-size: 0.9rem;
		color: var(--fg);
	}
	.rule-card :global(blockquote p),
	.card :global(blockquote p) { margin: 0.25rem 0; }
	.rule-card :global(blockquote strong),
	.card :global(blockquote strong) { color: #f59e0b; }

	/* Rule Builder */
	.rb-card { margin-bottom: 2rem; }
	.rb-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
	.rb-subtitle { font-size: 0.9rem; }
	.rb-content { margin-top: 1rem; }
	.rb-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
	.rb-group { position: relative; }
	.rb-label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.3rem; }
	.rb-field { width: 100%; padding: 0.5rem 0.75rem; padding-right: 2rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; font-family: inherit; }
	.rb-field:focus { outline: none; border-color: var(--accent); }
	.rb-field::placeholder { color: var(--text-muted); }

	/* Toggle button */
	.btn--filter-toggle { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.85rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--muted); cursor: pointer; font-size: 0.85rem; font-family: inherit; }
	.btn--filter-toggle:hover { border-color: var(--accent); color: var(--fg); }
	.btn--filter-toggle.is-active { border-color: var(--accent); color: var(--accent); }
	.filter-toggle__icon { font-size: 0.7rem; }
	.rb-pulse { animation: rb-glow 2s ease-in-out infinite; }
	@keyframes rb-glow {
		0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent); }
		50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent); }
	}

	/* Typeahead */
	.ta { position: relative; }
	.ta__clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.8rem; padding: 2px 5px; border-radius: 3px; }
	.ta__clear:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
	.ta__list { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; max-height: 200px; overflow-y: auto; list-style: none; margin: 4px 0 0; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
	.ta__opt { display: block; width: 100%; text-align: left; padding: 0.4rem 0.6rem; background: none; border: none; color: var(--fg); cursor: pointer; font-size: 0.85rem; border-radius: 4px; font-family: inherit; }
	.ta__opt:hover { background: var(--bg); }
	.ta__opt--active { color: var(--accent); font-weight: 600; }
	.ta__empty { padding: 0.5rem 0.6rem; color: var(--muted); font-size: 0.8rem; }

	/* Chips */
	.rb-chips-row { display: flex; align-items: center; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); flex-wrap: wrap; }
	.rb-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; flex: 1; }
	.chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.6rem; border-radius: 20px; font-size: 0.8rem; background: rgba(99, 102, 241, 0.15); color: #818cf8; border: none; cursor: pointer; font-family: inherit; }
	.chip:hover { background: rgba(99, 102, 241, 0.25); }
	.chip--cat { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
	.chip--cat:hover { background: rgba(139, 92, 246, 0.25); }
	.chip--restriction { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.chip--restriction:hover { background: rgba(245, 158, 11, 0.25); }
	.chip--glitch { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.chip--glitch:hover { background: rgba(16, 185, 129, 0.25); }
	.btn--small { padding: 0.3rem 0.6rem; font-size: 0.8rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); text-decoration: none; font-family: inherit; }
	.btn:hover { border-color: var(--accent); }

	/* Summary panel */
	.rb-summary { margin-top: 1rem; padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
	.rb-summary h3 { margin: 0 0 0.75rem; font-size: 1rem; }
	.rb-rule { margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px dashed var(--border); }
	.rb-rule:last-of-type { border-bottom: none; margin-bottom: 0.5rem; padding-bottom: 0; }
	.rb-rule strong { color: var(--accent); }
	.rb-rule__desc { margin-top: 0.3rem; font-size: 0.9rem; color: var(--fg); opacity: 0.85; }
	.rb-rule__desc :global(p) { margin: 0.3rem 0; }
	.rb-rule__desc :global(blockquote) { margin: 0.5rem 0; padding: 0.5rem 0.75rem; border-left: 3px solid #f59e0b; background: rgba(245, 158, 11, 0.08); border-radius: 0 6px 6px 0; font-size: 0.85rem; }
	.rb-rule__desc :global(blockquote p) { margin: 0.2rem 0; }
	.rb-rule__desc :global(blockquote strong) { color: #f59e0b; }
	.rb-rule__exceptions { margin-top: 0.35rem; padding: 0.5rem 0.75rem; border-left: 3px solid #f59e0b; background: rgba(245, 158, 11, 0.08); border-radius: 0 6px 6px 0; font-size: 0.85rem; }
	.rb-rule__exceptions :global(p) { margin: 0.2rem 0; }
	.rb-rule__exceptions::before { content: '{m.game_rules_exceptions()}'; display: block; font-weight: 700; font-size: 0.8rem; color: #f59e0b; margin-bottom: 0.25rem; }
	.rb-actions { margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
	.btn--outline { background: none; border-color: var(--border); }
	.btn--outline:hover { border-color: var(--accent); color: var(--accent); }

	/* Rules Accordions */
	.rules-accordion { margin-bottom: 1rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; }
	.rules-accordion__header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; cursor: pointer; list-style: none; user-select: none; }
	.rules-accordion__header::-webkit-details-marker { display: none; }
	.rules-accordion__header::marker { display: none; content: ''; }
	.rules-accordion__title { margin: 0; font-size: 1.05rem; flex: 1; }
	.rules-accordion__count { font-size: 0.75rem; font-weight: 600; background: var(--bg); border: 1px solid var(--border); padding: 0.15rem 0.5rem; border-radius: 10px; color: var(--muted); }
	.rules-accordion__chevron { font-size: 0.7rem; color: var(--muted); transition: transform 0.2s; }
	.rules-accordion[open] > .rules-accordion__header .rules-accordion__chevron { transform: rotate(180deg); }
	.rules-accordion__body { padding: 0 1rem 1rem; }

	@media (max-width: 768px) { .rb-groups { grid-template-columns: 1fr; } }
</style>
