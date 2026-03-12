<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const team = $derived(data.team);
</script>

<svelte:head><title>{team.name} | {m.teams_heading()} | CRC</title></svelte:head>

<div class="page-width">
	<div class="game-shell">
		<p class="muted page-back"><a href={localizeHref('/teams')}>{m.teams_back()}</a></p>

		<!-- Team Header -->
		<div class="team-header">
			{#if team.logo}
				<img src={team.logo} alt={team.name} class="team-header__logo" />
			{:else}
				<div class="team-header__logo team-header__logo--placeholder">{team.name.charAt(0)}</div>
			{/if}
			<div class="team-header__info">
				<h1>{team.name}</h1>
				{#if team.tagline}
					<p class="team-header__tagline muted">{team.tagline}</p>
				{/if}
				{#if team.socials}
					<div class="team-header__socials">
						{#if team.socials.discord}
							<a href={team.socials.discord} target="_blank" rel="noopener" class="social-link">Discord</a>
						{/if}
						{#if team.socials.youtube}
							<a href={team.socials.youtube} target="_blank" rel="noopener" class="social-link">YouTube</a>
						{/if}
						{#if team.socials.twitch}
							<a href={team.socials.twitch} target="_blank" rel="noopener" class="social-link">Twitch</a>
						{/if}
						{#if team.socials.twitter}
							<a href={team.socials.twitter} target="_blank" rel="noopener" class="social-link">Twitter</a>
						{/if}
						{#if team.socials.website}
							<a href={team.socials.website} target="_blank" rel="noopener" class="social-link">Website</a>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Description -->
		{#if team.content}
			<div class="card">
				<div class="md-content">
					{@html renderMarkdown(team.content)}
				</div>
			</div>
		{/if}

		<!-- Games -->
		{#if data.games.length > 0}
			<div class="card">
				<h2>{m.teams_games()}</h2>
				<div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem;">
					{#each data.games as game}
						<a href={localizeHref(`/games/${game.game_id}`)} class="tag">{game.game_name}</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Members -->
		{#if data.members.length > 0}
			<div class="card">
				<h2>{m.teams_members()}</h2>
				<div class="team-members" style="margin-top: 0.75rem;">
					{#each data.members as member}
						<div class="team-member">
							{#if member.hasProfile}
								<a href={localizeHref(`/runners/${member.runner_id}`)} class="team-member__name">{member.name}</a>
							{:else}
								<span class="team-member__name">{member.name}</span>
							{/if}
							{#if member.role}
								<span class="team-member__role muted">{member.role}</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Achievements -->
		{#if data.achievements.length > 0}
			<div class="card">
				<h2>{m.teams_achievements()}</h2>
				<div class="team-achievements" style="margin-top: 0.75rem;">
					{#each data.achievements as achievement}
						<div class="team-achievement">
							<span class="team-achievement__title">{achievement.title}</span>
							{#if achievement.date}
								<span class="team-achievement__date muted">{achievement.date}</span>
							{/if}
							{#if achievement.description}
								<p class="team-achievement__desc muted">{achievement.description}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
