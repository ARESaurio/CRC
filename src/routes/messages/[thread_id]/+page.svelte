<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { user } from '$stores/auth';
	import {
		currentThread,
		threadMessages,
		threadLoaded,
		loadThread,
		sendMessage,
		markThreadRead
	} from '$stores/messages';
	import { localizeHref } from '$lib/paraglide/runtime';

	let messageInput = $state('');
	let sending = $state(false);
	let messagesContainer = $state<HTMLDivElement>();

	let threadId = $derived($page.params.thread_id ?? '');

	onMount(() => {
		if ($user && threadId) {
			loadThread(threadId).then(() => {
				markThreadRead(threadId);
				scrollToBottom();
			});
		}
	});

	// Re-load if thread_id changes
	$effect(() => {
		if ($user && threadId) {
			loadThread(threadId).then(() => {
				markThreadRead(threadId);
				scrollToBottom();
			});
		}
	});

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function handleSend() {
		if (!messageInput.trim() || sending) return;
		sending = true;

		const ok = await sendMessage(threadId, messageInput);
		if (ok) {
			messageInput = '';
			await scrollToBottom();
			markThreadRead(threadId);
		}
		sending = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function threadTitle(): string {
		if ($currentThread?.subject) return $currentThread.subject;
		const others = $currentThread?.participants?.filter((p) => p.user_id !== $user?.id) || [];
		return others.map((p) => p.display_name).join(', ') || 'Thread';
	}

	function submissionLink(): { label: string; href: string } | null {
		if (!$currentThread?.submission_type || !$currentThread?.submission_id) return null;
		const t = $currentThread.submission_type;
		const id = $currentThread.submission_id;
		if (t === 'run') return { label: 'View Run Submission', href: `/profile/submissions/run/${id}` };
		if (t === 'game') return { label: 'View Game Request', href: `/profile/submissions/game/${id}` };
		if (t === 'game_update') return { label: 'View Game Update', href: `/profile/submissions/update/${id}` };
		if (t === 'profile') return { label: 'View Profile Status', href: '/profile/status' };
		return null;
	}

	function formatTime(dateStr: string): string {
		const d = new Date(dateStr);
		const now = new Date();
		const isToday = d.toDateString() === now.toDateString();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday = d.toDateString() === yesterday.toDateString();

		const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		if (isToday) return time;
		if (isYesterday) return `Yesterday ${time}`;
		return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
	}

	function isSelf(senderId: string): boolean {
		return senderId === $user?.id;
	}
</script>

<svelte:head>
	<title>{$currentThread?.subject || 'Thread'} | Messages | Challenge Run Community</title>
</svelte:head>

<div class="messages-page page-width">
	<div class="thread-view">
		<!-- Header -->
		<div class="thread-header">
			<a href={localizeHref('/messages')} class="back-link">← Messages</a>
			<div class="thread-header__info">
				<h2 class="thread-header__title">{threadTitle()}</h2>
				{#if $currentThread?.participants}
					<span class="thread-header__participants">
						{$currentThread.participants.length} participant{$currentThread.participants.length > 1 ? 's' : ''}
					</span>
				{/if}
			</div>
		</div>

		{#if $currentThread?.submission_type}
			{@const link = submissionLink()}
			{#if link}
				<div class="thread-submission-link">
					<a href={localizeHref(link.href)}>{link.label} →</a>
				</div>
			{/if}
		{/if}

		<!-- Messages -->
		{#if !$user}
			<div class="messages-empty">{m.msg_thread_sign_in()}</div>
		{:else if !$threadLoaded}
			<div class="messages-empty">{m.msg_thread_loading()}</div>
		{:else if !$currentThread}
			<div class="messages-empty">{m.msg_thread_not_found()}</div>
		{:else}
			<div class="thread-messages" bind:this={messagesContainer}>
				{#if $threadMessages.length === 0}
					<div class="messages-empty">{m.msg_thread_empty()}</div>
				{:else}
					{#each $threadMessages as msg (msg.id)}
						<div class="msg" class:msg--self={isSelf(msg.sender_id)} class:msg--other={!isSelf(msg.sender_id)}>
							{#if !isSelf(msg.sender_id)}
								<img
									class="msg__avatar"
									src={msg.sender?.avatar_url || '/img/site/default-runner.png'}
									alt=""
								/>
							{/if}
							<div class="msg__body">
								{#if !isSelf(msg.sender_id)}
									<span class="msg__sender">{msg.sender?.display_name || 'Unknown'}</span>
								{/if}
								<div class="msg__bubble">{msg.content}</div>
								<span class="msg__time">{formatTime(msg.created_at)}</span>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Input -->
			<div class="thread-input">
				<textarea
					class="thread-input__textarea"
					placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
					bind:value={messageInput}
					onkeydown={handleKeydown}
					maxlength="2000"
					rows="2"
				></textarea>
				<button
					type="button"
					class="thread-input__send"
					disabled={!messageInput.trim() || sending}
					onclick={handleSend}
				>
					{sending ? '…' : '→'}
				</button>
			</div>
		{/if}
	</div>
</div>
