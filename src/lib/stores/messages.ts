// ============================================================
// Messages Store (Svelte 5)
// ============================================================
// Thread-based messaging. Inbox uses the get_inbox() RPC function.
// Messages are sent directly via Supabase (RLS enforced).
// Thread creation goes through the Worker (permission validation).
//
// Usage:
//   import { inbox, unreadMessages, loadInbox, loadThread, sendMessage, ... } from '$stores/messages';
// ============================================================

import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/supabase';
import { PUBLIC_WORKER_URL } from '$env/static/public';
import type { InboxThread, MessageWithSender } from '$lib/types';
import { stripTooltipSyntax } from '$lib/utils/markdown';

// ─── Stores ──────────────────────────────────────────────────

export const inbox = writable<InboxThread[]>([]);
export const inboxLoaded = writable(false);
export const unreadMessages = writable(0);

export const currentThread = writable<{
	thread_id: string;
	subject: string | null;
	thread_type: string;
	submission_type: string | null;
	submission_id: string | null;
	participants: { user_id: string; display_name: string; avatar_url: string | null; runner_id: string | null }[];
} | null>(null);

export const threadMessages = writable<MessageWithSender[]>([]);
export const threadLoaded = writable(false);

// ─── Inbox ───────────────────────────────────────────────────

export async function loadInbox(): Promise<void> {
	const { data, error } = await supabase.rpc('get_inbox');

	if (error) {
		console.error('Failed to load inbox:', error.message);
		inbox.set([]);
	} else {
		inbox.set((data as InboxThread[]) || []);
	}
	inboxLoaded.set(true);
}

export async function loadUnreadCount(): Promise<void> {
	const { data, error } = await supabase.rpc('get_unread_message_count');

	if (error) {
		console.error('Failed to load unread count:', error.message);
	} else {
		unreadMessages.set(data ?? 0);
	}
}

// ─── Thread View ─────────────────────────────────────────────

export async function loadThread(threadId: string): Promise<void> {
	threadLoaded.set(false);

	// Fetch thread metadata
	const { data: threadData } = await supabase
		.from('threads')
		.select('id, subject, type, submission_type, submission_id')
		.eq('id', threadId)
		.maybeSingle();

	if (!threadData) {
		currentThread.set(null);
		threadMessages.set([]);
		threadLoaded.set(true);
		return;
	}

	// Fetch participants with profile info
	const { data: participants } = await supabase
		.from('thread_participants')
		.select('user_id')
		.eq('thread_id', threadId);

	const userIds = (participants || []).map((p: any) => p.user_id);
	let profileMap: Record<string, { display_name: string; avatar_url: string | null; runner_id: string | null }> = {};

	if (userIds.length > 0) {
		const { data: profiles } = await supabase
			.from('profiles')
			.select('user_id, display_name, avatar_url, runner_id')
			.in('user_id', userIds);

		for (const p of profiles || []) {
			profileMap[p.user_id] = {
				display_name: p.display_name || 'Unknown',
				avatar_url: p.avatar_url,
				runner_id: p.runner_id,
			};
		}
	}

	currentThread.set({
		thread_id: threadData.id,
		subject: threadData.subject,
		thread_type: threadData.type,
		submission_type: threadData.submission_type,
		submission_id: threadData.submission_id,
		participants: userIds.map((uid: string) => ({
			user_id: uid,
			...(profileMap[uid] || { display_name: 'Unknown', avatar_url: null, runner_id: null }),
		})),
	});

	// Fetch messages
	const { data: msgs } = await supabase
		.from('messages')
		.select('*')
		.eq('thread_id', threadId)
		.order('created_at', { ascending: true });

	const enriched: MessageWithSender[] = (msgs || []).map((m: any) => ({
		...m,
		sender: profileMap[m.sender_id] || { display_name: 'Unknown', avatar_url: null, runner_id: null },
	}));

	threadMessages.set(enriched);
	threadLoaded.set(true);
}

// ─── Send Message ────────────────────────────────────────────

export async function sendMessage(threadId: string, content: string): Promise<boolean> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return false;

	const { error } = await supabase
		.from('messages')
		.insert({
			thread_id: threadId,
			sender_id: session.user.id,
			content: stripTooltipSyntax(content.trim()),
		});

	if (error) {
		console.error('Failed to send message:', error.message);
		return false;
	}

	// Reload thread messages
	await loadThread(threadId);
	return true;
}

// ─── Mark Thread as Read ─────────────────────────────────────

export async function markThreadRead(threadId: string): Promise<void> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return;

	await supabase
		.from('thread_participants')
		.update({ last_read_at: new Date().toISOString() })
		.eq('thread_id', threadId)
		.eq('user_id', session.user.id);

	// Update inbox unread count locally
	inbox.update((threads) =>
		threads.map((t) =>
			t.thread_id === threadId ? { ...t, unread_count: 0, last_read_at: new Date().toISOString() } : t
		)
	);

	await loadUnreadCount();
}

// ─── Create Thread (via Worker) ──────────────────────────────

export async function createThread(opts: {
	participant_ids: string[];
	subject?: string;
	type?: 'direct' | 'group';
	submission_type?: string;
	submission_id?: string;
	initial_message: string;
}): Promise<{ ok: boolean; thread_id?: string; error?: string }> {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session) return { ok: false, error: 'Not authenticated' };

	try {
		const res = await fetch(`${PUBLIC_WORKER_URL}/messages/create-thread`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`,
			},
			body: JSON.stringify(opts),
		});

		const data = await res.json();
		if (res.ok && data.ok) {
			return { ok: true, thread_id: data.thread_id };
		}
		return { ok: false, error: data.error || 'Failed to create thread' };
	} catch (err: any) {
		return { ok: false, error: err?.message || 'Network error' };
	}
}
