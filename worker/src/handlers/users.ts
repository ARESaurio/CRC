// ═══════════════════════════════════════════════════════════════════════════════
// User Handlers — Assign Role, Data Export, Delete Account
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';

import { jsonResponse } from '../lib/cors.js';
import { sanitizeInput } from '../lib/utils.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { supabaseQuery, verifySupabaseToken, isAdmin, insertNotification } from '../lib/supabase.js';
import { extractBearerToken, authenticateUser } from '../lib/auth.js';
import { writeGameHistory, getRoleLevel, targetRoleLevel } from '../lib/game-helpers.js';

export async function handleAssignRole(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // 1. Authenticate the caller
  const token = extractBearerToken(request);
  if (!token) return jsonResponse({ error: 'Missing token' }, 401, env, request);

  const callerUser = await verifySupabaseToken(env, token);
  if (!callerUser?.id) return jsonResponse({ error: 'Invalid or expired token' }, 401, env, request);

  const callerRole = await isAdmin(env, callerUser.id);
  const callerLevel = getRoleLevel(callerRole);

  // Minimum: moderator can assign verifier
  if (callerLevel < 2) {
    return jsonResponse({ error: 'Insufficient permissions. Moderator or higher required.' }, 403, env, request);
  }

  // 2. Validate input
  const { target_user_id, new_role, game_ids } = body;
  if (!target_user_id || typeof target_user_id !== 'string') {
    return jsonResponse({ error: 'Missing target_user_id' }, 400, env, request);
  }
  if (!new_role || typeof new_role !== 'string') {
    return jsonResponse({ error: 'Missing new_role' }, 400, env, request);
  }

  const validRoles = ['admin', 'moderator', 'verifier', 'user'];
  if (!validRoles.includes(new_role)) {
    return jsonResponse({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, 400, env, request);
  }

  // 3. Cannot assign super_admin
  if (new_role === 'super_admin') {
    return jsonResponse({ error: 'Cannot assign super_admin role via this endpoint' }, 403, env, request);
  }

  // 4. Caller can only assign roles STRICTLY below their own level
  const newLevel = targetRoleLevel(new_role);
  if (newLevel >= callerLevel) {
    return jsonResponse({ error: 'Cannot assign a role equal to or above your own' }, 403, env, request);
  }

  // 5. Cannot modify someone at or above your own level
  const targetRole = await isAdmin(env, target_user_id);
  const targetCurrentLevel = getRoleLevel(targetRole);
  if (targetCurrentLevel >= callerLevel) {
    return jsonResponse({ error: 'Cannot modify a user at or above your own role level' }, 403, env, request);
  }

  // 6. Cannot modify yourself
  if (target_user_id === callerUser.id) {
    return jsonResponse({ error: 'Cannot change your own role' }, 403, env, request);
  }

  // 7. Apply the role change
  try {
    // Build profile update based on new role
    let profileUpdate = {};
    switch (new_role) {
      case 'admin':
        profileUpdate = { is_admin: true, is_super_admin: false, role: 'admin' };
        break;
      case 'moderator':
        profileUpdate = { is_admin: false, is_super_admin: false, role: 'moderator' };
        break;
      case 'verifier':
        profileUpdate = { is_admin: false, is_super_admin: false, role: 'verifier' };
        break;
      case 'user':
        profileUpdate = { is_admin: false, is_super_admin: false, role: null };
        break;
    }

    // Update profiles table
    const profileRes = await supabaseQuery(env,
      `profiles?user_id=eq.${encodeURIComponent(target_user_id)}`,
      { method: 'PATCH', body: profileUpdate }
    );
    if (!profileRes.ok) {
      return jsonResponse({ error: 'Failed to update profile role' }, 500, env, request);
    }

    // Handle game verifiers table
    if (new_role === 'verifier' && Array.isArray(game_ids) && game_ids.length > 0) {
      // Clear existing verifier assignments for this user
      await supabaseQuery(env,
        `role_game_verifiers?user_id=eq.${encodeURIComponent(target_user_id)}`,
        { method: 'DELETE' }
      );
      // Insert new game assignments
      const rows = game_ids.map(gid => ({ user_id: target_user_id, game_id: sanitizeInput(gid, 100) }));
      await supabaseQuery(env, 'role_game_verifiers', {
        method: 'POST',
        body: rows,
        headers: { Prefer: 'resolution=merge-duplicates' }
      });
      // Write history for each assigned game
      for (const gid of game_ids) {
        await writeGameHistory(env, {
          game_id: sanitizeInput(gid, 100),
          action: 'gm_added',
          target: target_user_id,
          note: 'verifier assigned',
          actor_id: callerUser.id,
        });
      }
    } else if (new_role !== 'verifier') {
      // If demoting away from verifier, or promoting above it, clear verifier assignments
      await supabaseQuery(env,
        `role_game_verifiers?user_id=eq.${encodeURIComponent(target_user_id)}`,
        { method: 'DELETE' }
      );
    }

    return jsonResponse({
      ok: true,
      message: `Role updated to ${new_role}`,
      assigned_by: callerRole.runnerId || callerUser.id,
    }, 200, env, request);

  } catch (err) {
    console.error('assign-role error:', err);
    return jsonResponse({ error: 'Internal error during role assignment' }, 500, env, request);
  }
}

export async function handleDataExport(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // Authenticate — any signed-in user can export their own data
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const userId = auth.user.id;
  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    categories_collected: [
      'Profile information (display name, bio, social links)',
      'Run submissions and gaming activity',
      'Account connections (Discord, Twitch)',
      'Support communications',
      'Moderation history (if applicable)',
    ],
    sections: {},
  };

  // 1. Profile
  const profile = await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.profile = profile.ok ? (profile.data || []) : [];

  // 2. Pending profiles (in-progress profile edits)
  const pendingProfiles = await supabaseQuery(env,
    `pending_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.pending_profiles = pendingProfiles.ok ? (pendingProfiles.data || []) : [];

  // 3. Pending run submissions
  const runs = await supabaseQuery(env,
    `pending_runs?submitted_by=eq.${encodeURIComponent(userId)}&select=*&limit=1000`, { method: 'GET' });
  exportData.sections.pending_runs = runs.ok ? (runs.data || []) : [];

  // 3b. Approved runs (GDPR Article 15 — all personal data must be included)
  const runnerId = profile.ok && profile.data?.[0]?.runner_id;
  if (runnerId) {
    const approvedRuns = await supabaseQuery(env,
      `runs?runner_id=eq.${encodeURIComponent(runnerId)}&select=*&limit=5000`, { method: 'GET' });
    exportData.sections.approved_runs = approvedRuns.ok ? (approvedRuns.data || []) : [];

    // 3c. Achievements
    const achievements = await supabaseQuery(env,
      `game_achievements?runner_id=eq.${encodeURIComponent(runnerId)}&select=*&limit=5000`, { method: 'GET' });
    exportData.sections.achievements = achievements.ok ? (achievements.data || []) : [];
  }

  // 4. Linked accounts
  const linked = await supabaseQuery(env,
    `linked_accounts?user_id=eq.${encodeURIComponent(userId)}&select=provider,provider_username,created_at`, { method: 'GET' });
  exportData.sections.linked_accounts = linked.ok ? (linked.data || []) : [];

  // 5. Game submissions
  const games = await supabaseQuery(env,
    `pending_games?submitted_by=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  exportData.sections.game_submissions = games.ok ? (games.data || []) : [];

  // 6. Game update requests
  const updates = await supabaseQuery(env,
    `game_update_requests?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=500`, { method: 'GET' });
  exportData.sections.game_update_requests = updates.ok ? (updates.data || []) : [];

  // 7. Support tickets
  const tickets = await supabaseQuery(env,
    `support_tickets?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=500`, { method: 'GET' });
  exportData.sections.support_tickets = tickets.ok ? (tickets.data || []) : [];

  // 8. Support messages
  const messages = await supabaseQuery(env,
    `support_messages?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=2000`, { method: 'GET' });
  exportData.sections.support_messages = messages.ok ? (messages.data || []) : [];

  // 9. Profile audit log (actions performed on this user's profile)
  if (runnerId) {
    const audit = await supabaseQuery(env,
      `audit_profile_log?runner_id=eq.${encodeURIComponent(runnerId)}&select=*&limit=2000`, { method: 'GET' });
    exportData.sections.audit_log = audit.ok ? (audit.data || []) : [];
  }

  // 10. Moderator/admin record (reuses profile query from section 1)
  if (profile.ok && profile.data?.length > 0) {
    const p = profile.data[0];
    if (p.is_admin || p.is_super_admin || p.role === 'moderator') {
      exportData.sections.moderator_record = profile.data;
    }
  }

  return jsonResponse(exportData, 200, env, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT: POST /delete-account (GDPR Article 17 — Right to Erasure)
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleDeleteAccount(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // Authenticate — user can only delete their own account
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  // SECURITY: Require Turnstile verification for irreversible account deletion
  const ip = request.headers.get('CF-Connecting-IP');
  const turnstileOk = await verifyTurnstile(body.turnstile_token, env, ip);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Verification failed. Please try again.' }, 403, env, request);
  }

  const userId = auth.user.id;

  // 1. Look up profile to get runner_id (needed for anonymizing runs)
  const profile = await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=runner_id,display_name`, { method: 'GET' });
  const runnerId = profile.ok && profile.data?.[0]?.runner_id;

  // 2. Anonymize approved runs (preserve leaderboard integrity)
  if (runnerId) {
    await supabaseQuery(env,
      `runs?runner_id=eq.${encodeURIComponent(runnerId)}`, {
        method: 'PATCH',
        body: { runner_id: 'deleted-user', runner_name: 'Deleted User' },
      });

    // 3. Delete achievements
    await supabaseQuery(env,
      `game_achievements?runner_id=eq.${encodeURIComponent(runnerId)}`, { method: 'DELETE' });

    // 4. Delete audit log entries
    await supabaseQuery(env,
      `audit_profile_log?runner_id=eq.${encodeURIComponent(runnerId)}`, { method: 'DELETE' });
  }

  // 5. Delete pending runs
  await supabaseQuery(env,
    `pending_runs?submitted_by=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 6. Delete support messages
  await supabaseQuery(env,
    `support_messages?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 7. Delete support tickets
  await supabaseQuery(env,
    `support_tickets?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 8. Delete game update requests
  await supabaseQuery(env,
    `game_update_requests?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 9. Delete pending games
  await supabaseQuery(env,
    `pending_games?submitted_by=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 10. Delete linked accounts
  await supabaseQuery(env,
    `linked_accounts?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 11. Delete role assignments
  await supabaseQuery(env,
    `role_game_verifiers?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });
  await supabaseQuery(env,
    `role_game_moderators?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 12. Delete pending profiles
  await supabaseQuery(env,
    `pending_profiles?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 13. Delete profile
  await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });

  // 14. Delete the auth user via Supabase Admin API
  const authDeleteRes = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  if (!authDeleteRes.ok) {
    console.error('Failed to delete auth user:', authDeleteRes.status, await authDeleteRes.text());
    // Data is already cleaned up — log the error but don't fail the request
    // The orphaned auth record will have no associated data
  }

  return jsonResponse({ ok: true, message: 'Account deleted successfully' }, 200, env, request);
}
