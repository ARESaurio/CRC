<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { tick } from 'svelte';
	import { user } from '$stores/auth';
	import {
		inbox, inboxLoaded, loadInbox, loadUnreadCount,
		currentThread, threadMessages, threadLoaded,
		loadThread, sendMessage, markThreadRead
	} from '$stores/messages';
	import { localizeHref } from '$lib/paraglide/runtime';

	let { open = $bindable(false) } = $props();

	let view = $state<'inbox' | 'thread'>('inbox');
	let activeThreadId = $state('');
	let messageInput = $state('');
	let sending = $state(false);
	let messagesContainer = $state<HTMLDivElement>();

	// Load inbox when panel opens
	$effect(() => {
		if (open && $user && !$inboxLoaded) {
			loadInbox();
		}
	});

	function close() {
		open = false;
		// Reset to inbox on close
		setTimeout(() => {
			view = 'inbox';
			activeThreadId = '';
			messageInput = '';
		}, 300);
	}

	async function openThread(threadId: string) {
		activeThreadId = threadId;
		view = 'thread';
		await loadThread(threadId);
		markThreadRead(threadId);
		await scrollToBottom();
	}

	function backToInbox() {
		view = 'inbox';
		activeThreadId = '';
		messageInput = '';
		// Refresh inbox to update unread counts
		loadInbox();
		loadUnreadCount();
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function handleSend() {
		if (!messageInput.trim() || sending) return;
		sending = true;
		const ok = await sendMessage(activeThreadId, messageInput);
		if (ok) {
			messageInput = '';
			await scrollToBottom();
			markThreadRead(activeThreadId);
		}
		sending = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function threadName(thread: typeof $inbox[0]): string {
		if (thread.subject) return thread.subject;
		const others = thread.participants?.filter((p: any) => p.user_id !== $user?.id) || [];
		if (others.length === 0) return 'Thread';
		return others.map((p: any) => p.display_name).join(', ');
	}

	function threadTitle(): string {
		if ($currentThread?.subject) return $currentThread.subject;
		const others = $currentThread?.participants?.filter((p) => p.user_id !== $user?.id) || [];
		return others.map((p) => p.display_name).join(', ') || 'Thread';
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

	function truncate(str: string | null, max: number): string {
		if (!str) return '';
		return str.length > max ? str.slice(0, max) + '…' : str;
	}

	function submissionBadge(type: string | null): string {
		if (type === 'run') return '🏃';
		if (type === 'game') return '🎮';
		if (type === 'profile') return '👤';
		if (type === 'game_update') return '📝';
		return '';
	}

	function isSelf(senderId: string): boolean {
		return senderId === $user?.id;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="msg-panel-backdrop" onclick={close}></div>

	<aside class="msg-panel" onclick={(e) => e.stopPropagation()}>
		<!-- INBOX VIEW -->
		{#if view === 'inbox'}
			<div class="msg-panel__header">
				<h3 class="msg-panel__title">{m.msg_heading()}</h3>
				<div class="msg-panel__header-actions">
					<a href={localizeHref('/messages/new')} class="msg-panel__new-btn" onclick={close} title="New Message">✏️</a>
					<button type="button" class="msg-panel__close" onclick={close}>&times;</button>
				</div>
			</div>

			<div class="msg-panel__body">
				{#if !$inboxLoaded}
					<div class="msg-panel__empty">{m.msg_loading()}</div>
				{:else if $inbox.length === 0}
					<div class="msg-panel__empty">
						<p>{m.msg_empty()}</p>
						<p class="muted">{m.msg_empty_hint()}</p>
					</div>
				{:else}
					{#each $inbox as thread (thread.thread_id)}
						<button
							type="button"
							class="msg-panel__thread"
							class:msg-panel__thread--unread={thread.unread_count > 0}
							onclick={() => openThread(thread.thread_id)}
						>
							<div class="msg-panel__thread-avatars">
								{#each (thread.participants || []).filter((p: any) => p.user_id !== $user?.id).slice(0, 2) as p}
									<img class="msg-panel__thread-avatar" src={p.avatar_url || '/img/site/default-runner.png'} alt="" />
								{/each}
							</div>
							<div class="msg-panel__thread-content">
								<div class="msg-panel__thread-top">
									<span class="msg-panel__thread-name">
										{#if thread.submission_type}<span class="msg-panel__thread-badge">{submissionBadge(thread.submission_type)}</span>{/if}
										{threadName(thread)}
									</span>
									<span class="msg-panel__thread-time">{timeAgo(thread.last_message_at || thread.thread_updated_at)}</span>
								</div>
								<div class="msg-panel__thread-preview">{truncate(thread.last_message_content, 60) || 'No messages yet'}</div>
							</div>
							{#if thread.unread_count > 0}
								<span class="msg-panel__thread-unread">{thread.unread_count}</span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<div class="msg-panel__footer">
				<a href={localizeHref('/messages')} onclick={close}>Open full inbox →</a>
			</div>

		<!-- THREAD VIEW -->
		{:else}
			<div class="msg-panel__header">
				<button type="button" class="msg-panel__back" onclick={backToInbox}>←</button>
				<h3 class="msg-panel__title msg-panel__title--truncate">{threadTitle()}</h3>
				<button type="button" class="msg-panel__close" onclick={close}>&times;</button>
			</div>

			<div class="msg-panel__body msg-panel__body--thread">
				{#if !$threadLoaded}
					<div class="msg-panel__empty">{m.msg_thread_loading()}</div>
				{:else if !$currentThread}
					<div class="msg-panel__empty">{m.msg_thread_not_found()}</div>
				{:else}
					<div class="msg-panel__messages" bind:this={messagesContainer}>
						{#if $threadMessages.length === 0}
							<div class="msg-panel__empty">{m.msg_thread_empty()}</div>
						{:else}
							{#each $threadMessages as msg (msg.id)}
								<div class="msg-panel__msg" class:msg-panel__msg--self={isSelf(msg.sender_id)}>
									{#if !isSelf(msg.sender_id)}
										<img class="msg-panel__msg-avatar" src={msg.sender?.avatar_url || '/img/site/default-runner.png'} alt="" />
									{/if}
									<div class="msg-panel__msg-body">
										{#if !isSelf(msg.sender_id)}
											<span class="msg-panel__msg-sender">{msg.sender?.display_name || 'Unknown'}</span>
										{/if}
										<div class="msg-panel__msg-bubble">{msg.content}</div>
										<span class="msg-panel__msg-time">{formatTime(msg.created_at)}</span>
									</div>
								</div>
							{/each}
						{/if}
					</div>

					<div class="msg-panel__input">
						<textarea
							class="msg-panel__textarea"
							placeholder="Type a message…"
							bind:value={messageInput}
							onkeydown={handleKeydown}
							maxlength="2000"
							rows="2"
						></textarea>
						<button
							type="button"
							class="msg-panel__send"
							disabled={!messageInput.trim() || sending}
							onclick={handleSend}
						>{sending ? '…' : '→'}</button>
					</div>
				{/if}
			</div>
		{/if}
	</aside>
{/if}

<style>
	.msg-panel-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 900;
	}

	.msg-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		max-width: 100vw;
		background: var(--surface);
		border-left: 1px solid var(--border);
		z-index: 901;
		display: flex;
		flex-direction: column;
		animation: msg-slide-in 0.2s ease-out;
	}

	@keyframes msg-slide-in {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}

	.msg-panel__header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.msg-panel__title {
		flex: 1;
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.msg-panel__title--truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.msg-panel__header-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.msg-panel__new-btn {
		text-decoration: none;
		font-size: 1rem;
		padding: 0.2rem;
	}

	.msg-panel__close {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0 0.15rem;
		line-height: 1;
	}
	.msg-panel__close:hover { color: var(--fg); }

	.msg-panel__back {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
	}
	.msg-panel__back:hover { color: var(--fg); }

	.msg-panel__body {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.msg-panel__body--thread {
		display: flex;
		flex-direction: column;
	}

	.msg-panel__empty {
		padding: 2rem 1rem;
		text-align: center;
		color: var(--muted);
		font-size: 0.9rem;
	}

	.msg-panel__footer {
		padding: 0.6rem 1rem;
		border-top: 1px solid var(--border);
		text-align: center;
		font-size: 0.85rem;
		flex-shrink: 0;
	}
	.msg-panel__footer a {
		color: var(--accent);
		text-decoration: none;
	}
	.msg-panel__footer a:hover { text-decoration: underline; }

	/* Thread list items */
	.msg-panel__thread {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.7rem 1rem;
		background: none;
		border: none;
		border-bottom: 1px solid var(--border);
		color: var(--fg);
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		transition: background 0.1s;
	}
	.msg-panel__thread:hover { background: rgba(255, 255, 255, 0.03); }
	.msg-panel__thread--unread { background: rgba(var(--accent-rgb, 99, 102, 241), 0.06); }

	.msg-panel__thread-avatars { display: flex; gap: -4px; flex-shrink: 0; }
	.msg-panel__thread-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid var(--surface); }

	.msg-panel__thread-content { flex: 1; min-width: 0; }
	.msg-panel__thread-top { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; }
	.msg-panel__thread-name { font-weight: 600; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.msg-panel__thread-badge { margin-right: 0.2rem; }
	.msg-panel__thread-time { font-size: 0.75rem; color: var(--muted); flex-shrink: 0; }
	.msg-panel__thread-preview { font-size: 0.8rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 0.15rem; }
	.msg-panel__thread-unread { background: #ef4444; color: #fff; font-size: 0.7rem; font-weight: 700; min-width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; padding: 0 4px; flex-shrink: 0; }

	/* Messages inside thread */
	.msg-panel__messages {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 0;
	}

	.msg-panel__msg {
		display: flex;
		gap: 0.4rem;
		align-items: flex-end;
		max-width: 85%;
	}
	.msg-panel__msg--self {
		margin-left: auto;
		flex-direction: row-reverse;
	}

	.msg-panel__msg-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.msg-panel__msg-body { display: flex; flex-direction: column; }
	.msg-panel__msg-sender { font-size: 0.72rem; color: var(--muted); margin-bottom: 0.15rem; }

	.msg-panel__msg-bubble {
		padding: 0.5rem 0.7rem;
		border-radius: 12px;
		font-size: 0.85rem;
		line-height: 1.4;
		word-break: break-word;
		background: var(--bg);
		border: 1px solid var(--border);
	}
	.msg-panel__msg--self .msg-panel__msg-bubble {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.msg-panel__msg-time { font-size: 0.68rem; color: var(--muted); margin-top: 0.2rem; }
	.msg-panel__msg--self .msg-panel__msg-time { text-align: right; }

	/* Input area */
	.msg-panel__input {
		display: flex;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
		align-items: flex-end;
	}

	.msg-panel__textarea {
		flex: 1;
		padding: 0.5rem 0.6rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--fg);
		font-family: inherit;
		font-size: 0.85rem;
		resize: none;
		min-height: 36px;
		max-height: 100px;
	}
	.msg-panel__textarea:focus { outline: none; border-color: var(--accent); }

	.msg-panel__send {
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 50%;
		width: 36px;
		height: 36px;
		font-size: 1.1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: opacity 0.1s;
	}
	.msg-panel__send:disabled { opacity: 0.4; cursor: not-allowed; }
	.msg-panel__send:hover:not(:disabled) { opacity: 0.85; }

	@media (max-width: 480px) {
		.msg-panel { width: 100vw; }
	}
</style>
