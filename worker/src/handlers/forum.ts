// ═══════════════════════════════════════════════════════════════════════════════
// Forum Handler — Threads, Posts, Moderation
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';
import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput } from '../lib/utils.js';
import { supabaseQuery, isAdmin } from '../lib/supabase.js';
import { authenticateUser } from '../lib/auth.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireApprovedProfile(env: Env, userId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=status`,
    { method: 'GET' });
  if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
    return { ok: false, error: 'Profile not found.' };
  }
  if ((result.data[0] as any).status !== 'approved') {
    return { ok: false, error: 'An approved profile is required to post on the forum.' };
  }
  return { ok: true };
}

async function adjustPostCount(env: Env, userId: string, delta: number): Promise<void> {
  try {
    const r = await supabaseQuery(env,
      `profiles?user_id=eq.${encodeURIComponent(userId)}&select=forum_post_count`,
      { method: 'GET' });
    if (r.ok && Array.isArray(r.data) && r.data.length > 0) {
      const current = (r.data[0] as any).forum_post_count || 0;
      await supabaseQuery(env, `profiles?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: { forum_post_count: Math.max(0, current + delta) },
      });
    }
  } catch { /* best-effort */ }
}

async function refreshThreadMeta(env: Env, threadId: string, lastPostBy: string): Promise<void> {
  const tid = encodeURIComponent(threadId);
  const countResult = await supabaseQuery(env,
    `forum_posts?thread_id=eq.${tid}&select=id`, { method: 'GET' });
  const total = Array.isArray(countResult.data) ? countResult.data.length : 1;
  await supabaseQuery(env, `forum_threads?id=eq.${tid}`, {
    method: 'PATCH',
    body: {
      reply_count: Math.max(0, total - 1),
      last_post_at: new Date().toISOString(),
      last_post_by: lastPostBy,
      updated_at: new Date().toISOString(),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE THREAD
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleForumCreateThread(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const profile = await requireApprovedProfile(env, auth.user.id);
  if (!profile.ok) return jsonResponse({ error: profile.error }, 403, env, request);

  const { board_id, title, body: postBody, game_id } = body;

  if (!board_id || typeof board_id !== 'string')
    return jsonResponse({ error: 'board_id is required' }, 400, env, request);
  if (!title || typeof title !== 'string' || title.trim().length < 3)
    return jsonResponse({ error: 'Title must be at least 3 characters' }, 400, env, request);
  if (title.trim().length > 200)
    return jsonResponse({ error: 'Title too long (max 200 characters)' }, 400, env, request);
  if (!postBody || typeof postBody !== 'string' || (postBody as string).trim().length < 1)
    return jsonResponse({ error: 'Post body is required' }, 400, env, request);
  if ((postBody as string).trim().length > 10000)
    return jsonResponse({ error: 'Post body too long (max 10,000 characters)' }, 400, env, request);

  // Verify board exists
  const boardResult = await supabaseQuery(env,
    `forum_boards?id=eq.${encodeURIComponent(board_id)}&select=id,game_id`, { method: 'GET' });
  if (!boardResult.ok || !Array.isArray(boardResult.data) || boardResult.data.length === 0)
    return jsonResponse({ error: 'Board not found' }, 404, env, request);

  const board = boardResult.data[0] as any;
  const threadGameId = (game_id && typeof game_id === 'string') ? game_id : board.game_id;

  // Insert thread
  const threadResult = await supabaseQuery(env, 'forum_threads', {
    method: 'POST',
    body: {
      board_id,
      game_id: threadGameId,
      author_id: auth.user.id,
      title: sanitizeInput(title, 200),
      last_post_by: auth.user.id,
    },
  });

  if (!threadResult.ok || !Array.isArray(threadResult.data) || threadResult.data.length === 0) {
    console.error('Failed to create thread:', threadResult.data);
    return jsonResponse({ error: 'Failed to create thread' }, 500, env, request);
  }

  const threadId = (threadResult.data[0] as any).id;

  // Insert opening post
  const postResult = await supabaseQuery(env, 'forum_posts', {
    method: 'POST',
    body: { thread_id: threadId, author_id: auth.user.id, body: sanitizeInput(postBody, 10000) },
  });

  if (!postResult.ok) {
    await supabaseQuery(env, `forum_threads?id=eq.${encodeURIComponent(threadId)}`, { method: 'DELETE' });
    return jsonResponse({ error: 'Failed to create post' }, 500, env, request);
  }

  await adjustPostCount(env, auth.user.id, 1);

  return jsonResponse({ ok: true, thread_id: threadId }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE POST (reply)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleForumCreatePost(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const profile = await requireApprovedProfile(env, auth.user.id);
  if (!profile.ok) return jsonResponse({ error: profile.error }, 403, env, request);

  const { thread_id, body: postBody } = body;

  if (!thread_id || typeof thread_id !== 'string')
    return jsonResponse({ error: 'thread_id is required' }, 400, env, request);
  if (!postBody || typeof postBody !== 'string' || (postBody as string).trim().length < 1)
    return jsonResponse({ error: 'Post body is required' }, 400, env, request);
  if ((postBody as string).trim().length > 10000)
    return jsonResponse({ error: 'Post body too long (max 10,000 characters)' }, 400, env, request);

  // Verify thread exists and is not locked
  const threadResult = await supabaseQuery(env,
    `forum_threads?id=eq.${encodeURIComponent(thread_id)}&select=id,is_locked`, { method: 'GET' });
  if (!threadResult.ok || !Array.isArray(threadResult.data) || threadResult.data.length === 0)
    return jsonResponse({ error: 'Thread not found' }, 404, env, request);
  if ((threadResult.data[0] as any).is_locked)
    return jsonResponse({ error: 'This thread is locked' }, 403, env, request);

  // Insert post
  const postResult = await supabaseQuery(env, 'forum_posts', {
    method: 'POST',
    body: { thread_id, author_id: auth.user.id, body: sanitizeInput(postBody, 10000) },
  });

  if (!postResult.ok || !Array.isArray(postResult.data) || postResult.data.length === 0)
    return jsonResponse({ error: 'Failed to create post' }, 500, env, request);

  const postId = (postResult.data[0] as any).id;

  await refreshThreadMeta(env, thread_id, auth.user.id);
  await adjustPostCount(env, auth.user.id, 1);

  return jsonResponse({ ok: true, post_id: postId }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT POST
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleForumEditPost(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { post_id, body: postBody } = body;

  if (!post_id || typeof post_id !== 'string')
    return jsonResponse({ error: 'post_id is required' }, 400, env, request);
  if (!postBody || typeof postBody !== 'string' || (postBody as string).trim().length < 1)
    return jsonResponse({ error: 'Post body is required' }, 400, env, request);
  if ((postBody as string).trim().length > 10000)
    return jsonResponse({ error: 'Post body too long (max 10,000 characters)' }, 400, env, request);

  const pid = encodeURIComponent(post_id);
  const postResult = await supabaseQuery(env,
    `forum_posts?id=eq.${pid}&select=id,author_id,edit_count`, { method: 'GET' });
  if (!postResult.ok || !Array.isArray(postResult.data) || postResult.data.length === 0)
    return jsonResponse({ error: 'Post not found' }, 404, env, request);

  const post = postResult.data[0] as any;
  const role = await isAdmin(env, auth.user.id);
  if (post.author_id !== auth.user.id && !role.admin)
    return jsonResponse({ error: 'You can only edit your own posts' }, 403, env, request);

  const updateResult = await supabaseQuery(env, `forum_posts?id=eq.${pid}`, {
    method: 'PATCH',
    body: {
      body: sanitizeInput(postBody, 10000),
      edit_count: (post.edit_count || 0) + 1,
      edited_at: new Date().toISOString(),
    },
  });

  if (!updateResult.ok) return jsonResponse({ error: 'Failed to update post' }, 500, env, request);
  return jsonResponse({ ok: true }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE POST (admin/mod or author)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleForumDeletePost(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { post_id } = body;
  if (!post_id || typeof post_id !== 'string')
    return jsonResponse({ error: 'post_id is required' }, 400, env, request);

  const pid = encodeURIComponent(post_id as string);
  const postResult = await supabaseQuery(env,
    `forum_posts?id=eq.${pid}&select=id,author_id,thread_id`, { method: 'GET' });
  if (!postResult.ok || !Array.isArray(postResult.data) || postResult.data.length === 0)
    return jsonResponse({ error: 'Post not found' }, 404, env, request);

  const post = postResult.data[0] as any;
  const role = await isAdmin(env, auth.user.id);
  if (post.author_id !== auth.user.id && !role.admin && !role.moderator)
    return jsonResponse({ error: 'Insufficient permissions' }, 403, env, request);

  // Check if OP — delete whole thread
  const firstResult = await supabaseQuery(env,
    `forum_posts?thread_id=eq.${encodeURIComponent(post.thread_id)}&select=id&order=created_at.asc&limit=1`,
    { method: 'GET' });
  const isOP = firstResult.ok && Array.isArray(firstResult.data) && firstResult.data.length > 0
    && (firstResult.data[0] as any).id === post_id;

  if (isOP) {
    await supabaseQuery(env, `forum_threads?id=eq.${encodeURIComponent(post.thread_id)}`, { method: 'DELETE' });
  } else {
    await supabaseQuery(env, `forum_posts?id=eq.${pid}`, { method: 'DELETE' });
    // Recount replies
    const countResult = await supabaseQuery(env,
      `forum_posts?thread_id=eq.${encodeURIComponent(post.thread_id)}&select=id`, { method: 'GET' });
    const replyCount = Math.max(0, (Array.isArray(countResult.data) ? countResult.data.length : 1) - 1);
    await supabaseQuery(env, `forum_threads?id=eq.${encodeURIComponent(post.thread_id)}`, {
      method: 'PATCH', body: { reply_count: replyCount },
    });
  }

  await adjustPostCount(env, post.author_id, -1);
  return jsonResponse({ ok: true }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOD THREAD (pin/lock/delete — admin/mod only)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleForumModThread(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const role = await isAdmin(env, auth.user.id);
  if (!role.admin && !role.moderator)
    return jsonResponse({ error: 'Insufficient permissions' }, 403, env, request);

  const { thread_id, action } = body;
  if (!thread_id || typeof thread_id !== 'string')
    return jsonResponse({ error: 'thread_id is required' }, 400, env, request);
  if (!action || !['pin', 'unpin', 'lock', 'unlock', 'delete'].includes(action as string))
    return jsonResponse({ error: 'Invalid action (pin/unpin/lock/unlock/delete)' }, 400, env, request);

  const tid = encodeURIComponent(thread_id as string);

  if (action === 'delete') {
    await supabaseQuery(env, `forum_threads?id=eq.${tid}`, { method: 'DELETE' });
    return jsonResponse({ ok: true }, 200, env, request);
  }

  const updates: Record<string, boolean> = {};
  if (action === 'pin') updates.is_pinned = true;
  if (action === 'unpin') updates.is_pinned = false;
  if (action === 'lock') updates.is_locked = true;
  if (action === 'unlock') updates.is_locked = false;

  await supabaseQuery(env, `forum_threads?id=eq.${tid}`, { method: 'PATCH', body: updates });
  return jsonResponse({ ok: true }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW THREAD (increment view count — no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleForumViewThread(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const { thread_id } = body;
  if (!thread_id || typeof thread_id !== 'string')
    return jsonResponse({ error: 'thread_id is required' }, 400, env, request);

  const tid = encodeURIComponent(thread_id as string);
  const result = await supabaseQuery(env,
    `forum_threads?id=eq.${tid}&select=view_count`, { method: 'GET' });

  if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
    const current = (result.data[0] as any).view_count || 0;
    await supabaseQuery(env, `forum_threads?id=eq.${tid}`, {
      method: 'PATCH', body: { view_count: current + 1 },
    });
  }

  return jsonResponse({ ok: true }, 200, env, request);
}
