<script lang="ts">
	import AzNav from '$lib/components/AzNav.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { norm, matchesLetterFilter, getFirstLetter } from '$lib/utils/filters';
	import { getCountry } from '$lib/data/countries';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	let search = $state('');
	let activeLetter = $state('');
	let showLimit = $state(25);

	const filtered = $derived(
		data.runners.filter((r) => {
			const name = r.display_name || r.runner_name || '';

			// Letter filter
			const firstLetter = getFirstLetter(name);
			if (!matchesLetterFilter(firstLetter, activeLetter)) return false;

			// Text search
			if (search) {
				const q = norm(search);
				if (!norm(name).includes(q) && !norm(r.runner_name || '').includes(q)) {
					return false;
				}
			}

			return true;
		})
	);

	let visible = $derived(showLimit === 0 ? filtered : filtered.slice(0, showLimit));
</script>

<svelte:head>
	<title>{m.runners_page_title()}</title>
</svelte:head>

<div class="page-width">
	<h1>{m.runners_heading()}</h1>
	<p class="muted">{m.runners_description()}</p>

	<!-- A-Z Navigation -->
	<AzNav bind:activeLetter />

	<!-- Search + results controls -->
	<div class="filter-wrap" style="margin-bottom: 0.75rem;">
		<input
			class="filter"
			type="text"
			placeholder={m.runners_search_placeholder()}
			bind:value={search}
			autocomplete="off"
		/>
	</div>

	<div class="results-controls">
		<label class="muted" for="runners-limit">{m.games_show()}</label>
		<select id="runners-limit" class="select" bind:value={showLimit}>
			<option value={10}>10</option>
			<option value={25}>25</option>
			<option value={50}>50</option>
			<option value={100}>100</option>
			<option value={0}>All</option>
		</select>
		<span class="muted" style="margin-left: auto; font-size: 0.9rem;">
			{m.runners_showing({ visible: String(visible.length), total: String(data.runners.length) })}
		</span>
	</div>

	<div class="runners-grid">
		{#each visible as runner (runner.runner_id)}
			{@const locCountry = runner.location ? getCountry(runner.location) : null}
			{@const repCountry = runner.socials?.representing ? getCountry(runner.socials.representing) : null}
			<a href={localizeHref(`/runners/${runner.runner_id}`)} class="runner-card card card-lift">
				<img
					class="runner-card__avatar"
					src={runner.avatar || '/img/site/default-runner.png'}
					alt=""
				/>
				<div class="runner-card__info">
					<strong class="runner-card__name">{runner.display_name || runner.runner_name}</strong>
					{#if runner.pronouns}
						<span class="runner-card__pronouns muted">({runner.pronouns.length > 20 ? runner.pronouns.slice(0, 20) + '…' : runner.pronouns})</span>
					{/if}
					{#if locCountry || repCountry}
						<span class="runner-card__location muted">
							{#if locCountry}
								<img class="runner-card__flag" src="https://flagcdn.com/w40/{locCountry.code.toLowerCase()}.png" alt="{locCountry.name} flag" width="16" height="12" />
								{locCountry.name}
							{/if}
							{#if repCountry && repCountry.code !== locCountry?.code}
								<span class="runner-card__ally">· {m.runners_ally_of()}
									<img class="runner-card__flag" src="https://flagcdn.com/w40/{repCountry.code.toLowerCase()}.png" alt="{repCountry.name} flag" width="16" height="12" />
									{repCountry.name}
								</span>
							{/if}
						</span>
					{/if}
					<span class="runner-card__meta muted">{m.runners_runs({ count: String(runner.runCount) })}</span>
				</div>
			</a>
		{/each}

		{#if visible.length === 0}
			<p class="muted" style="grid-column: 1 / -1; text-align: center; padding: 2rem 0;">
				{m.runners_no_results()}
			</p>
		{/if}
	</div>
</div>

<style>
	.runners-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.runner-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		text-decoration: none;
		color: var(--fg);
	}
	.runner-card__avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}
	.runner-card__info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.runner-card__name {
		font-size: 1rem;
	}
	.runner-card__pronouns {
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.runner-card__location {
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
	}
	.runner-card__ally {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		opacity: 0.75;
	}
	.runner-card__flag {
		display: inline-block;
		vertical-align: middle;
		border-radius: 2px;
		box-shadow: 0 1px 3px rgba(0,0,0,0.3);
	}
	.runner-card__meta {
		font-size: 0.8rem;
	}
</style>
