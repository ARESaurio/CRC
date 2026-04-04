<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		headers = [
			{ label: 'Topic', type: 'topic' },
			{ label: 'Replies', type: 'stat' },
			{ label: 'Views', type: 'stat' },
			{ label: 'Last Post', type: 'last' }
		],
		empty = false,
		emptyMessage = 'No threads yet.',
		children
	}: {
		headers?: Array<{ label: string; type?: string }>;
		empty?: boolean;
		emptyMessage?: string;
		children: Snippet;
	} = $props();
</script>

<div class="forum-thread-table">
	<div class="forum-thread-table__head">
		{#each headers as h}
			<span class="forum-thread-table__col forum-thread-table__col--{h.type || 'topic'}">{h.label}</span>
		{/each}
	</div>
	{#if empty}
		<div class="forum-thread-table__empty">
			<p class="muted">{emptyMessage}</p>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

<style>
	.forum-thread-table {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.forum-thread-table__head {
		display: grid;
		grid-template-columns: 1fr 70px 70px 160px;
		gap: 0.5rem;
		padding: 0.5rem 0.85rem;
		background: linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
		border-bottom: 1px solid var(--border);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.forum-thread-table__col--stat { text-align: center; }
	.forum-thread-table__empty { padding: 2rem; text-align: center; }
	.muted { color: var(--muted); }

	@media (max-width: 700px) {
		.forum-thread-table__head { display: none; }
	}
</style>
