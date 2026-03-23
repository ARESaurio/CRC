// ═══════════════════════════════════════════════════════════════════════════════
// Game Editor Handlers — Save, Freeze, Delete, Rollback
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

import { jsonResponse } from '../lib/cors.js';
import { supabaseQuery } from '../lib/supabase.js';
import { authenticateAdmin } from '../lib/auth.js';
import { writeGameHistory, checkGameEditorAccess, buildChangeDescription, GAME_ALLOWED_FIELDS, GAME_ADMIN_ONLY_FIELDS } from '../lib/game-helpers.js';

export async function handleGameEditorSave(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // 1. Authenticate
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { game_id, section_name, updates } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (!section_name || typeof section_name !== 'string') {
    return jsonResponse({ error: 'Missing section_name' }, 400, env, request);
  }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return jsonResponse({ error: 'Missing or invalid updates' }, 400, env, request);
  }

  // 2. Check game-level access
  const access = await checkGameEditorAccess(env, auth.user.id, game_id);
  if (!access.allowed) {
    return jsonResponse({ error: 'No access to this game' }, 403, env, request);
  }

  // 3. Strip disallowed fields
  const sanitized = {};
  for (const key of Object.keys(updates)) {
    // Only allow known game fields
    if (!GAME_ALLOWED_FIELDS.includes(key)) continue;
    // Strip admin-only fields for non-admins
    if (!access.isAdmin && GAME_ADMIN_ONLY_FIELDS.includes(key)) continue;
    sanitized[key] = updates[key];
  }

  if (Object.keys(sanitized).length === 0) {
    return jsonResponse({ error: 'No valid fields to update' }, 400, env, request);
  }

  // 4. Check freeze state
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });

  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  if (currentGame.frozen_at && !access.isAdmin) {
    return jsonResponse({ error: 'Game is frozen. Only admins can edit frozen games.' }, 403, env, request);
  }

  // 5. Create snapshot (best-effort)
  try {
    await supabaseQuery(env, 'game_snapshots', {
      method: 'POST',
      body: {
        game_id,
        snapshot_data: currentGame,
        created_by: auth.user.id,
        description: `Before ${section_name} edit`
      }
    });
  } catch { /* best-effort */ }

  // 5b. Build human-readable change description
  const changeDesc = buildChangeDescription(currentGame, sanitized);

  // 5c. Auto-increment rules_version for rules-related sections + write changelog
  const RULES_SECTIONS = ['rules', 'challenges', 'restrictions', 'categories'];
  if (RULES_SECTIONS.includes(section_name)) {
    const newVersion = (currentGame.rules_version || 1) + 1;
    sanitized.rules_version = newVersion;

    // Write changelog entry (best-effort)
    try {
      const oldRulesData = {};
      for (const key of Object.keys(sanitized)) oldRulesData[key] = currentGame[key];
      await supabaseQuery(env, 'rules_changelog', {
        method: 'POST',
        body: {
          game_id,
          rules_version: newVersion,
          changed_by: auth.user.id,
          change_summary: body.change_summary || changeDesc || `${section_name} updated`,
          sections_changed: [section_name],
          old_rules: oldRulesData,
          new_rules: sanitized,
        },
      });
    } catch (err) {
      console.error('Rules changelog write failed:', err);
    }
  }

  // 6. Update game
  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, {
      method: 'PATCH',
      body: sanitized,
      headers: { Prefer: 'return=representation' }
    });

  if (!updateResult.ok) {
    return jsonResponse({ error: 'Save failed', detail: updateResult.data }, 500, env, request);
  }

  // 7. Audit log (best-effort)
  const oldData = {};
  for (const key of Object.keys(sanitized)) oldData[key] = currentGame[key];
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: `game_${section_name}_edited`,
        record_id: game_id,
        user_id: auth.user.id,
        old_data: oldData,
        new_data: sanitized
      }
    });
  } catch { /* best-effort */ }

  const updatedGame = Array.isArray(updateResult.data) ? updateResult.data[0] : updateResult.data;

  // Game history audit (single entry — the duplicate 'info_updated' call was removed)
  await writeGameHistory(env, {
    game_id,
    action: 'game_edited',
    target: section_name,
    note: changeDesc,
    actor_id: auth.user.id,
  });

  return jsonResponse({ ok: true, message: `${section_name} saved`, game: updatedGame }, 200, env, request);
}

// ── POST /game-editor/freeze ────────────────────────────────────────────────

export async function handleGameEditorFreeze(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // Only admins can freeze/unfreeze
  if (!auth.role.admin) {
    return jsonResponse({ error: 'Admin required to freeze/unfreeze' }, 403, env, request);
  }

  const { game_id, freeze } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (typeof freeze !== 'boolean') {
    return jsonResponse({ error: 'Missing freeze (boolean)' }, 400, env, request);
  }

  // Get current game state
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  // Create pre-freeze snapshot if freezing
  if (freeze) {
    try {
      await supabaseQuery(env, 'game_snapshots', {
        method: 'POST',
        body: {
          game_id,
          snapshot_data: currentGame,
          created_by: auth.user.id,
          description: 'Pre-freeze snapshot (automatic)'
        }
      });
    } catch { /* best-effort */ }
  }

  const updates = freeze
    ? { frozen_at: new Date().toISOString(), frozen_by: auth.user.id }
    : { frozen_at: null, frozen_by: null };

  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, {
      method: 'PATCH',
      body: updates
    });

  if (!updateResult.ok) {
    return jsonResponse({ error: 'Freeze/unfreeze failed' }, 500, env, request);
  }

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: freeze ? 'game_frozen' : 'game_unfrozen',
        record_id: game_id,
        user_id: auth.user.id,
        old_data: { frozen_at: currentGame.frozen_at },
        new_data: updates
      }
    });
  } catch { /* best-effort */ }

  // History audit
  writeGameHistory(env, {
    game_id,
    action: freeze ? 'game_frozen' : 'game_unfrozen',
    note: freeze ? 'Game frozen — edits disabled' : 'Game unfrozen — edits re-enabled',
    actor_id: auth.user.id,

  });

  return jsonResponse({
    ok: true,
    message: freeze ? 'Game frozen' : 'Game unfrozen',
    frozen_at: freeze ? updates.frozen_at : null,
    frozen_by: freeze ? updates.frozen_by : null
  }, 200, env, request);
}

// ── POST /game-editor/delete ────────────────────────────────────────────────

export async function handleGameEditorDelete(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // Only super admins can delete games
  if (!auth.role.superAdmin) {
    return jsonResponse({ error: 'Super admin required to delete games' }, 403, env, request);
  }

  const { game_id, confirm_game_id } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (confirm_game_id !== game_id) {
    return jsonResponse({ error: 'Confirmation game_id does not match' }, 400, env, request);
  }

  // Get current game for snapshot + audit
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  // Pre-deletion snapshot
  try {
    await supabaseQuery(env, 'game_snapshots', {
      method: 'POST',
      body: {
        game_id,
        snapshot_data: currentGame,
        created_by: auth.user.id,
        description: 'Pre-deletion snapshot (automatic)'
      }
    });
  } catch { /* best-effort */ }

  // Delete
  const deleteResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, { method: 'DELETE' });

  if (!deleteResult.ok) {
    return jsonResponse({ error: 'Delete failed' }, 500, env, request);
  }

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: 'game_deleted',
        record_id: game_id,
        user_id: auth.user.id,
        old_data: currentGame,
        new_data: null
      }
    });
  } catch { /* best-effort */ }

  return jsonResponse({ ok: true, message: 'Game deleted' }, 200, env, request);
}

// ── POST /game-editor/rollback ──────────────────────────────────────────────

export async function handleGameEditorRollback(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const { game_id, snapshot_id } = body;
  if (!game_id || typeof game_id !== 'string') {
    return jsonResponse({ error: 'Missing or invalid game_id' }, 400, env, request);
  }
  if (!snapshot_id || typeof snapshot_id !== 'string') {
    return jsonResponse({ error: 'Missing snapshot_id' }, 400, env, request);
  }

  // Check game-level access
  const access = await checkGameEditorAccess(env, auth.user.id, game_id);
  if (!access.allowed) {
    return jsonResponse({ error: 'No access to this game' }, 403, env, request);
  }

  // Get current game state for backup snapshot
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}&select=*`, { method: 'GET' });
  if (!gameResult.ok || !Array.isArray(gameResult.data) || gameResult.data.length === 0) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const currentGame = gameResult.data[0];

  // Fetch snapshot data
  const snapResult = await supabaseQuery(env,
    `game_snapshots?id=eq.${encodeURIComponent(snapshot_id)}&game_id=eq.${encodeURIComponent(game_id)}&select=snapshot_data`,
    { method: 'GET' });
  if (!snapResult.ok || !Array.isArray(snapResult.data) || snapResult.data.length === 0) {
    return jsonResponse({ error: 'Snapshot not found' }, 404, env, request);
  }

  const restored = snapResult.data[0].snapshot_data;
  // Remove non-data fields
  delete restored.created_at;
  delete restored.updated_at;

  // Create backup snapshot of current state
  try {
    await supabaseQuery(env, 'game_snapshots', {
      method: 'POST',
      body: {
        game_id,
        snapshot_data: currentGame,
        created_by: auth.user.id,
        description: `Pre-rollback backup (rolling back to snapshot ${snapshot_id.slice(0, 8)})`
      }
    });
  } catch { /* best-effort */ }

  // Apply rollback
  const updateResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(game_id)}`, {
      method: 'PATCH',
      body: restored,
      headers: { Prefer: 'return=representation' }
    });

  if (!updateResult.ok) {
    return jsonResponse({ error: 'Rollback failed' }, 500, env, request);
  }

  // Audit log
  try {
    await supabaseQuery(env, 'audit_log', {
      method: 'POST',
      body: {
        table_name: 'games',
        action: 'game_rollback',
        record_id: game_id,
        user_id: auth.user.id,
        old_data: { snapshot_id },
        new_data: { rolled_back_to: snapshot_id }
      }
    });
  } catch { /* best-effort */ }

  const updatedGame = Array.isArray(updateResult.data) ? updateResult.data[0] : updateResult.data;

  // History audit
  writeGameHistory(env, {
    game_id,
    action: 'game_rollback',
    note: `Rolled back to snapshot ${snapshot_id.slice(0, 8)}…`,
    actor_id: auth.user.id,

  });

  return jsonResponse({ ok: true, message: 'Rollback successful', game: updatedGame }, 200, env, request);
}
