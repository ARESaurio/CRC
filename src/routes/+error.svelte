<script lang="ts">
	import { page } from '$app/stores';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
</script>

<div class="page-width">
	<div class="error-page">
		<div class="error-code">{$page.status}</div>
		<h2>
			{#if $page.status === 404}
				{m.error_page_not_found()}
			{:else if $page.status === 403}
				{m.error_access_denied()}
			{:else if $page.status === 500}
				{m.error_server_error()}
			{:else}
				{m.error_something_wrong()}
			{/if}
		</h2>
		<p class="muted">
			{#if $page.status === 404}
				{m.error_404_message()}
			{:else}
				{$page.error?.message || m.error_generic_message()}
			{/if}
		</p>
		<div class="error-actions">
			<a href={localizeHref('/')} class="btn btn--accent">{m.error_go_home()}</a>
			<a href={localizeHref('/games')} class="btn btn--outline">{m.btn_browse_games()}</a>
			<a href={localizeHref('/search')} class="btn btn--outline">{m.error_search()}</a>
		</div>
	</div>
</div>

<style>
	.error-page {
		max-width: 500px;
		margin: 4rem auto;
		text-align: center;
	}
	.error-code {
		font-size: 6rem;
		font-weight: 800;
		line-height: 1;
		color: var(--accent);
		margin-bottom: 0.5rem;
		opacity: 0.3;
	}
	h2 {
		font-size: 1.75rem;
		margin-bottom: 0.5rem;
	}
	.error-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 2rem;
		flex-wrap: wrap;
	}
</style>
