<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Bell, CheckCircle, XCircle, Pencil, MessageSquare } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';
	import { goto } from '$app/navigation';
	import { localizeHref } from '$lib/paraglide/runtime';
	import {
		notifications,
		unreadCount,
		loadNotifications,
		markRead,
		markAllRead,
		clearAll,
		notificationsLoaded
	} from '$stores/notifications';
	import type { Notification } from '$lib/types';
	import * as Popover from '$lib/components/ui/popover/index.js';

	let { open = $bindable(false) } = $props();

	// Load notifications when popover first opens
	$effect(() => {
		if (open && !$notificationsLoaded) {
			loadNotifications();
		}
	});

	async function handleClick(n: Notification) {
		if (!n.read) await markRead(n.id);
		open = false;
		if (n.link) goto(localizeHref(n.link));
	}

	async function handleMarkAllRead(e: MouseEvent) {
		e.stopPropagation();
		await markAllRead();
	}

	async function handleClearAll(e: MouseEvent) {
		e.stopPropagation();
		await clearAll();
	}

	function icon(type: string): ComponentType {
		if (type.includes('approved')) return CheckCircle;
		if (type.includes('rejected')) return XCircle;
		if (type.includes('needs_changes')) return Pencil;
		if (type.includes('message')) return MessageSquare;
		return Bell;
	}

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		return `${Math.floor(days / 30)}mo ago`;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger class="notif-bell__btn" title="Notifications" aria-label="Notifications">
		<Bell size={18} />
		{#if $unreadCount > 0}
			<span class="notif-bell__badge">{$unreadCount > 9 ? '9+' : $unreadCount}</span>
		{/if}
	</Popover.Trigger>

	<Popover.Content class="notif-dropdown" sideOffset={8} align="end">
		<div class="notif-dropdown__header">
			<span class="notif-dropdown__title">{m.notif_title()}</span>
			{#if $unreadCount > 0}
				<button
					type="button"
					class="notif-dropdown__mark-all"
					onclick={handleMarkAllRead}
				>{m.notif_mark_read()}</button>
			{/if}
		</div>

		<div class="notif-dropdown__list">
			{#if !$notificationsLoaded}
				<div class="notif-dropdown__empty">{m.notif_loading()}</div>
			{:else if $notifications.length === 0}
				<div class="notif-dropdown__empty">{m.notif_empty()}</div>
			{:else}
				{#each $notifications as n (n.id)}
					<button
						type="button"
						class="notif-item"
						class:notif-item--unread={!n.read}
						onclick={() => handleClick(n)}
					>
						<span class="notif-item__icon"><svelte:component this={icon(n.type)} size={16} /></span>
						<div class="notif-item__content">
							<span class="notif-item__title">{n.title}</span>
							{#if n.message}
								<span class="notif-item__message">{n.message}</span>
							{/if}
							<span class="notif-item__time">{timeAgo(n.created_at)}</span>
						</div>
						{#if !n.read}
							<span class="notif-item__dot"></span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>

		{#if $notifications.length > 0}
			<div class="notif-dropdown__footer">
				<a href={localizeHref('/profile/submissions')} onclick={() => { open = false; }}>
					View all submissions →
				</a>
				<button
					type="button"
					class="notif-dropdown__clear"
					onclick={handleClearAll}
				>{m.notif_clear()}</button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>

<style>
	:global([data-popover-trigger].notif-bell__btn) {
		color: var(--fg);
	}
</style>
