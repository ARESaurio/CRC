<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
</script>
<svelte:head><title>{m.teams_page_title()}</title></svelte:head>
<div class="page-width">
	<h1>{m.teams_heading()}</h1>
	<p class="muted">{m.teams_description()}</p>
	{#if data.teams.length === 0}
		<div class="card"><p class="muted">{m.teams_empty()}</p></div>
	{:else}
		<div class="runners-grid">
			{#each data.teams as team}
				<a href={localizeHref(`/teams/${team.team_id}`)} class="card card-lift" style="text-decoration:none;color:var(--fg);padding:1rem;">
					<strong>{team.name}</strong>
					{#if team.tagline}<p class="muted" style="margin:0.25rem 0 0;font-size:0.85rem;">{team.tagline}</p>{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>
<style>.runners-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; margin-top: 1rem; }</style>
