<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$stores/auth';
	import { inbox, inboxLoaded, loadInbox } from '$stores/messages';
	import { localizeHref } from '$lib/paraglide/runtime';

	onMount(() => {
		if ($user) loadInbox();
	});

	// Reload when user signs in
	$effect(() => {
		if ($user && !$inboxLoaded) loadInbox();
	});

	function threadName(thread: typeof $inbox[0]): string {
		if (thread.subject) return thread.subject;
		const others = thread.participants?.filter((p: any) => p.user_id !== $user?.id) || [];
		if (others.length === 0) return 'Thread';
		return others.map((p: any) => p.display_name).join(', ');
	}

	function timeAgo(dateStr: string | null): string {
		if (!dateStr) return '';
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'now';
		if (mins < 60) return `${mins}m`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d`;
		return `${Math.floor(days / 30)}mo`;
	}

	function submissionBadge(type: string | null): string {
		if (type === 'run') return '🏃';
		if (type === 'game') return '🎮';
		if (type === 'profile') return '👤';
		if (type === 'game_update') return '📝';
		return '';
	}

	function truncate(str: string | null, max: number): string {
		if (!str) return '';
		return str.length > max ? str.slice(0, max) + '…' : str;
	}
</script>

<svelte:head>
	<title>{m.msg_page_title()}</title>
</svelte:head>

<div class="messages-page page-width">
	<div class="messages-header">
		<h1>{m.msg_heading()}</h1>
		<a href={localizeHref('/messages/new')} class="btn btn--primary">{m.msg_new()}</a>
	</div>

	{#if !$user}
		<div class="messages-empty">
			<p>{m.msg_sign_in_required()}</p>
			<a href={localizeHref('/sign-in')} class="btn btn--primary">{m.msg_sign_in()}</a>
		</div>
	{:else if !$inboxLoaded}
		<div class="messages-empty">{m.msg_loading()}</div>
	{:else if $inbox.length === 0}
		<div class="messages-empty">
			<p>{m.msg_empty()}</p>
			<p class="muted">{m.msg_empty_hint()}</p>
		</div>
	{:else}
		<div class="thread-list">
			{#each $inbox as thread (thread.thread_id)}
				<a
					href={localizeHref(`/messages/${thread.thread_id}`)}
					class="thread-item"
					class:thread-item--unread={thread.unread_count > 0}
				>
					<div class="thread-item__avatars">
						{#each (thread.participants || []).filter((p: any) => p.user_id !== $user?.id).slice(0, 2) as p}
							<img
								class="thread-item__avatar"
								src={p.avatar_url || '/img/site/default-runner.png'}
								alt=""
							/>
						{/each}
					</div>
					<div class="thread-item__content">
						<div class="thread-item__top">
							<span class="thread-item__name">
								{#if thread.submission_type}
									<span class="thread-item__badge">{submissionBadge(thread.submission_type)}</span>
								{/if}
								{threadName(thread)}
							</span>
							<span class="thread-item__time">{timeAgo(thread.last_message_at || thread.thread_updated_at)}</span>
						</div>
						<div class="thread-item__preview">
							{truncate(thread.last_message_content, 80) || 'No messages yet'}
						</div>
					</div>
					{#if thread.unread_count > 0}
						<span class="thread-item__unread">{thread.unread_count}</span>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>
