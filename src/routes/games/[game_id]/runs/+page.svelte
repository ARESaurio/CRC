<script lang="ts">
	let { data } = $props();
	const game = $derived(data.game);
</script>

<svelte:head>
	<title>Runs - {game.game_name} | CRC</title>
</svelte:head>

<div class="card">
	<h2>Runs</h2>
	<p class="muted">No run categories have been set up for this game yet.</p>
	<p class="muted">Check back later or <a href="/games/{game.game_id}/suggest">suggest an update</a>.</p>
</div>
