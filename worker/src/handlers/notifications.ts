// ═══════════════════════════════════════════════════════════════════════════════
// Notification Handlers — Notify, Profile Submitted, Review Rule Suggestion
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput } from '../lib/utils.js';
import { supabaseQuery, insertNotification } from '../lib/supabase.js';
import { authenticateAdmin, authenticateUser } from '../lib/auth.js';
import { sendDiscordNotification } from '../lib/discord.js';

export async function handleNotify(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { action, entity_type, entity_name, entity_id, reason, notes } = body;
  if (!action || !entity_type) {
    return jsonResponse({ error: 'Missing action or entity_type' }, 400, env, request);
  }

  const colors = { rejected: 0xdc3545, needs_changes: 0x17a2b8, approved: 0x28a745 };
  const icons = { rejected: '❌', needs_changes: '✏️', approved: '✅' };
  const typeLabels = { run: '🏃 Run', profile: '👤 Profile', game: '🎮 Game' };

  const fields = [
    { name: 'Type', value: typeLabels[entity_type] || entity_type, inline: true },
    { name: 'Name', value: entity_name || entity_id || '—', inline: true },
  ];
  if (reason) fields.push({ name: 'Reason', value: reason, inline: false });
  if (notes) fields.push({ name: 'Notes', value: notes, inline: false });

  // Route to the right channel based on entity type
  const channelMap = { run: 'runs', profile: 'profiles', game: 'games' };
  const channel = channelMap[entity_type] || 'runs';

  await sendDiscordNotification(env, channel, {
    title: `${icons[action] || '📢'} ${(action || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${entity_name || entity_id || 'Unknown'}`,
    color: colors[action] || 0x6c757d,
    fields,
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({ ok: true }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /notify-profile-submitted (Discord notification for new profile)
// Any authenticated user can call this — only sends a notification, no DB writes.
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleNotifyProfileSubmitted(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const displayName = sanitizeInput(body.display_name || '');
  const runnerId = sanitizeInput(body.runner_id || '');

  if (!displayName && !runnerId) {
    return jsonResponse({ error: 'Missing display_name or runner_id' }, 400, env, request);
  }

  await sendDiscordNotification(env, 'profiles', {
    title: '📋 New Profile Submitted for Review',
    url: 'https://www.challengerun.net/admin/profiles',
    color: 0xf0ad4e,
    fields: [
      { name: 'Display Name', value: displayName || '—', inline: true },
      { name: 'Runner ID', value: runnerId || '—', inline: true },
      { name: 'Review', value: '[Open Admin Panel](https://www.challengerun.net/admin/profiles)', inline: false },
    ],
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({ ok: true }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /review-rule-suggestion (Admin reviews a rule suggestion)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleReviewRuleSuggestion(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);
  if (!auth.role.admin) return jsonResponse({ error: 'Admin required' }, 403, env, request);

  const { suggestion_id, status, admin_response } = body;
  if (!suggestion_id) return jsonResponse({ error: 'Missing suggestion_id' }, 400, env, request);
  if (!['accepted', 'rejected', 'noted'].includes(status)) {
    return jsonResponse({ error: 'Invalid status. Must be accepted, rejected, or noted.' }, 400, env, request);
  }

  // Fetch the suggestion
  const sugResult = await supabaseQuery(env,
    `rule_suggestions?id=eq.${encodeURIComponent(suggestion_id)}&select=*`, { method: 'GET' });
  if (!sugResult.ok || !sugResult.data?.length) {
    return jsonResponse({ error: 'Suggestion not found' }, 404, env, request);
  }
  const suggestion = sugResult.data[0];

  if (suggestion.status !== 'pending') {
    return jsonResponse({ error: 'Suggestion has already been reviewed' }, 400, env, request);
  }

  // Update the suggestion
  const patchResult = await supabaseQuery(env,
    `rule_suggestions?id=eq.${encodeURIComponent(suggestion_id)}`, {
      method: 'PATCH',
      body: {
        status,
        admin_response: admin_response ? sanitizeInput(admin_response, 500) : null,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
      },
    });

  if (!patchResult.ok) {
    return jsonResponse({ error: 'Failed to update suggestion' }, 500, env, request);
  }

  // Notify the user
  const statusLabels = { accepted: 'accepted', rejected: 'reviewed', noted: 'noted for consideration' };
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(suggestion.game_id)}&select=game_name`, { method: 'GET' });
  const gameName = (gameResult.ok && gameResult.data?.length) ? gameResult.data[0].game_name : suggestion.game_id;

  await insertNotification(env, suggestion.user_id, `rule_suggestion_${status}`,
    `Your rule suggestion for ${gameName} was ${statusLabels[status]}`,
    {
      message: admin_response || null,
      link: `/games/${suggestion.game_id}`,
      metadata: { suggestion_id, game_id: suggestion.game_id, status },
    }
  );

  return jsonResponse({ ok: true, message: `Suggestion ${status}` }, 200, env, request);
}
