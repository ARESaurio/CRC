// ============================================================
// Notifications Store (Svelte 5)
// ============================================================
// Fetches notifications from Supabase for the current user.
// Bell icon subscribes to `unreadCount`; dropdown uses `notifications`.
//
// Usage:
//   import { notifications, unreadCount, loadNotifications, markRead, markAllRead } from '$stores/notifications';
// ============================================================

import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/supabase';
import type { Notification } from '$lib/types';

export const notifications = writable<Notification[]>([]);
export const unreadCount = derived(notifications, ($n) => $n.filter((n) => !n.read).length);
export const notificationsLoaded = writable(false);

const FETCH_LIMIT = 30;

/**
 * Load recent notifications for the current user.
 * Called once on mount + when bell is opened.
 */
export async function loadNotifications(): Promise<void> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) {
		notifications.set([]);
		notificationsLoaded.set(true);
		return;
	}

	const { data, error } = await supabase
		.from('notifications')
		.select('*')
		.eq('user_id', session.user.id)
		.order('created_at', { ascending: false })
		.limit(FETCH_LIMIT);

	if (error) {
		console.error('Failed to load notifications:', error.message);
	} else {
		notifications.set((data as Notification[]) || []);
	}
	notificationsLoaded.set(true);
}

/**
 * Mark a single notification as read.
 */
export async function markRead(id: string): Promise<void> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return;

	const { error } = await supabase
		.from('notifications')
		.update({ read: true })
		.eq('id', id)
		.eq('user_id', session.user.id);

	if (!error) {
		notifications.update((all) =>
			all.map((n) => (n.id === id ? { ...n, read: true } : n))
		);
	}
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllRead(): Promise<void> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return;

	const { error } = await supabase
		.from('notifications')
		.update({ read: true })
		.eq('user_id', session.user.id)
		.eq('read', false);

	if (!error) {
		notifications.update((all) => all.map((n) => ({ ...n, read: true })));
	}
}

/**
 * Delete all notifications for the current user (clear the panel).
 */
export async function clearAll(): Promise<void> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return;

	const { error } = await supabase
		.from('notifications')
		.delete()
		.eq('user_id', session.user.id);

	if (!error) {
		notifications.set([]);
	}
}
