// ═══════════════════════════════════════════════════════════════════════════════
// Supabase Helpers — Query, Notifications, Token Verification, Roles
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env, SupabaseResult, SupabaseUser, RoleInfo, SupabaseQueryOptions, NotificationOptions } from '../types/index.js';

export async function supabaseQuery(env: Env, path: string, opts: SupabaseQueryOptions = {}): Promise<SupabaseResult> {
  const { method = 'GET', body, headers: extra } = opts;
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
    ...extra,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

/**
 * Insert an in-app notification for a user.
 * Fire-and-forget — failures are logged but don't block the response.
 */
export async function insertNotification(env: Env, userId: string, type: string, title: string, opts: NotificationOptions = {}): Promise<void> {
  if (!userId) return;
  try {
    await supabaseQuery(env, 'notifications', {
      method: 'POST',
      body: {
        user_id: userId,
        type,
        title,
        message: opts.message || null,
        link: opts.link || null,
        metadata: opts.metadata || {},
      },
    });
  } catch (err) {
    console.error('insertNotification failed:', err);
  }
}

/** Verify a Supabase access token → returns user object or null */
export async function verifySupabaseToken(env: Env, accessToken: string): Promise<SupabaseUser | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) return null;
  return res.json() as Promise<SupabaseUser>;
}

/** Check user roles: admin, moderator, verifier (with per-game assignments) */
export async function isAdmin(env: Env, userId: string): Promise<RoleInfo> {
  const encodedUserId = encodeURIComponent(userId);

  // Query profile and both role tables in parallel
  const [profile, verifierResult, moderatorResult] = await Promise.all([
    supabaseQuery(env,
      `profiles?user_id=eq.${encodedUserId}&select=is_admin,is_super_admin,runner_id,role`, { method: 'GET' }),
    supabaseQuery(env,
      `role_game_verifiers?user_id=eq.${encodedUserId}&select=game_id`, { method: 'GET' }),
    supabaseQuery(env,
      `role_game_moderators?user_id=eq.${encodedUserId}&select=game_id`, { method: 'GET' })
  ]);

  // Collect per-game assignments
  const verifierGameIds = (verifierResult.ok && Array.isArray(verifierResult.data))
    ? (verifierResult.data as Array<{ game_id: string }>).map(r => r.game_id).filter(Boolean) : [];
  const moderatorGameIds = (moderatorResult.ok && Array.isArray(moderatorResult.data))
    ? (moderatorResult.data as Array<{ game_id: string }>).map(r => r.game_id).filter(Boolean) : [];
  const assignedGames = [...new Set([...verifierGameIds, ...moderatorGameIds])];

  // Build role flags from profile
  let isAdminFlag = false;
  let isSuperAdmin = false;
  let isModerator = false;
  let runnerId: string | null = null;

  if (profile.ok && Array.isArray(profile.data) && profile.data.length > 0) {
    const p = profile.data[0] as Record<string, unknown>;
    isSuperAdmin = p.is_super_admin === true;
    isAdminFlag = p.is_admin === true || isSuperAdmin;
    isModerator = p.role === 'moderator';
    runnerId = (p.runner_id as string) || null;
  }

  const hasVerifierRole = verifierGameIds.length > 0;
  const hasModeratorRole = moderatorGameIds.length > 0 || isModerator;

  return {
    admin: isAdminFlag,
    superAdmin: isSuperAdmin,
    moderator: hasModeratorRole,
    verifier: hasVerifierRole,
    runnerId,
    assignedGames
  };
}
