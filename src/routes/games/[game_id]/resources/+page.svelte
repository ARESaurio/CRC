<script lang="ts">
	import { BookOpen } from 'lucide-svelte';
	import Icon from '$lib/components/Icon.svelte';
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
	const game = $derived(data.game);
	const resources = $derived((game as any).resources_data || []);
</script>

<svelte:head><title>{m.game_resources_title({ name: game.game_name })}</title></svelte:head>

<h2>{m.game_resources_heading()}</h2>
<p class="muted mb-2">{m.game_resources_desc({ name: game.game_name })}</p>

{#if resources.length > 0}
	<div class="resources-list">
		{#each resources as resource}
			<div class="resource-item card">
				<a href={resource.url} target="_blank" rel="noopener">
					<strong>{resource.name}</strong>
				</a>
				{#if resource.description}
					<p class="muted">{resource.description}</p>
				{/if}
				{#if resource.type}
					<span class="resource-type">{resource.type}</span>
				{/if}
			</div>
		{/each}
	</div>
{:else}
	<div class="card">
		<div class="empty-state">
			<span class="empty-state__icon"><BookOpen size={24} /></span>
			<h3>{m.game_resources_empty_title()}</h3>
			<p class="muted">{m.game_resources_empty_desc()}</p>
			<p class="muted">{m.game_resources_empty_cta()}</p>
		</div>
	</div>
{/if}

<style>

	.mb-2 { margin-bottom: 1rem; }
	.resources-list { display: flex; flex-direction: column; gap: 0.75rem; }
	.resource-item a { color: var(--accent); text-decoration: none; }
	.resource-item a:hover { text-decoration: underline; }
	.resource-item p { margin: 0.25rem 0 0; font-size: 0.9rem; }
	.resource-type {
		display: inline-block; margin-top: 0.5rem; font-size: 0.7rem; font-weight: 600;
		padding: 0.15rem 0.5rem; border-radius: 4px; text-transform: uppercase;
		background: var(--surface); border: 1px solid var(--border);
	}
	.empty-state { text-align: center; padding: 2rem 1rem; }
	.empty-state__icon { display: block; font-size: 3rem; margin-bottom: 0.75rem; opacity: 0.5; }
	.empty-state h3 { margin: 0 0 0.5rem; }
	.empty-state p { margin: 0; }
</style>
