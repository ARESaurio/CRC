// ═══════════════════════════════════════════════════════════════════════════════
// Contribution Handlers — CRUD for contributions + contribution types
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';
import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput, isValidId, isValidSlug } from '../lib/utils.js';
import { supabaseQuery, insertNotification } from '../lib/supabase.js';
import { authenticateAdmin } from '../lib/auth.js';

// ─── Helper: check if user can manage contributions for a game ──────────────
function canActOnGame(auth: any, gameId: string): boolean {
  if (auth.role.admin) return true;
  return auth.role.assignedGames?.includes(gameId) ?? false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /add-contribution
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleAddContribution(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const gameId = body.game_id;
  const runnerId = body.runner_id;
  const type = body.type || 'other';

  if (!gameId || typeof gameId !== 'string') return jsonResponse({ error: 'Missing game_id' }, 400, env, request);
  if (!runnerId || typeof runnerId !== 'string') return jsonResponse({ error: 'Missing runner_id' }, 400, env, request);

  if (!canActOnGame(auth, gameId)) {
    return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
  }

  // Verify game exists
  const gameResult = await supabaseQuery(env,
    `games?game_id=eq.${encodeURIComponent(gameId)}&select=game_id,game_name`, { method: 'GET' });
  if (!gameResult.ok || !gameResult.data?.length) {
    return jsonResponse({ error: 'Game not found' }, 404, env, request);
  }
  const gameName = gameResult.data[0].game_name;

  const row = {
    game_id: sanitizeInput(gameId, 100),
    runner_id: sanitizeInput(runnerId, 60),
    type: sanitizeInput(type as string, 50),
    title: body.title ? sanitizeInput(body.title as string, 200) : null,
    description: body.description ? sanitizeInput(body.description as string, 500) : null,
    url: body.url ? sanitizeInput(body.url as string, 500) : null,
    added_by: auth.user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Validate URL if provided
  if (row.url) {
    try { new URL(row.url); } catch { return jsonResponse({ error: 'Invalid URL' }, 400, env, request); }
  }

  const result = await supabaseQuery(env, 'contributions', {
    method: 'POST',
    body: row,
  });

  if (!result.ok) {
    console.error('Failed to add contribution:', result.data);
    return jsonResponse({ error: 'Failed to add contribution' }, 500, env, request);
  }

  // Notify the runner
  const profile = await supabaseQuery(env,
    `profiles?runner_id=eq.${encodeURIComponent(runnerId)}&select=user_id`, { method: 'GET' });
  if (profile.ok && profile.data?.length && profile.data[0].user_id) {
    await insertNotification(env, profile.data[0].user_id, 'contribution_added',
      `You were credited on ${gameName}`,
      {
        message: `${row.type}${row.title ? ': ' + row.title : ''} — added by ${auth.role.runnerId || 'a staff member'}`,
        link: `/runners/${runnerId}`,
        metadata: { game_id: gameId, type: row.type },
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Contribution added.', data: result.data }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /edit-contribution
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleEditContribution(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const id = body.id;
  if (!id || typeof id !== 'string') return jsonResponse({ error: 'Missing contribution id' }, 400, env, request);
  if (!isValidId(id)) return jsonResponse({ error: 'Invalid id format' }, 400, env, request);

  // Fetch existing contribution
  const existing = await supabaseQuery(env,
    `contributions?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' });
  if (!existing.ok || !existing.data?.length) {
    return jsonResponse({ error: 'Contribution not found' }, 404, env, request);
  }
  const old = existing.data[0];

  if (!canActOnGame(auth, old.game_id)) {
    return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
  }

  // Build update payload
  const ALLOWED = ['type', 'title', 'description', 'url'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changes: string[] = [];

  for (const key of ALLOWED) {
    if (body[key] !== undefined) {
      const val = body[key] === null ? null : sanitizeInput(body[key] as string, key === 'description' ? 500 : 200);
      if (key === 'url' && val) {
        try { new URL(val); } catch { return jsonResponse({ error: 'Invalid URL' }, 400, env, request); }
      }
      updates[key] = val;
      if (String(old[key] ?? '') !== String(val ?? '')) {
        changes.push(`${key}: ${old[key] || '(empty)'} → ${val || '(empty)'}`);
      }
    }
  }

  if (changes.length === 0) {
    return jsonResponse({ error: 'No changes detected' }, 400, env, request);
  }

  const result = await supabaseQuery(env,
    `contributions?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: updates,
    });

  if (!result.ok) {
    console.error('Failed to edit contribution:', result.data);
    return jsonResponse({ error: 'Failed to update contribution' }, 500, env, request);
  }

  // Notify the runner
  const profile = await supabaseQuery(env,
    `profiles?runner_id=eq.${encodeURIComponent(old.runner_id)}&select=user_id`, { method: 'GET' });
  if (profile.ok && profile.data?.length && profile.data[0].user_id) {
    await insertNotification(env, profile.data[0].user_id, 'contribution_edited',
      `Your contribution on ${old.game_id} was updated`,
      {
        message: `${changes.join('; ')} — by ${auth.role.runnerId || 'a staff member'}`,
        link: `/runners/${old.runner_id}`,
        metadata: { game_id: old.game_id, contribution_id: id },
      }
    );
  }

  return jsonResponse({ ok: true, message: `Contribution updated (${changes.length} change${changes.length !== 1 ? 's' : ''}).` }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /delete-contribution
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleDeleteContribution(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const id = body.id;
  if (!id || typeof id !== 'string') return jsonResponse({ error: 'Missing contribution id' }, 400, env, request);
  if (!isValidId(id)) return jsonResponse({ error: 'Invalid id format' }, 400, env, request);

  // Fetch existing to check permissions and for notification
  const existing = await supabaseQuery(env,
    `contributions?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' });
  if (!existing.ok || !existing.data?.length) {
    return jsonResponse({ error: 'Contribution not found' }, 404, env, request);
  }
  const old = existing.data[0];

  if (!canActOnGame(auth, old.game_id)) {
    return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
  }

  const result = await supabaseQuery(env,
    `contributions?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });

  if (!result.ok) {
    console.error('Failed to delete contribution:', result.data);
    return jsonResponse({ error: 'Failed to delete contribution' }, 500, env, request);
  }

  // Notify the runner
  const profile = await supabaseQuery(env,
    `profiles?runner_id=eq.${encodeURIComponent(old.runner_id)}&select=user_id`, { method: 'GET' });
  if (profile.ok && profile.data?.length && profile.data[0].user_id) {
    await insertNotification(env, profile.data[0].user_id, 'contribution_removed',
      `A contribution was removed from ${old.game_id}`,
      {
        message: `${old.type}${old.title ? ': ' + old.title : ''} — removed by ${auth.role.runnerId || 'a staff member'}`,
        link: `/runners/${old.runner_id}`,
        metadata: { game_id: old.game_id },
      }
    );
  }

  return jsonResponse({ ok: true, message: 'Contribution removed.' }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /add-contribution-type (per-game custom type)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleAddContributionType(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const label = body.label;
  const gameId = body.game_id; // null = global (admin only), non-null = per-game

  if (!label || typeof label !== 'string') return jsonResponse({ error: 'Missing label' }, 400, env, request);

  // Only admins can create global types
  if (!gameId && !auth.role.admin) {
    return jsonResponse({ error: 'Only admins can create global contribution types' }, 403, env, request);
  }

  if (gameId && typeof gameId === 'string') {
    if (!canActOnGame(auth, gameId)) {
      return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
    }
  }

  const sanitizedLabel = sanitizeInput(label, 50);
  // Generate slug from label
  const slug = sanitizedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (!slug) return jsonResponse({ error: 'Invalid label — cannot generate slug' }, 400, env, request);

  const row = {
    slug,
    label: sanitizedLabel,
    game_id: gameId ? sanitizeInput(gameId as string, 100) : null,
    created_at: new Date().toISOString(),
  };

  const result = await supabaseQuery(env, 'contribution_types', {
    method: 'POST',
    body: row,
  });

  if (!result.ok) {
    // Likely duplicate
    if (JSON.stringify(result.data).includes('duplicate') || JSON.stringify(result.data).includes('unique')) {
      return jsonResponse({ error: `A contribution type "${slug}" already exists for this scope` }, 409, env, request);
    }
    console.error('Failed to add contribution type:', result.data);
    return jsonResponse({ error: 'Failed to add contribution type' }, 500, env, request);
  }

  return jsonResponse({ ok: true, message: 'Contribution type added.', data: result.data }, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /delete-contribution-type (per-game only, not globals)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleDeleteContributionType(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  const auth = await authenticateAdmin(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const id = body.id;
  if (!id || typeof id !== 'string') return jsonResponse({ error: 'Missing id' }, 400, env, request);
  if (!isValidId(id)) return jsonResponse({ error: 'Invalid id format' }, 400, env, request);

  // Fetch to check it's per-game (not global) and check permissions
  const existing = await supabaseQuery(env,
    `contribution_types?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' });
  if (!existing.ok || !existing.data?.length) {
    return jsonResponse({ error: 'Contribution type not found' }, 404, env, request);
  }
  const ct = existing.data[0];

  // Only admins can delete global types
  if (!ct.game_id && !auth.role.admin) {
    return jsonResponse({ error: 'Only admins can delete global contribution types' }, 403, env, request);
  }

  if (ct.game_id && !canActOnGame(auth, ct.game_id)) {
    return jsonResponse({ error: 'Not authorized for this game' }, 403, env, request);
  }

  const result = await supabaseQuery(env,
    `contribution_types?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });

  if (!result.ok) {
    console.error('Failed to delete contribution type:', result.data);
    return jsonResponse({ error: 'Failed to delete contribution type' }, 500, env, request);
  }

  return jsonResponse({ ok: true, message: 'Contribution type removed.' }, 200, env, request);
}
