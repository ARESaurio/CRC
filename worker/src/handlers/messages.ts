// ═══════════════════════════════════════════════════════════════════════════════
// Message Handler — Create Thread
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput, isValidId } from '../lib/utils.js';
import { supabaseQuery, isAdmin, insertNotification } from '../lib/supabase.js';
import { authenticateUser } from '../lib/auth.js';

export async function handleCreateThread(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { participant_ids, subject, type, submission_type, submission_id, initial_message } = body;

  // Validate required fields
  if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
    return jsonResponse({ error: 'At least one participant is required' }, 400, env, request);
  }
  if (!initial_message || typeof initial_message !== 'string' || initial_message.trim().length === 0) {
    return jsonResponse({ error: 'Initial message is required' }, 400, env, request);
  }
  if (initial_message.trim().length > 2000) {
    return jsonResponse({ error: 'Message too long (max 2000 characters)' }, 400, env, request);
  }
  if (participant_ids.length > 10) {
    return jsonResponse({ error: 'Maximum 10 participants per thread' }, 400, env, request);
  }

  // Validate all participant IDs are valid UUIDs
  for (const pid of participant_ids) {
    if (!isValidId(pid)) {
      return jsonResponse({ error: `Invalid participant ID: ${pid}` }, 400, env, request);
    }
  }

  // Remove self from participant list if included (we add self automatically)
  const otherIds = participant_ids.filter(id => id !== auth.user.id);
  if (otherIds.length === 0) {
    return jsonResponse({ error: 'Cannot create a thread with only yourself' }, 400, env, request);
  }

  // Determine thread type
  let threadType = type || (otherIds.length === 1 ? 'direct' : 'group');
  if (submission_type && submission_id) {
    threadType = 'submission';
  }

  // Check if sender is staff
  const senderRole = await isAdmin(env, auth.user.id);
  const senderIsStaff = senderRole.admin || senderRole.verifier || senderRole.moderator;

  // If sender is NOT staff, verify all other participants ARE staff
  if (!senderIsStaff) {
    for (const pid of otherIds) {
      const recipientRole = await isAdmin(env, pid);
      const recipientIsStaff = recipientRole.admin || recipientRole.verifier || recipientRole.moderator;
      if (!recipientIsStaff) {
        return jsonResponse({
          error: 'You can only send messages to staff members. If you need to contact another runner, please reach out via the community Discord.'
        }, 403, env, request);
      }
    }
  }

  // For direct threads, check if a thread already exists between these two users
  if (threadType === 'direct' && otherIds.length === 1) {
    const existingResult = await supabaseQuery(env,
      `thread_participants?user_id=eq.${encodeURIComponent(auth.user.id)}&select=thread_id`, { method: 'GET' });
    if (existingResult.ok && existingResult.data?.length) {
      const myThreadIds = existingResult.data.map(r => r.thread_id);
      // Check if the other user is in any of these threads that are 'direct' type
      for (const tid of myThreadIds) {
        const checkResult = await supabaseQuery(env,
          `threads?id=eq.${encodeURIComponent(tid)}&type=eq.direct&select=id`, { method: 'GET' });
        if (checkResult.ok && checkResult.data?.length) {
          const otherCheck = await supabaseQuery(env,
            `thread_participants?thread_id=eq.${encodeURIComponent(tid)}&user_id=eq.${encodeURIComponent(otherIds[0])}&select=id`,
            { method: 'GET' });
          if (otherCheck.ok && otherCheck.data?.length) {
            // Thread exists — add message to it instead
            await supabaseQuery(env, 'messages', {
              method: 'POST',
              body: {
                thread_id: tid,
                sender_id: auth.user.id,
                content: sanitizeInput(initial_message.trim(), 2000),
              },
            });
            return jsonResponse({
              ok: true,
              thread_id: tid,
              message: 'Message added to existing conversation',
            }, 200, env, request);
          }
        }
      }
    }
  }

  const now = new Date().toISOString();

  // Create thread
  const threadInsert = await supabaseQuery(env, 'threads', {
    method: 'POST',
    body: {
      subject: subject ? sanitizeInput(subject, 200) : null,
      type: threadType,
      submission_type: submission_type || null,
      submission_id: submission_id || null,
      created_by: auth.user.id,
      created_at: now,
      updated_at: now,
    },
  });

  if (!threadInsert.ok || !threadInsert.data?.length) {
    console.error('Failed to create thread:', threadInsert.data);
    return jsonResponse({ error: 'Failed to create thread' }, 500, env, request);
  }

  const threadId = threadInsert.data[0].id;

  // Add all participants (including sender)
  const allParticipants = [auth.user.id, ...otherIds];
  const participantRows = allParticipants.map(uid => ({
    thread_id: threadId,
    user_id: uid,
    last_read_at: uid === auth.user.id ? now : null,
    joined_at: now,
  }));

  const tpInsert = await supabaseQuery(env, 'thread_participants', {
    method: 'POST',
    body: participantRows,
  });

  if (!tpInsert.ok) {
    console.error('Failed to add participants:', tpInsert.data);
    // Clean up the thread
    await supabaseQuery(env, `threads?id=eq.${encodeURIComponent(threadId)}`, { method: 'DELETE' });
    return jsonResponse({ error: 'Failed to create thread' }, 500, env, request);
  }

  // Insert initial message
  const msgInsert = await supabaseQuery(env, 'messages', {
    method: 'POST',
    body: {
      thread_id: threadId,
      sender_id: auth.user.id,
      content: sanitizeInput(initial_message.trim(), 2000),
      created_at: now,
    },
  });

  if (!msgInsert.ok) {
    console.error('Failed to insert initial message:', msgInsert.data);
  }

  // Send notification to other participants
  for (const pid of otherIds) {
    await insertNotification(env, pid, 'message_received',
      subject ? `New message: ${sanitizeInput(subject, 100)}` : 'You have a new message',
      {
        message: sanitizeInput(initial_message.trim(), 200),
        link: `/messages/${threadId}`,
        metadata: { thread_id: threadId },
      }
    );
  }

  return jsonResponse({
    ok: true,
    thread_id: threadId,
    message: 'Thread created',
  }, 200, env, request);
}
