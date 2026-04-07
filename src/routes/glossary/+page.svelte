<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
	const challenges = $derived(data.challenges || {});
	const glossary = $derived(data.glossary || {});

	const glossarySections = $derived(Object.entries(glossary));
	const challengeEntries = $derived(
		Object.entries(challenges)
			.filter(([_, ch]) => ch.label)
			.sort((a, b) => a[1].label.localeCompare(b[1].label))
	);
</script>

<svelte:head><title>{m.glossary_page_title()}</title></svelte:head>

<div class="page-width">
	<h2>{m.glossary_heading()}</h2>
	<p class="muted mb-4">{m.glossary_description()}</p>

	<nav class="glossary-nav" aria-label="Glossary sections">
		{#each glossarySections as [key, section]}
			<a href="#{key}">{section.label}</a>
		{/each}
		<a href="#challenges">{m.glossary_challenge_types()}</a>
	</nav>

	{#each glossarySections as [key, section]}
		<section id={key}>
			<h2>{section.label}</h2>
			{#each Object.values(section.terms) as term}
				<div class="card">
					<h3>{term.label}</h3>
					{#if term.description}
						<p>{term.description}</p>
					{/if}
				</div>
			{/each}
		</section>
	{/each}

	<section id="challenges">
		<h2>{m.glossary_challenge_types()}</h2>
		{#each challengeEntries as [slug, challenge]}
			<div class="card">
				<h3>{challenge.label}</h3>
				{#if challenge.description}
					<div class="card-body">{@html renderMarkdown(challenge.description)}</div>
				{:else}
					<p class="muted">{m.glossary_no_definition()}</p>
				{/if}
				{#if challenge.aliases?.length}
					<p class="muted aliases">{m.glossary_also_known_as({ aliases: challenge.aliases.join(', ') })}</p>
				{/if}
			</div>
		{/each}
	</section>
</div>

<style>
	.mb-4 { margin-bottom: 2rem; }
	.glossary-nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 2rem;
	}
	.glossary-nav a {
		padding: 0.4rem 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 0.85rem;
		color: var(--fg);
		text-decoration: none;
	}
	.glossary-nav a:hover {
		background: var(--accent);
		color: var(--bg);
		border-color: var(--accent);
	}
	section { margin-bottom: 2.5rem; }
	section h2 {
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.card { margin-bottom: 1rem; }
	.card h3 { margin: 0 0 0.5rem; color: var(--accent); }
	.card p { margin: 0; line-height: 1.6; }
	.card-body { line-height: 1.6; }
	.card-body :global(ul) { margin: 0; padding-left: 1.25rem; }
	.card-body :global(li) { margin-bottom: 0.25rem; }
	.aliases { margin-top: 0.5rem; font-size: 0.85rem; }
</style>
