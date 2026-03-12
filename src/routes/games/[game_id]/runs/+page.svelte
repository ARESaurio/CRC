<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	let { data } = $props();
	const game = $derived(data.game);
</script>

<svelte:head>
	<title>{m.game_runs_heading()} - {game.game_name} | CRC</title>
</svelte:head>

<div class="card">
	<h2>{m.game_runs_heading()}</h2>
	<p class="muted">{m.game_runs_no_categories()}</p>
	<p class="muted">{@html m.game_runs_check_back({ link_start: `<a href="${localizeHref(`/games/${game.game_id}/suggest`)}">`, link_end: '</a>' })}</p>
</div>
