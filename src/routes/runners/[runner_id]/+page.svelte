<script lang="ts">
	import { formatDate, formatTime } from '$lib/utils';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { getCountry, codeToFlag } from '$lib/data/countries';

	/** Extract a thumbnail URL from a video URL (YouTube, Twitch clips) */
	function getVideoThumbnail(url: string): string | null {
		if (!url) return null;
		try {
			const u = new URL(url);
			// YouTube: youtube.com/watch?v=ID or youtu.be/ID
			if (u.hostname.includes('youtube.com')) {
				const id = u.searchParams.get('v');
				if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
			}
			if (u.hostname === 'youtu.be') {
				const id = u.pathname.slice(1);
				if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
			}
		} catch { /* invalid URL */ }
		return null;
	}
	import { page } from '$app/stores';

	let { data } = $props();
	const runner = $derived(data.runner);
	const socials = $derived(runner.socials || {});

	// Tab state
	let activeTab = $state<'overview' | 'runs' | 'achievements' | 'contributions' | 'activity'>('overview');

	// Game detail view within runs tab — auto-select from query param if present
	const initialGameId = $page.url.searchParams.get('game');
	let selectedGameId = $state<string | null>(initialGameId);
	const selectedGame = $derived(
		selectedGameId
			? data.gameGroups.find((g) => g.game.game_id === selectedGameId) || null
			: null
	);

	// Run type counts
	const fullRunCount = $derived(
		data.runs.filter((r) => {
			const game = data.allGames.find((g) => g.game_id === r.game_id);
			return game?.full_runs?.some((fr) => fr.slug === r.category_slug);
		}).length
	);
	const miniRunCount = $derived(data.runs.length - fullRunCount);

	// Split personal goals into completed vs in-progress
	const completedGoals = $derived(
		(runner.personal_goals || []).filter((g: any) => g.completed)
	);
	const inProgressGoals = $derived(
		(runner.personal_goals || []).filter((g: any) => !g.completed)
	);

	// Banner display options
	const bo = $derived(socials.banner_opts || {});
	const bMode = $derived(bo.mode || 'above');
	const bSize = $derived(bo.size === 'fill' ? '100% 100%' : bo.size === 'contain' ? 'contain' : 'cover');
	const bPos = $derived(bo.position === 'top' ? 'top' : bo.position === 'bottom' ? 'bottom' : 'center');
	const bOpacity = $derived(bo.opacity ?? 1);
	const bContainerOpacity = $derived(bo.container_opacity ?? 0.4);
	const bGradient = $derived(bo.gradient || '');
	const bBg = $derived(bGradient ? bGradient : (runner.banner ? `url('${runner.banner}')` : ''));

	// Profile header location/representing
	const repCode = $derived(socials.representing || '');
	const locCountry = $derived(runner.location ? getCountry(runner.location) : null);
	const repCountry = $derived(repCode ? getCountry(repCode) : null);
</script>

<svelte:head>
	<title>{runner.runner_name} | Challenge Run Community</title>
</svelte:head>

<div class="page-width runner-page">
	<p class="muted page-back"><a href="/runners">← Runners</a></p>

	<!-- Banner: opts derived in <script> as bo/bMode/bSize/bPos/bOpacity/bGradient/bBg -->
	{#if bBg && bMode !== 'background'}
		<div class="runner-banner">
			<div class="runner-banner__img" style="background:{bBg}; background-size:{bSize}; background-position:{bPos}; opacity:{bOpacity};"></div>
			<div class="runner-banner__fade"></div>
		</div>
	{:else if !bBg || bMode !== 'background'}
		{#if runner.accent_color}
			<div class="runner-banner">
				<div class="runner-banner__img" style="background-color: {runner.accent_color};"></div>
				<div class="runner-banner__fade"></div>
			</div>
		{/if}
	{/if}

	<!-- Profile Header -->
	<section class="runner-top" class:runner-top--bg-mode={bBg && bMode === 'background'} style="{runner.accent_color ? `--runner-accent: ${runner.accent_color};` : ''} --container-opacity: {bContainerOpacity};">
		{#if bBg && bMode === 'background'}
			<div class="runner-top__bg" style="background:{bBg}; background-size:{bSize}; background-position:{bPos}; opacity:{bOpacity};"></div>
		{/if}
		<div class="runner-left">
			<img
				class="runner-avatar"
				src={runner.avatar || '/img/site/default-runner.png'}
				alt={runner.runner_name}
			/>
			<div class="runner-name">
				<h1>
					{runner.runner_name}
					{#if runner.pronouns}<span class="runner-pronouns">({runner.pronouns})</span>{/if}
				</h1>
				{#if runner.location || repCountry}
					<p class="muted runner-location">
						{#if runner.location}
							{#if locCountry}
								<img class="flag-img" src="https://flagcdn.com/w40/{locCountry.code.toLowerCase()}.png" alt="{locCountry.name} flag" width="20" height="15" />
							{:else}
								📍
							{/if}
							{locCountry?.name || runner.location}
						{/if}
						{#if repCountry && repCountry.code !== locCountry?.code}
							<span class="runner-representing">
								{#if runner.location}·{/if} Ally of
								<img class="flag-img" src="https://flagcdn.com/w40/{repCountry.code.toLowerCase()}.png" alt="{repCountry.name} flag" width="20" height="15" />
								{repCountry.name}
							</span>
						{/if}
					</p>
				{/if}
				{#if runner.status}
					<p class="muted runner-status">{runner.status}</p>
				{/if}
				<div class="runner-meta-line">
					{#if runner.joined_date}
						<span class="runner-joined">🗓️ Member since {formatDate(runner.joined_date)}</span>
					{/if}
					{#if data.teams.length > 0}
						<span class="runner-team-badges">
							{#each data.teams as team}
								<a href="/teams/{team.team_id}" class="runner-team-badge">{team.name}</a>
							{/each}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Social Links -->
		{#if Object.values(socials).some(Boolean)}
			<div class="runner-socials">
				{#if socials.twitch}<a href={socials.twitch} target="_blank" rel="noopener" class="runner-link" title="Twitch"><span class="runner-link__icon">📺</span> Twitch</a>{/if}
				{#if socials.youtube}<a href={socials.youtube} target="_blank" rel="noopener" class="runner-link" title="YouTube"><span class="runner-link__icon">▶️</span> YouTube</a>{/if}
				{#if socials.discord}<span class="runner-link" title="Discord"><span class="runner-link__icon">💬</span> Discord: {socials.discord}</span>{/if}
				{#if socials.twitter}<a href={socials.twitter} target="_blank" rel="noopener" class="runner-link" title="X / Twitter"><span class="runner-link__icon">🐦</span> X</a>{/if}
				{#if socials.bluesky}<a href={socials.bluesky} target="_blank" rel="noopener" class="runner-link" title="Bluesky"><span class="runner-link__icon">🦋</span> Bluesky</a>{/if}
				{#if socials.instagram}<a href={socials.instagram} target="_blank" rel="noopener" class="runner-link" title="Instagram"><span class="runner-link__icon">📷</span> Instagram</a>{/if}
				{#if socials.speedruncom}<a href={socials.speedruncom} target="_blank" rel="noopener" class="runner-link" title="Speedrun.com"><span class="runner-link__icon">⏱️</span> Speedrun.com</a>{/if}
				{#if socials.steam}<a href={socials.steam} target="_blank" rel="noopener" class="runner-link" title="Steam"><span class="runner-link__icon">🎮</span> Steam</a>{/if}
				{#if Array.isArray(socials.other)}
					{#each socials.other as link}
						{#if link}<a href={link} target="_blank" rel="noopener" class="runner-link" title={link}><span class="runner-link__icon">🔗</span> {new URL(link).hostname.replace('www.', '')}</a>{/if}
					{/each}
				{/if}
			</div>
		{/if}
	</section>

	<!-- Tabs Navigation -->
	<nav class="runner-tabs">
		<button class="tab" class:active={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>Overview</button>
		<button class="tab" class:active={activeTab === 'runs'} onclick={() => activeTab = 'runs'}>Run Statistics</button>
		<button class="tab" class:active={activeTab === 'achievements'} onclick={() => activeTab = 'achievements'}>Achievements</button>
		<button class="tab" class:active={activeTab === 'contributions'} onclick={() => activeTab = 'contributions'}>Contributions</button>
		{#if !socials.hide_activity}
			<button class="tab" class:active={activeTab === 'activity'} onclick={() => activeTab = 'activity'}>Activity</button>
		{/if}
	</nav>

	<!-- OVERVIEW TAB -->
	{#if activeTab === 'overview'}
		<!-- Highlights: full-width horizontal row, then About full-width below -->
		{#if runner.featured_runs?.length}
			<section class="runner-highlights">
				<h2>📌 Highlights</h2>
				<div class="highlights-grid">
					{#each (runner.featured_runs as any[]) as fr}
						{#if fr.type === 'playlist'}
							<div class="highlight-card card-lift">
								{#if fr.cover_url}
									<div class="highlight-card__bg" style="background-image: url('{fr.cover_url}')"></div>
								{:else}
									{@const playlistThumb = getVideoThumbnail(fr.playlist_url)}
									{#if playlistThumb}
										<div class="highlight-card__bg" style="background-image: url('{playlistThumb}')"></div>
									{:else}
										<div class="highlight-card__playlist-bg"></div>
									{/if}
								{/if}
								<div class="highlight-card__overlay">
									<div class="highlight-card__game">🎬 Playlist</div>
									<div class="highlight-card__category">{fr.title || 'Untitled Playlist'}</div>
									{#if fr.description}<div class="highlight-card__note">{fr.description}</div>{/if}
									{#if fr.playlist_url}
										<a href={fr.playlist_url} target="_blank" rel="noopener" class="highlight-card__video">▶ View Playlist</a>
									{/if}
								</div>
							</div>
						{:else}
							{@const frGame = data.allGames.find(g => g.game_id === fr.game_id)}
							{@const thumb = fr.video_url ? getVideoThumbnail(fr.video_url) : null}
							<div class="highlight-card card-lift">
								{#if thumb}
									<div class="highlight-card__bg" style="background-image: url('{thumb}')"></div>
								{:else if frGame?.cover}
									<div class="highlight-card__bg" style="background-image: url('{frGame.cover}')"></div>
								{/if}
								<div class="highlight-card__overlay">
									<div class="highlight-card__game">{frGame?.game_name || fr.game_id}</div>
									<div class="highlight-card__category">{fr.category}</div>
									{#if fr.achievement}<div class="highlight-card__note">{fr.achievement}</div>{/if}
									{#if fr.video_url && fr.video_approved}
										<a href={fr.video_url} target="_blank" rel="noopener" class="highlight-card__video">▶ Watch</a>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}

		{#if runner.bio || runner.content}
			<section class="runner-bio card">
				<h2>About</h2>
				{#if runner.content}
					<div class="md">{@html renderMarkdown(runner.content)}</div>
				{:else}
					<p>{runner.bio}</p>
				{/if}
			</section>
		{/if}

		<!-- Contributions in Overview -->
		{#if runner.contributions?.length}
			<div class="card mt-section">
				<h2>🛠️ Community Contributions</h2>
				<div class="contributions-list">
					{#each runner.contributions as c}
						<div class="contribution-item">
							<div class="contribution-icon">{c.icon || '📄'}</div>
							<div class="contribution-info">
								<h4>{c.title}</h4>
								{#if c.description}<p class="muted">{c.description}</p>{/if}
								{#if c.url}<a href={c.url} target="_blank" class="contribution-link">View →</a>{/if}
							</div>
							<span class="contribution-type">{c.type || 'Resource'}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if inProgressGoals.length > 0}
			<div class="card mt-section">
				<h2>🎯 Goals In Progress</h2>
				<div class="personal-goals-list">
					{#each inProgressGoals as goal}
						<div class="personal-goal-item">
							<div class="personal-goal-item__icon">{goal.icon || '🎯'}</div>
							<div class="personal-goal-item__content">
								<div class="personal-goal-item__header">
									<h4>{goal.title}</h4>
									<span class="goal-status goal-status--progress">In Progress</span>
								</div>
								{#if goal.description}<p class="muted">{goal.description}</p>{/if}
								{#if goal.game}<span class="personal-goal-item__game">{goal.game}</span>{/if}
								{#if goal.total && goal.total > 0}
									{@const pct = Math.round(((goal.current || 0) / goal.total) * 100)}
									<div class="personal-goal-item__progress">
										<div class="progress-bar"><div class="progress-bar__fill" style="width: {pct}%"></div></div>
										<span class="progress-bar__text">{goal.current || 0} / {goal.total}</span>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if !runner.bio && !runner.content && !runner.featured_runs?.length && !runner.contributions?.length && inProgressGoals.length === 0}
			<div class="card"><p class="muted">No overview information yet.</p></div>
		{/if}
	{/if}

	<!-- RUNS TAB -->
	{#if activeTab === 'runs'}
		<!-- Stats Summary -->
		<div class="runner-stats-card">
			<div class="runner-stat">
				<span class="runner-stat__value">{data.gameGroups.length}</span>
				<span class="runner-stat__label">Game{data.gameGroups.length !== 1 ? 's' : ''}</span>
			</div>
			<div class="runner-stat">
				<span class="runner-stat__value">{fullRunCount}</span>
				<span class="runner-stat__label">Full Run{fullRunCount !== 1 ? 's' : ''}</span>
			</div>
			<div class="runner-stat">
				<span class="runner-stat__value">{miniRunCount}</span>
				<span class="runner-stat__label">Mini-Challenge{miniRunCount !== 1 ? 's' : ''}</span>
			</div>
			<div class="runner-stat runner-stat--total">
				<span class="runner-stat__value">{data.runs.length}</span>
				<span class="runner-stat__label">Total</span>
			</div>
		</div>

		<!-- Fun Stats -->
		{#if data.runs.length > 0}
			<div class="runner-fun-stats">
				{#if data.stats.mostPlayed}
					<div class="fun-stat">
						<span class="fun-stat__icon">🎮</span>
						<div class="fun-stat__content">
							<span class="fun-stat__label">Most Played</span>
							<a href="/games/{data.stats.mostPlayed.id}" class="fun-stat__value">{data.stats.mostPlayed.name}</a>
							<span class="fun-stat__detail">{data.stats.mostPlayed.count} run{data.stats.mostPlayed.count !== 1 ? 's' : ''}</span>
						</div>
					</div>
				{/if}
				<div class="fun-stat">
					<span class="fun-stat__icon">🏆</span>
					<div class="fun-stat__content">
						<span class="fun-stat__label">Games Completed</span>
						<span class="fun-stat__value">{data.gameGroups.length}</span>
					</div>
				</div>
				{#if data.stats.topGenres.length > 0}
					<div class="fun-stat">
						<span class="fun-stat__icon">🏷️</span>
						<div class="fun-stat__content">
							<span class="fun-stat__label">Top Genres</span>
							<span class="fun-stat__value fun-stat__genres">
								{#each data.stats.topGenres as genre}
									<span class="genre-pill">{genre.replace(/-/g, ' ')}</span>
								{/each}
							</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Games Grid / Detail View -->
		{#if selectedGame}
			<div class="card">
				<div class="runs-detail-header">
					<button class="btn btn--small btn--outline" onclick={() => selectedGameId = null}>← All Games</button>
					<div class="runs-detail-game">
						{#if selectedGame.game.cover}
							<div class="runs-detail-game__cover" style="background-image: url('{selectedGame.game.cover}')"></div>
						{/if}
						<div>
							<h2><a href="/games/{selectedGame.game.game_id}">{selectedGame.game.game_name}</a></h2>
							<p class="muted">{selectedGame.runs.length} run{selectedGame.runs.length !== 1 ? 's' : ''}</p>
						</div>
					</div>
				</div>
			</div>

			{@const byCategory: Record<string, any[]> = Object.groupBy
				? Object.groupBy(selectedGame.runs, (r: any) => r.category || r.category_slug) as Record<string, any[]>
				: selectedGame.runs.reduce((acc: Record<string, any[]>, r: any) => {
					const key = r.category || r.category_slug;
					(acc[key] ||= []).push(r);
					return acc;
				}, {} as Record<string, any[]>)
			}
			{#each Object.entries(byCategory) as [category, catRuns]}
				<div class="card runs-category">
					<h3 class="runs-category__title">{category}</h3>
					<div class="runs-list">
						{#each catRuns as run (run.id || run.video_url)}
							<article class="run-row">
								<div class="run-row__time">{formatTime(run.time_primary)}</div>
								<div class="run-row__info">
									<div class="run-row__meta">
										{#each run.standard_challenges || [] as ch}
											<span class="tag tag--small">{ch}</span>
										{/each}
										<span>{formatDate(run.date_completed)}</span>
										{#if run.verified}<span class="run-row__verified">✓ Verified</span>{/if}
									</div>
								</div>
								<div class="run-row__actions">
									{#if run.video_url}
										<a href={run.video_url} target="_blank" rel="noopener" class="btn btn--small">▶ Watch</a>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				</div>
			{/each}
		{:else if data.gameGroups.length > 0}
			<div class="runner-games-grid">
				{#each data.gameGroups as { game, runs }}
					{@const bestRun = runs.sort((a, b) => (a.time_primary || '').localeCompare(b.time_primary || ''))[0]}
					<button class="runner-game-card card-lift" onclick={() => selectedGameId = game.game_id}>
						{#if game.cover}
							<div class="runner-game-card__bg" style="background-image: url('{game.cover}')"></div>
						{/if}
						<div class="runner-game-card__overlay">
							<div class="runner-game-card__title">{game.game_name}</div>
							<div class="runner-game-card__stats">
								<span class="runner-game-card__count">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
								{#if bestRun?.time_primary}
									<span class="runner-game-card__best">Best: {bestRun.time_primary}</span>
								{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<div class="card"><p class="muted">No runs have been added yet.</p></div>
		{/if}
	{/if}

	<!-- ACHIEVEMENTS TAB -->
	{#if activeTab === 'achievements'}
		<div class="card">
			<h2>🏅 Community Achievements</h2>
			<p class="muted mb-2">Verified achievements from game communities.</p>

			{#if data.achievements.length > 0}
				<div class="community-achievements-list">
					{#each data.achievements as comp}
						{@const compGame = data.allGames.find(g => g.game_id === comp.game_id)}
						{@const compAch = compGame?.community_achievements?.find(ca => ca.slug === comp.achievement_slug)}
						<div class="community-achievement-item">
							<div class="community-achievement-item__icon">{compAch?.icon || '🏆'}</div>
							<div class="community-achievement-item__content">
								<div class="community-achievement-item__header">
									<h4>{compAch?.title || comp.achievement_slug}</h4>
									{#if compAch?.difficulty}
										<span class="difficulty difficulty--{compAch.difficulty}">{compAch.difficulty}</span>
									{/if}
								</div>
								{#if compAch?.description}<p class="muted">{compAch.description}</p>{/if}
								<div class="community-achievement-item__meta">
									{#if compGame}
										<a href="/games/{compGame.game_id}" class="community-achievement-item__game">{compGame.game_name}</a>
										<span class="muted">·</span>
									{/if}
									<span class="muted">{formatDate(comp.date_completed)}</span>
									<span class="muted">·</span>
									<span class="verified-text">✓ Verified</span>
								</div>
							</div>
							{#if comp.proof_url}
								<a href={comp.proof_url} target="_blank" rel="noopener" class="btn btn--small">▶ Proof</a>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="muted">No community achievements completed yet.</p>
			{/if}
		</div>

		<!-- Completed Personal Goals -->
		<div class="card mt-section">
			<h2>🎯 Completed Goals</h2>
			<p class="muted mb-2">Personal milestones achieved.</p>

			{#if completedGoals.length > 0}
				<div class="personal-goals-list">
					{#each completedGoals as goal}
						<div class="personal-goal-item">
							<div class="personal-goal-item__icon">{goal.icon || '🎯'}</div>
							<div class="personal-goal-item__content">
								<div class="personal-goal-item__header">
									<h4>{goal.title}</h4>
									<span class="goal-status goal-status--completed">✓ Completed</span>
								</div>
								{#if goal.description}<p class="muted">{goal.description}</p>{/if}
								{#if goal.game}<span class="personal-goal-item__game">{goal.game}</span>{/if}
								{#if goal.date_completed}<span class="muted personal-goal-item__date">Completed: {goal.date_completed}</span>{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="muted">No personal goals completed yet.</p>
			{/if}
		</div>
	{/if}

	<!-- CONTRIBUTIONS TAB -->
	{#if activeTab === 'contributions'}
		{@const creditedGames = data.allGames.filter(g =>
			(g as any).credits?.some((c: any) => c.runner_id === runner.runner_id)
		)}
		{@const modGames = data.moderatorGames.map(id => data.allGames.find(g => g.game_id === id)).filter((g): g is NonNullable<typeof g> => Boolean(g))}
		{@const verGames = data.verifierGames.map(id => data.allGames.find(g => g.game_id === id)).filter((g): g is NonNullable<typeof g> => Boolean(g))}
		{@const hasContributions = modGames.length > 0 || verGames.length > 0 || (runner.contributions?.length ?? 0) > 0 || creditedGames.length > 0}

		{#if modGames.length > 0}
			<div class="card mt-section">
				<h2>🔰 Moderates</h2>
				<p class="muted mb-2">Games this runner moderates.</p>
				<div class="runner-games-grid">
					{#each modGames as game}
						<a href="/games/{game.game_id}" class="runner-game-card card-lift">
							{#if game.cover}
								<div class="runner-game-card__bg" style="background-image: url('{game.cover}')"></div>
							{/if}
							<div class="runner-game-card__overlay">
								<div class="runner-game-card__title">{game.game_name}</div>
								<div class="runner-game-card__stats"><span class="runner-game-card__count">🔰 Moderator</span></div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if verGames.length > 0}
			<div class="card mt-section">
				<h2>✅ Verifies</h2>
				<p class="muted mb-2">Games this runner verifies runs for.</p>
				<div class="runner-games-grid">
					{#each verGames as game}
						<a href="/games/{game.game_id}" class="runner-game-card card-lift">
							{#if game.cover}
								<div class="runner-game-card__bg" style="background-image: url('{game.cover}')"></div>
							{/if}
							<div class="runner-game-card__overlay">
								<div class="runner-game-card__title">{game.game_name}</div>
								<div class="runner-game-card__stats"><span class="runner-game-card__count">✅ Verifier</span></div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if runner.contributions?.length}
			<div class="card mt-section">
				<h2>📄 Guides & Resources</h2>
				<div class="contributions-list">
					{#each runner.contributions as c}
						<div class="contribution-item">
							<div class="contribution-icon">{c.icon || '📄'}</div>
							<div class="contribution-info">
								<h4>{c.title}</h4>
								{#if c.description}<p class="muted">{c.description}</p>{/if}
								{#if c.url}<a href={c.url} target="_blank" class="contribution-link">View →</a>{/if}
							</div>
							<span class="contribution-type">{c.type || 'Resource'}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if creditedGames.length > 0}
			<div class="card mt-section">
				<h2>📋 Game Page Credits</h2>
				<p class="muted mb-2">Games this runner contributed to.</p>
				<div class="runner-games-grid">
					{#each creditedGames as cg}
						{@const credit = (cg as any).credits?.find((c: any) => c.runner_id === runner.runner_id)}
						<a href="/games/{cg.game_id}" class="runner-game-card card-lift">
							{#if cg.cover}
								<div class="runner-game-card__bg" style="background-image: url('{cg.cover}')"></div>
							{/if}
							<div class="runner-game-card__overlay">
								<div class="runner-game-card__title">{cg.game_name}</div>
								<div class="runner-game-card__stats"><span class="runner-game-card__count">{credit?.role || 'Contributor'}</span></div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if !hasContributions}
			<div class="card"><p class="muted">No contributions recorded yet.</p></div>
		{/if}
	{/if}

	<!-- ACTIVITY TAB -->
	{#if activeTab === 'activity' && !socials.hide_activity}
		<div class="card">
			<h2>📅 Activity Timeline</h2>
			<p class="muted mb-2">Recent challenge run activity.</p>
		</div>

		{#if data.timeline.length > 0}
			<div class="activity-timeline">
				{#each data.timeline as item}
					{@const game = data.allGames.find(g => g.game_id === item.gameId)}
					<div class="timeline-item">
						<div class="timeline-item__dot" class:timeline-item__dot--achievement={item.type === 'achievement'}></div>
						<div class="timeline-item__content">
							<div class="timeline-item__header">
								{#if item.type === 'run'}
									<span class="timeline-item__icon">🏃</span>
									<span>Completed <strong>{item.detail}</strong> in <a href="/games/{item.gameId}">{game?.game_name || item.gameId}</a></span>
									{#if item.extra}<span class="timeline-item__time">{item.extra}</span>{/if}
								{:else}
									<span class="timeline-item__icon">🏅</span>
									<span>Earned <strong>{item.detail.replace(/-/g, ' ')}</strong> in <a href="/games/{item.gameId}">{game?.game_name || item.gameId}</a></span>
								{/if}
							</div>
							<span class="timeline-item__date">{formatDate(item.date)}</span>
						</div>
					</div>
				{/each}
				{#if data.timeline.length >= 20}
					<p class="muted" style="text-align:center;padding:1rem 0;">Showing latest 20 events</p>
				{/if}
			</div>
		{:else}
			<div class="empty-state"><span class="empty-icon">📅</span><p>No activity recorded yet.</p></div>
		{/if}
	{/if}
</div>

<style>
	/* Layout */
	.page-back { margin: 1rem 0 0.5rem; }
	.page-back a { color: var(--text-muted); text-decoration: none; }
	.page-back a:hover { color: var(--fg); }
	.mb-2 { margin-bottom: 0.75rem; }
	.mt-section { margin-top: 1.5rem; }

	/* Banner */
	.runner-banner { position: relative; height: 180px; border-radius: 12px 12px 0 0; overflow: hidden; margin-bottom: 0; }
	.runner-banner__img { position: absolute; inset: 0; background-size: cover; background-position: center; }
	.runner-banner__fade { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 30%, var(--bg) 100%); }
	/* Card background mode — banner behind info box */
	.runner-top--bg-mode { position: relative; border-radius: 12px; overflow: hidden; padding: 1.25rem; border: 1px solid var(--border); }
	.runner-top__bg { position: absolute; inset: 0; z-index: 0; background-size: cover; background-position: center; }
	.runner-top--bg-mode .runner-left { position: relative; z-index: 1; background: rgba(0, 0, 0, var(--container-opacity, 0.4)); backdrop-filter: blur(8px); border-color: rgba(255, 255, 255, 0.1); }
	.runner-top--bg-mode .runner-socials { position: relative; z-index: 1; }
	.runner-top--bg-mode .runner-link { background: rgba(0, 0, 0, var(--container-opacity, 0.4)); backdrop-filter: blur(8px); border-color: rgba(255, 255, 255, 0.1); }
	.runner-top--bg-mode .runner-team-badge { background: rgba(0, 0, 0, var(--container-opacity, 0.4)); backdrop-filter: blur(8px); border-color: rgba(255, 255, 255, 0.1); }

	/* Profile Top */
	.runner-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
	.runner-left { display: flex; align-items: center; gap: 1.25rem; }
	.runner-avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--runner-accent, var(--accent)); flex-shrink: 0; }
	.runner-name h1 { margin: 0; }
	.runner-pronouns { font-size: 0.8em; font-weight: 400; color: var(--text-muted); }
	.runner-location, .runner-status { margin: 0.15rem 0 0; font-size: 0.85rem; }
	.runner-representing { opacity: 0.75; font-size: 0.8rem; }
	.flag-img { display: inline-block; vertical-align: middle; border-radius: 2px; margin-right: 0.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
	.runner-meta-line { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.35rem; }
	.runner-joined { font-size: 0.8rem; color: var(--text-muted); }
	.runner-team-badges { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.runner-team-badge {
		display: inline-flex; align-items: center; padding: 0.2rem 0.6rem;
		background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
		font-size: 0.75rem; color: var(--fg); text-decoration: none;
	}
	.runner-team-badge:hover { border-color: var(--accent); color: var(--accent); }
	.runner-socials { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.5rem; }
	.runner-link {
		display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.65rem; background: var(--surface);
		border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;
		color: var(--fg); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.runner-link__icon { flex-shrink: 0; font-size: 0.85rem; }
	.runner-link:hover { border-color: var(--accent); color: var(--accent); }

	/* Bio */
	.runner-bio { margin-bottom: 1.5rem; }
	.runner-bio h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
	.runner-bio p { margin: 0; line-height: 1.6; white-space: pre-wrap; }

	/* Highlights */
	.runner-highlights { margin-bottom: 1.5rem; }
	.runner-highlights h2 { font-size: 1.1rem; margin: 0 0 0.75rem; }

	.highlights-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
	@media (max-width: 768px) { .highlights-grid { grid-template-columns: 1fr; } }
	.highlight-card { position: relative; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); background: var(--surface); }
	.highlight-card__bg { position: absolute; inset: 0; background-size: cover; background-position: center; transition: transform 0.3s ease; }
	.highlight-card__playlist-bg { position: absolute; inset: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
	.highlight-card__playlist-bg::after { content: '🎬'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2.5rem; opacity: 0.3; }
	.highlight-card:hover .highlight-card__bg { transform: scale(1.05); }
	.highlight-card__overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 100%); display: flex; flex-direction: column; justify-content: flex-end; padding: 0.75rem; }
	.highlight-card__game { font-size: 0.75rem; color: rgba(255,255,255,0.7); }
	.highlight-card__category { font-weight: 700; font-size: 0.95rem; color: #fff; }
	.highlight-card__note { font-size: 0.75rem; color: var(--accent); font-style: italic; }
	.highlight-card__video { font-size: 0.75rem; color: #fff; text-decoration: none; opacity: 0.8; margin-top: 0.25rem; }
	.highlight-card__video:hover { text-decoration: underline; opacity: 1; }

	/* Tabs */
	/* Stats Card */
	.runner-stats-card { display: flex; gap: 1rem; margin-bottom: 1rem; padding: 1rem 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; flex-wrap: wrap; }
	.runner-stat { display: flex; flex-direction: column; align-items: center; padding: 0 1rem; border-right: 1px solid var(--border); }
	.runner-stat:last-child { border-right: none; }
	.runner-stat--total { margin-left: auto; padding-left: 1.5rem; border-left: 2px solid var(--accent); border-right: none; }
	.runner-stat__value { font-size: 1.75rem; font-weight: 700; color: var(--accent); line-height: 1; }
	.runner-stat__label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 0.25rem; }

	/* Fun Stats */
	.runner-fun-stats { display: flex; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
	.fun-stat { display: flex; align-items: flex-start; gap: 0.75rem; flex: 1; min-width: 180px; padding: 0.85rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.fun-stat__icon { font-size: 1.25rem; }
	.fun-stat__content { display: flex; flex-direction: column; gap: 0.1rem; }
	.fun-stat__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
	.fun-stat__value { font-weight: 700; font-size: 0.95rem; color: var(--fg); text-decoration: none; }
	a.fun-stat__value:hover { color: var(--accent); }
	.fun-stat__detail { font-size: 0.75rem; color: var(--text-muted); }
	.fun-stat__genres { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.genre-pill { display: inline-block; padding: 0.15rem 0.5rem; background: rgba(99,102,241,0.12); color: #818cf8; border-radius: 12px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize; }

	/* Games Grid */
	.runner-games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem; }
	.runner-game-card {
		position: relative; display: block; aspect-ratio: 16/10; border-radius: 8px; overflow: hidden;
		text-decoration: none; color: #fff; background: var(--surface); border: 1px solid var(--border); cursor: pointer; text-align: left;
		transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
	}
	.runner-game-card__bg { position: absolute; inset: 0; background-size: cover; background-position: center; transition: transform 0.3s ease; }
	.runner-game-card:hover .runner-game-card__bg { transform: scale(1.05); }
	.runner-game-card__overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%); display: flex; flex-direction: column; justify-content: flex-end; padding: 1rem; }
	.runner-game-card__title { font-weight: 700; font-size: 1rem; }
	.runner-game-card__stats { display: flex; gap: 0.75rem; margin-top: 0.35rem; font-size: 0.8rem; color: rgba(255,255,255,0.8); }
	.runner-game-card__count { background: rgba(255,255,255,0.15); padding: 0.15rem 0.5rem; border-radius: 4px; }
	.runner-game-card__best { color: var(--accent); font-weight: 600; }

	/* Runs Detail View */
	.runs-detail-header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.runs-detail-game { display: flex; align-items: center; gap: 1rem; flex: 1; }
	.runs-detail-game__cover { width: 60px; height: 60px; border-radius: 8px; background-size: cover; background-position: center; flex-shrink: 0; }
	.runs-detail-game h2 { margin: 0; font-size: 1.25rem; }
	.runs-detail-game h2 a { color: var(--fg); text-decoration: none; }
	.runs-detail-game h2 a:hover { color: var(--accent); }
	.runs-detail-game p { margin: 0; }
	.runs-category { margin-top: 1rem; }
	.runs-category__title { font-size: 1.1rem; font-weight: 600; margin: 0 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
	.runs-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.run-row { display: flex; align-items: center; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; gap: 1rem; }
	.run-row__time { font-family: monospace; font-weight: 700; font-size: 1.1rem; min-width: 90px; }
	.run-row__info { flex: 1; min-width: 0; }
	.run-row__meta { display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.8rem; color: var(--text-muted); align-items: center; }
	.run-row__verified { color: #10b981; }
	.run-row__actions { flex-shrink: 0; }
	.tag--small { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; background: rgba(99,102,241,0.12); color: #818cf8; }

	/* Achievements */
	.community-achievements-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.community-achievement-item { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.community-achievement-item__icon { font-size: 1.75rem; flex-shrink: 0; }
	.community-achievement-item__content { flex: 1; min-width: 0; }
	.community-achievement-item .btn--small { flex-shrink: 0; margin-left: auto; }
	.community-achievement-item__header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
	.community-achievement-item__header h4 { margin: 0; }
	.community-achievement-item__meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; font-size: 0.8rem; }
	.community-achievement-item__game { color: var(--accent); text-decoration: none; }
	.community-achievement-item__game:hover { text-decoration: underline; }
	.verified-text { color: #10b981; font-weight: 500; }

	/* Difficulty */
	.difficulty { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize; }
	.difficulty--easy { background: rgba(16,185,129,0.15); color: #10b981; }
	.difficulty--medium { background: rgba(245,158,11,0.15); color: #f59e0b; }
	.difficulty--hard { background: rgba(239,68,68,0.15); color: #ef4444; }
	.difficulty--legendary { background: rgba(168,85,247,0.15); color: #a855f7; }

	/* Personal Goals */
	.personal-goals-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.personal-goal-item { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.personal-goal-item__icon { font-size: 1.75rem; }
	.personal-goal-item__content { flex: 1; }
	.personal-goal-item__header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
	.personal-goal-item__header h4 { margin: 0; }
	.personal-goal-item__game { display: inline-block; margin-top: 0.5rem; font-size: 0.75rem; background: var(--bg); padding: 0.2rem 0.5rem; border-radius: 4px; color: var(--text-muted); }
	.personal-goal-item__progress { margin-top: 0.75rem; }
	.personal-goal-item__date { display: block; margin-top: 0.5rem; font-size: 0.8rem; }
	.goal-status { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px; text-transform: uppercase; }
	.goal-status--completed { background: #10b981; color: #fff; }
	.goal-status--progress { background: #3b82f6; color: #fff; }

	/* Progress bar */
	.progress-bar { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
	.progress-bar__fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.3s; }
	.progress-bar__text { display: block; margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-muted); }

	/* Contributions */
	.contributions-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.contribution-item { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.contribution-icon { font-size: 1.5rem; }
	.contribution-info { flex: 1; }
	.contribution-info h4 { margin: 0 0 0.25rem; }
	.contribution-info p { margin: 0; font-size: 0.85rem; }
	.contribution-link { display: inline-block; margin-top: 0.5rem; font-size: 0.85rem; color: var(--accent); text-decoration: none; }
	.contribution-link:hover { text-decoration: underline; }
	.contribution-type { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; background: var(--surface); padding: 0.25rem 0.5rem; border-radius: 4px; color: var(--text-muted); }

	/* Credits Grid */
	.credits-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; }

	/* Contribution role game chips */
	.contrib-game-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.contrib-game-chip { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--fg); font-size: 0.9rem; }
	.contrib-game-chip:hover { border-color: var(--accent); color: var(--accent); }
	.contrib-game-chip__cover { width: 24px; height: 24px; border-radius: 4px; object-fit: cover; }

	/* Activity Timeline */
	.activity-timeline { position: relative; padding-left: 2rem; margin-top: 1rem; }
	.activity-timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: var(--border); }
	.timeline-item { position: relative; padding-bottom: 1.25rem; }
	.timeline-item:last-child { padding-bottom: 0; }
	.timeline-item__dot { position: absolute; left: -2rem; top: 0.35rem; width: 16px; height: 16px; border-radius: 50%; background: var(--surface); border: 2px solid var(--border); z-index: 1; }
	.timeline-item__dot--achievement { border-color: var(--accent); background: var(--accent); }
	.timeline-item__content { padding: 0.5rem 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
	.timeline-item__header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.9rem; }
	.timeline-item__header a { color: var(--accent); text-decoration: none; }
	.timeline-item__header a:hover { text-decoration: underline; }
	.timeline-item__icon { flex-shrink: 0; }
	.timeline-item__time { font-family: monospace; font-size: 0.8rem; color: var(--accent); font-weight: 600; margin-left: auto; }
	.timeline-item__date { display: block; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; }

	/* Empty */
	.empty-state { text-align: center; padding: 2rem; }
	.empty-icon { display: block; font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }

	/* Buttons */
	.btn--small { padding: 0.35rem 0.7rem; font-size: 0.8rem; }

	/* Responsive */
	@media (max-width: 640px) {
		.runner-banner { height: 120px; }
		.runner-top { flex-direction: column; }
		.runner-socials { grid-template-columns: 1fr; }
		.runner-stats-card { justify-content: center; }
		.runner-stat { padding: 0 0.75rem; }
		.runner-stat--total { margin-left: 0; border-left: none; width: 100%; flex-direction: row; justify-content: center; gap: 0.5rem; border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.5rem; }
		.runner-fun-stats { flex-direction: column; }
		.fun-stat { min-width: auto; }
		.runner-games-grid { grid-template-columns: 1fr; }
		.run-row { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
		.run-row__time { min-width: auto; }
	}
</style>
