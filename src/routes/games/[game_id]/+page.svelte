<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { formatDate } from '$lib/utils';
	import { session } from '$stores/auth';
	import { supabase } from '$lib/supabase';
	import { checkBannedTerms } from '$lib/utils/banned-terms';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

	let { data } = $props();
	const game = $derived(data.game);
	const achievements = $derived(data.achievements);
	const runnerMap = $derived(data.runnerMap);
	const runCountByCategory = $derived(data.runCountByCategory);
	const totalRunCount = $derived(data.totalRunCount);

	// General rules: game-specific or default fallback
	const generalRules = $derived(
		game.general_rules || data.defaultGeneralRules || null
	);
	const isDefaultRules = $derived(!game.general_rules && !!data.defaultGeneralRules);

	// Description: detect placeholder/empty
	const hasDescription = $derived(
		game.content &&
		game.content.trim() !== '' &&
		!game.content.includes('Game submitted via form') &&
		!game.content.includes('Awaiting review')
	);

	// Achievement completions grouped by slug
	const achievementCompletions = $derived(() => {
		const map: Record<string, { completed: typeof achievements; inProgress: typeof achievements }> = {};
		for (const def of game.community_achievements || []) {
			const completed = achievements.filter(
				(a) => a.achievement_slug === def.slug && a.date_completed
			);
			const inProgress = achievements.filter(
				(a) => a.achievement_slug === def.slug && !a.date_completed
			);
			map[def.slug] = { completed, inProgress };
		}
		return map;
	});

	// Suggest Update form state
	let suggestSection = $state('');
	let suggestType = $state('');
	let suggestDetails = $state('');
	let suggestSubmitting = $state(false);
	let suggestError = $state('');
	let suggestSuccess = $state(false);

	// Image upload state
	let suggestImages = $state<File[]>([]);
	let imagePreviewUrls = $state<string[]>([]);
	const MAX_IMAGES = 5;
	const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
	const ALLOWED_TYPES = ['image/png', 'image/jpg', 'image/jpeg'];

	// Banned terms validation
	const suggestBannedWarning = $derived(checkBannedTerms(suggestDetails));

	function handleImageSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;

		const newFiles = Array.from(input.files);
		let errorMsg = '';

		for (const file of newFiles) {
			if (suggestImages.length >= MAX_IMAGES) {
				errorMsg = `Maximum ${MAX_IMAGES} images allowed.`;
				break;
			}
			if (!ALLOWED_TYPES.includes(file.type)) {
				errorMsg = `${file.name}: Only PNG and JPG files are allowed.`;
				continue;
			}
			if (file.size > MAX_FILE_SIZE) {
				errorMsg = `${file.name}: File exceeds 2MB limit.`;
				continue;
			}
			suggestImages = [...suggestImages, file];
			imagePreviewUrls = [...imagePreviewUrls, URL.createObjectURL(file)];
		}

		if (errorMsg) suggestError = errorMsg;
		input.value = ''; // Reset input so same file can be re-selected
	}

	function removeImage(index: number) {
		URL.revokeObjectURL(imagePreviewUrls[index]);
		suggestImages = suggestImages.filter((_, i) => i !== index);
		imagePreviewUrls = imagePreviewUrls.filter((_, i) => i !== index);
	}

	async function submitSuggestion(e: Event) {
		e.preventDefault();
		if (suggestBannedWarning) {
			suggestError = suggestBannedWarning;
			return;
		}
		suggestSubmitting = true;
		suggestError = '';

		try {
			const { data: userData } = await supabase.auth.getUser();
			if (!userData?.user) throw new Error('Not signed in');

			// Upload images to Supabase Storage
			const uploadedUrls: string[] = [];
			if (suggestImages.length > 0) {
				const token = (await supabase.auth.getSession()).data.session?.access_token;
				if (!token) throw new Error('Not authenticated');

				for (const file of suggestImages) {
					const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
					const path = `${userData.user.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

					const uploadRes = await fetch(
						`${PUBLIC_SUPABASE_URL}/storage/v1/object/user_game_update_images/${path}`,
						{
							method: 'POST',
							headers: {
								'Authorization': `Bearer ${token}`,
								'apikey': PUBLIC_SUPABASE_ANON_KEY,
								'Content-Type': file.type,
							},
							body: file,
						}
					);

					if (!uploadRes.ok) {
						const err = await uploadRes.json().catch(() => ({}));
						throw new Error(err.message || `Image upload failed (${uploadRes.status})`);
					}

					uploadedUrls.push(`${PUBLIC_SUPABASE_URL}/storage/v1/object/public/user_game_update_images/${path}`);
				}
			}

			const insertData: Record<string, any> = {
				game_id: game.game_id,
				game_name: game.game_name,
				user_id: userData.user.id,
				section: suggestSection,
				update_type: suggestType,
				details: suggestDetails.trim(),
				status: 'pending',
				page_url: `/games/${game.game_id}`
			};
			if (uploadedUrls.length > 0) insertData.image_urls = uploadedUrls;

			const { error } = await supabase.from('game_update_requests').insert(insertData);

			if (error) throw error;
			suggestSuccess = true;
		} catch (err: any) {
			suggestError = err.message || 'Failed to submit. Please try again.';
		} finally {
			suggestSubmitting = false;
		}
	}

	function resetSuggestionForm() {
		suggestSection = '';
		suggestType = '';
		suggestDetails = '';
		suggestSuccess = false;
		suggestError = '';
		imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
		suggestImages = [];
		imagePreviewUrls = [];
	}
</script>

<!-- 1. Modded/Base Game Links -->
{#if game.is_modded && data.baseGame}
	<div class="game-link-banner game-link-banner--base">
		<span class="game-link-banner__icon">🎮</span>
		<span class="game-link-banner__text">This is a <strong>modded version</strong>. Looking for the vanilla game?</span>
		<a href="/games/{data.baseGame.game_id}" class="btn btn--small">View {data.baseGame.game_name}</a>
	</div>
{/if}

{#if data.moddedVersions.length > 0}
	<div class="game-link-banner game-link-banner--modded">
		<span class="game-link-banner__icon">🔧</span>
		<span class="game-link-banner__text"><strong>Modded versions available!</strong> Run with custom content.</span>
		<div class="game-link-banner__links">
			{#each data.moddedVersions as mod}
				<a href="/games/{mod.game_id}" class="btn btn--small btn--outline">{mod.game_name}</a>
			{/each}
		</div>
	</div>
{/if}

<!-- 2. Game Description -->
<section>
	{#if hasDescription}
		<div class="card">
			{@html renderMarkdown(game.content ?? '')}
		</div>
	{:else}
		<div class="card">
			<p class="muted"><em>📝 Game description needed. Want to help? <a href="/games/{game.game_id}/resources">Visit the Resources tab</a> to learn how to contribute.</em></p>
		</div>
	{/if}
</section>

<!-- Quick Stats Bar -->
<section class="quick-stats">
	<div class="stat-pill">
		<span class="stat-pill__value">{totalRunCount}</span>
		<span class="stat-pill__label">Run{totalRunCount !== 1 ? 's' : ''}</span>
	</div>
	<div class="stat-pill">
		<span class="stat-pill__value">{data.categories.length}</span>
		<span class="stat-pill__label">Categor{data.categories.length !== 1 ? 'ies' : 'y'}</span>
	</div>
	{#if game.community_achievements?.length}
		<div class="stat-pill">
			<span class="stat-pill__value">{game.community_achievements.length}</span>
			<span class="stat-pill__label">Achievement{game.community_achievements.length !== 1 ? 's' : ''}</span>
		</div>
	{/if}
	<a href="/games/{game.game_id}/submit" class="btn btn--accent">Submit a Run</a>
</section>

<!-- 3. General Rules (Accordion) -->
<div class="card card--compact">
	<details class="rules-accordion" open>
		<summary class="rules-accordion__header">
			<h2 class="rules-accordion__title">📋 General Rules</h2>
			<span class="accordion-icon">▼</span>
		</summary>
		<div class="rules-accordion__content">
			{#if generalRules}
				<p class="muted mb-2">{isDefaultRules ? 'Core rules that apply to all runs:' : `Core rules that apply to all ${game.game_name} runs:`}</p>
				<div class="md">
					{@html renderMarkdown(generalRules)}
				</div>
			{:else}
				<ul>
					<li><strong>Timing Method:</strong> {game.timing_method || 'RTA (Real Time Attack)'}</li>
					<li><strong>Video Required:</strong> All submissions must include video proof</li>
					<li><strong>No Cheats/Mods:</strong> External tools or gameplay-altering mods are not allowed</li>
				</ul>
			{/if}
			<p class="muted mt-2" style="font-size: 0.85rem;">
				<em>For detailed category rules, challenges, restrictions, and glitch policies, see the <a href="/games/{game.game_id}/rules">Rules tab</a>.</em>
			</p>
		</div>
	</details>
</div>

<!-- 4. Community Achievements -->
{#if game.community_achievements?.length}
	{@const completionMap = achievementCompletions()}
	<div class="card card--compact mt-section">
		<h2 class="mb-2">🏆 Community Achievements</h2>
		<p class="muted mb-3">Community-defined challenges tracked for this game.</p>

		<div class="achievements-list">
			{#each game.community_achievements as ach}
				{@const comp = completionMap[ach.slug] || { completed: [], inProgress: [] }}
				{@const completedCount = comp.completed.length}
				{@const inProgressCount = comp.inProgress.length}

				<details class="achievement-item">
					<summary class="achievement-header">
						<div class="achievement-header__left">
							<span class="achievement-icon">{ach.icon || '🏆'}</span>
							<div class="achievement-info">
								<h3>{ach.title}</h3>
								<p class="muted">{ach.description}</p>
							</div>
						</div>
						<div class="achievement-header__right">
							{#if ach.difficulty}
								<span class="difficulty difficulty--{ach.difficulty}">{ach.difficulty}</span>
							{/if}
							<span class="achievement-stat">
								<span class="achievement-stat__completed">{completedCount} completed</span>
								{#if inProgressCount > 0}
									<span class="achievement-stat__progress">{inProgressCount} in progress</span>
								{/if}
							</span>
							<span class="accordion-icon">▼</span>
						</div>
					</summary>

					<div class="achievement-content">
						{#if ach.requirements?.length}
							<div class="achievement-requirements">
								<h4>Requirements</h4>
								<ul>
									{#each ach.requirements as req}
										<li>{req}</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if completedCount > 0 || inProgressCount > 0}
							<div class="achievement-runners">
								<h4>Runner Progress</h4>
								{#each comp.completed.sort((a, b) => String(a.date_completed).localeCompare(String(b.date_completed))) as c}
									{@const runner = runnerMap[c.runner_id]}
									<div class="runner-row runner-row--completed">
										<a href="/runners/{c.runner_id}" class="runner-row__info">
											{#if runner?.avatar}
												<div class="runner-row__avatar" style="background-image: url('{runner.avatar}')"></div>
											{:else}
												<div class="runner-row__avatar runner-row__avatar--default">👤</div>
											{/if}
											<span>{runner?.runner_name || c.runner_id}</span>
										</a>
										<div class="runner-row__progress">
											<div class="progress-bar progress-bar--full"><div class="progress-bar__fill" style="width: 100%"></div></div>
											<span class="progress-bar__text">{ach.total_required || '?'} / {ach.total_required || '?'}</span>
										</div>
										<div class="runner-row__status">
											<span class="status-badge status-badge--completed">✓ Completed</span>
											<span class="runner-row__date">{formatDate(c.date_completed)}</span>
										</div>
										{#if c.proof_url}
											<a href={c.proof_url} target="_blank" rel="noopener" class="btn btn--small">▶ Proof</a>
										{/if}
									</div>
								{/each}

								{#each comp.inProgress as c}
									{@const runner = runnerMap[c.runner_id]}
									{@const current = (c as any).current_progress || 0}
									{@const total = ach.total_required || 1}
									{@const percent = Math.round((current / total) * 100)}
									<div class="runner-row runner-row--progress">
										<a href="/runners/{c.runner_id}" class="runner-row__info">
											{#if runner?.avatar}
												<div class="runner-row__avatar" style="background-image: url('{runner.avatar}')"></div>
											{:else}
												<div class="runner-row__avatar runner-row__avatar--default">👤</div>
											{/if}
											<span>{runner?.runner_name || c.runner_id}</span>
										</a>
										<div class="runner-row__progress">
											<div class="progress-bar"><div class="progress-bar__fill" style="width: {percent}%"></div></div>
											<span class="progress-bar__text">{current} / {total}</span>
										</div>
										<div class="runner-row__status">
											<span class="status-badge status-badge--progress">In Progress</span>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="muted" style="padding: 0.5rem 0;">No runners tracking this achievement yet. Be the first!</p>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	</div>
{/if}

<!-- 5. Credits -->
{#if (game as any).credits?.length}
	<div class="card card--compact mt-section">
		<h2 class="mb-2">Credits</h2>
		<p class="muted mb-2">Contributors who helped establish this game's challenge run definitions:</p>
		<ul class="credits-list">
			{#each (game as any).credits as credit}
				<li>
					{#if credit.runner_id}
						<a href="/runners/{credit.runner_id}">{credit.name}</a>
					{:else if credit.url}
						<a href={credit.url} target="_blank" rel="noopener">{credit.name}</a>
					{:else}
						{credit.name}
					{/if}
					{#if credit.role}
						<span class="muted"> — {credit.role}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{:else}
	<div class="card card--compact mt-section">
		<h2 class="mb-2">Credits</h2>
		<p class="muted">No credits listed yet.</p>
	</div>
{/if}

<!-- 6. Suggest an Update -->
<div class="card card--compact mt-section">
	<h2 class="mb-2">📝 Suggest an Update</h2>
	<p class="muted mb-3">Notice something incorrect or missing on this page? Let us know and we'll get it fixed.</p>

	{#if !$session}
		<p class="muted"><a href="/sign-in?redirect=/games/{game.game_id}">Sign in</a> to suggest an update to this page.</p>
	{:else if suggestSuccess}
		<div class="suggest-success">
			<span>✅</span>
			<div>
				<strong>Thanks for your suggestion!</strong>
				<p class="muted">A moderator will review it shortly.</p>
			</div>
		</div>
		<button type="button" class="btn btn--small mt-2" onclick={resetSuggestionForm}>Submit Another</button>
	{:else}
		<form class="suggest-form" onsubmit={submitSuggestion}>
			<div class="suggest-form__field">
				<label class="form-label" for="suggest-section">What area needs updating?</label>
				<select id="suggest-section" class="form-input" required bind:value={suggestSection}>
					<option value="">Select a section...</option>
					<option value="game-description">Game Description</option>
					<option value="full-runs">Full Runs / Categories</option>
					<option value="mini-challenges">Mini Challenges</option>
					<option value="rules">Rules or Definitions</option>
					<option value="achievements">Achievements</option>
					<option value="credits">Credits</option>
					<option value="other">Other</option>
				</select>
			</div>

			<div class="suggest-form__field">
				<label class="form-label" for="suggest-type">What kind of change?</label>
				<select id="suggest-type" class="form-input" required bind:value={suggestType}>
					<option value="">Select type...</option>
					<option value="incorrect">Something is incorrect</option>
					<option value="missing">Something is missing</option>
					<option value="outdated">Information is outdated</option>
					<option value="typo">Typo or formatting issue</option>
					<option value="suggestion">General suggestion</option>
				</select>
			</div>

			<div class="suggest-form__field">
				<label class="form-label" for="suggest-details">Describe the issue *</label>
				<textarea
					id="suggest-details"
					class="form-input"
					rows="4"
					maxlength="1000"
					required
					bind:value={suggestDetails}
					placeholder="Be as specific as possible. For example: 'The Hitless category incorrectly states you cannot take environmental damage, but the community consensus is...'"
				></textarea>
				<p class="form-help">{suggestDetails.length}/1000</p>
			</div>

			<!-- Image Upload -->
			<div class="suggest-form__field">
				<label class="form-label">Attach screenshots <span class="form-help-inline">(optional, max {MAX_IMAGES}, PNG/JPG, 2MB each)</span></label>
				{#if imagePreviewUrls.length > 0}
					<div class="suggest-previews">
						{#each imagePreviewUrls as url, i}
							<div class="suggest-preview">
								<img src={url} alt="Preview {i + 1}" />
								<button type="button" class="suggest-preview__remove" onclick={() => removeImage(i)} title="Remove">✕</button>
							</div>
						{/each}
					</div>
				{/if}
				{#if suggestImages.length < MAX_IMAGES}
					<label class="suggest-upload-btn">
						📎 {suggestImages.length > 0 ? 'Add more' : 'Choose images'}
						<input
							type="file"
							accept=".png,.jpg,.jpeg"
							multiple
							onchange={handleImageSelect}
							style="display:none"
						/>
					</label>
				{/if}
			</div>

			{#if suggestBannedWarning}
				<div class="suggest-message suggest-message--error">{suggestBannedWarning}</div>
			{/if}

			{#if suggestError}
				<div class="suggest-message suggest-message--error">{suggestError}</div>
			{/if}

			<button type="submit" class="btn btn--primary" disabled={suggestSubmitting || !!suggestBannedWarning}>
				{#if suggestSubmitting}
					<span class="spinner spinner--small"></span> Submitting...
				{:else}
					Submit Suggestion
				{/if}
			</button>
		</form>
	{/if}
</div>

<style>
	/* Layout */
	section { margin-bottom: 1.5rem; }
	h2 { margin-bottom: 0.75rem; }
	.mb-2 { margin-bottom: 0.75rem; }
	.mb-3 { margin-bottom: 1rem; }
	.mt-2 { margin-top: 0.75rem; }
	.mt-section { margin-top: 1.5rem; }

	/* Game Link Banners */
	.game-link-banner {
		display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
		border-radius: 8px; margin-bottom: 1.5rem; flex-wrap: wrap;
		background: var(--panel); border: 1px solid var(--border);
	}
	.game-link-banner__icon { font-size: 1.25rem; }
	.game-link-banner__links { display: flex; gap: 0.5rem; flex-wrap: wrap; }

	/* Quick Stats */
	.quick-stats {
		display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
		margin-bottom: 1.5rem; padding: 0.75rem 0;
	}
	.stat-pill {
		display: flex; align-items: baseline; gap: 0.35rem;
		padding: 0.4rem 0.75rem; background: var(--surface); border: 1px solid var(--border);
		border-radius: 20px; font-size: 0.85rem;
	}
	.stat-pill__value { font-weight: 700; color: var(--accent); }
	.stat-pill__label { color: var(--text-muted); }
	.btn--accent {
		margin-left: auto;
	}

	/* Rules Accordion */
	.rules-accordion { border: none; }
	.rules-accordion__header {
		display: flex; justify-content: space-between; align-items: center;
		cursor: pointer; list-style: none; padding: 0.25rem 0;
	}
	.rules-accordion__header::-webkit-details-marker { display: none; }
	.rules-accordion__title { margin: 0; font-size: 1.15rem; }
	.accordion-icon { transition: transform 0.2s; font-size: 0.75rem; color: var(--text-muted); }
	details[open] > .rules-accordion__header .accordion-icon,
	details[open] > .achievement-header .accordion-icon { transform: rotate(180deg); }
	.rules-accordion__content { padding-top: 0.75rem; }
	.rules-accordion__content ul { padding-left: 1.5rem; margin: 0; }
	.rules-accordion__content li { margin-bottom: 0.5rem; line-height: 1.5; }
	.rules-accordion__content a { color: var(--accent); text-decoration: none; }
	.rules-accordion__content a:hover { text-decoration: underline; }

	/* Achievements */
	.achievements-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.achievement-item { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	.achievement-header {
		display: flex; justify-content: space-between; align-items: center;
		padding: 0.75rem 1rem; cursor: pointer; list-style: none; gap: 1rem;
	}
	.achievement-header::-webkit-details-marker { display: none; }
	.achievement-header__left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
	.achievement-header__right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
	.achievement-icon { font-size: 1.5rem; }
	.achievement-info h3 { margin: 0; font-size: 0.95rem; }
	.achievement-info p { margin: 0.15rem 0 0; font-size: 0.8rem; }
	.achievement-stat { display: flex; flex-direction: column; align-items: flex-end; font-size: 0.8rem; }
	.achievement-stat__completed { color: var(--accent); font-weight: 600; }
	.achievement-stat__progress { color: var(--text-muted); }
	.achievement-content { padding: 0 1rem 1rem; border-top: 1px solid var(--border); }
	.achievement-requirements { margin-top: 0.75rem; }
	.achievement-requirements h4 { margin: 0 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
	.achievement-requirements ul { padding-left: 1.5rem; margin: 0; font-size: 0.9rem; }
	.achievement-requirements li { margin-bottom: 0.35rem; }
	.achievement-runners { margin-top: 1rem; }
	.achievement-runners h4 { margin: 0 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }

	/* Runner rows in achievements */
	.runner-row {
		display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0;
		border-bottom: 1px solid var(--border); flex-wrap: wrap;
	}
	.runner-row:last-child { border-bottom: none; }
	.runner-row__info { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; color: var(--fg); min-width: 120px; }
	.runner-row__info:hover { color: var(--accent); }
	.runner-row__avatar {
		width: 28px; height: 28px; border-radius: 50%; background-size: cover; background-position: center;
		flex-shrink: 0;
	}
	.runner-row__avatar--default {
		display: flex; align-items: center; justify-content: center;
		background: var(--surface); border: 1px solid var(--border); font-size: 0.75rem;
	}
	.runner-row__progress { flex: 1; min-width: 100px; display: flex; align-items: center; gap: 0.5rem; }
	.progress-bar {
		flex: 1; height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden;
		border: 1px solid var(--border);
	}
	.progress-bar__fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
	.progress-bar--full .progress-bar__fill { background: #10b981; }
	.progress-bar__text { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
	.runner-row__status { display: flex; flex-direction: column; align-items: flex-end; }
	.runner-row__date { font-size: 0.75rem; color: var(--text-muted); }
	.status-badge {
		padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600;
	}
	.status-badge--completed { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.status-badge--progress { background: rgba(99, 102, 241, 0.15); color: #818cf8; }

	/* Difficulty badges */
	.difficulty {
		padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize;
	}
	.difficulty--easy { background: rgba(16, 185, 129, 0.15); color: #10b981; }
	.difficulty--medium { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
	.difficulty--hard { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
	.difficulty--legendary { background: rgba(168, 85, 247, 0.15); color: #a855f7; }

	/* Credits */
	.credits-list { padding-left: 1.5rem; margin: 0; }
	.credits-list li { margin-bottom: 0.5rem; line-height: 1.5; }
	.credits-list a { color: var(--accent); text-decoration: none; }
	.credits-list a:hover { text-decoration: underline; }

	/* Suggest Update Form */
	.suggest-form { display: flex; flex-direction: column; gap: 0.75rem; }
	.suggest-form__field { display: flex; flex-direction: column; gap: 0.25rem; }
	.form-label { font-size: 0.85rem; font-weight: 600; }
	.form-input {
		font-size: 0.9rem; padding: 0.5rem 0.75rem; background: var(--bg);
		border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-family: inherit;
	}
	.form-input:focus { outline: none; border-color: var(--accent); }
	textarea.form-input { resize: vertical; min-height: 80px; }
	.form-help { font-size: 0.75rem; color: var(--text-muted); margin: 0.15rem 0 0; }
	.suggest-message { padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; }
	.suggest-message--error { background: rgba(231, 76, 60, 0.15); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3); }
	.suggest-success {
		display: flex; align-items: flex-start; gap: 0.75rem; padding: 1rem;
		background: rgba(46, 204, 113, 0.1); border: 1px solid rgba(46, 204, 113, 0.25); border-radius: 6px;
	}
	.suggest-success span:first-child { font-size: 1.5rem; }
	.suggest-success p { margin: 0.25rem 0 0; font-size: 0.85rem; }
	.suggest-previews { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.suggest-preview { position: relative; width: 80px; height: 80px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
	.suggest-preview img { width: 100%; height: 100%; object-fit: cover; }
	.suggest-preview__remove { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0,0,0,0.7); color: #fff; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }
	.suggest-preview__remove:hover { background: #ef4444; }
	.suggest-upload-btn { display: inline-block; padding: 0.4rem 0.75rem; border: 1px dashed var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text-muted); cursor: pointer; transition: border-color 0.15s, color 0.15s; }
	.suggest-upload-btn:hover { border-color: var(--accent); color: var(--fg); }
	.form-help-inline { font-size: 0.8rem; color: var(--text-muted); font-weight: normal; }
	.spinner--small { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; display: inline-block; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 0.25rem; }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Responsive */
	@media (max-width: 640px) {
		.achievement-header { flex-direction: column; align-items: flex-start; }
		.achievement-header__right { width: 100%; justify-content: flex-start; }
		.runner-row { font-size: 0.85rem; }
		.quick-stats { justify-content: flex-start; }
		.btn--accent { margin-left: 0; }
	}
</style>
