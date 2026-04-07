<script lang="ts">
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
</script>
<svelte:head><title>{m.rules_page_title()}</title></svelte:head>
<div class="page-width">
	<h2>{m.rules_heading()}</h2>
	<p class="muted">{m.rules_description()}</p>
	<div class="card">
		<h2>{m.rules_general_heading()}</h2>
		<ul>
			<li><strong>{m.rules_video_proof()}</strong> {m.rules_video_proof_desc()}</li>
			<li>{@html m.rules_unseeded({ bold_start: '<strong>', bold_end: '</strong>' })}</li>
			<li>{m.rules_no_cheats()}</li>
			<li>{@html m.rules_full_run({ bold_start: '<strong>', bold_end: '</strong>' })}</li>
			<li>{m.rules_own_gameplay()}</li>
		</ul>
	</div>
	<div class="card">
		<h2>{m.rules_game_specific_heading()}</h2>
		<p>{m.rules_game_specific_desc()}</p>
		<a href={localizeHref('/games')} class="btn btn--small">{m.btn_browse_games()}</a>
	</div>
</div>
<style>.card { margin-bottom: 1rem; } .card h2 { margin: 0 0 0.5rem; }</style>
