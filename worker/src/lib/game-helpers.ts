// ═══════════════════════════════════════════════════════════════════════════════
// Game-Related Helpers — History, Claims, Access Checks, Role Levels
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env, RoleInfo, GameEditorAccess, GameHistoryParams } from '../types/index.js';
import { supabaseQuery, isAdmin } from './supabase.js';

export function isClaimActive(claimedAt: string | null | undefined): boolean {
  if (!claimedAt) return false;
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  return (Date.now() - new Date(claimedAt).getTime()) < TWO_WEEKS_MS;
}

export async function writeGameHistory(env: Env, params: GameHistoryParams): Promise<void> {
  const { game_id, action, target, note, actor_id } = params;
  try {
    // Best-effort actor name lookup — use runner_id from profiles
    let actor_name: string | null = null;
    try {
      const profResult = await supabaseQuery(env,
        `profiles?user_id=eq.${encodeURIComponent(actor_id)}&select=runner_id,display_name`,
        { method: 'GET' });
      if (profResult.ok && Array.isArray(profResult.data) && profResult.data.length > 0) {
        const p = profResult.data[0] as Record<string, unknown>;
        actor_name = (p.display_name as string) || (p.runner_id as string) || null;
      }
    } catch { /* ignore */ }

    await supabaseQuery(env, 'game_history', {
      method: 'POST',
      body: { game_id, action, target: target || null, note: note || null, actor_id, actor_name }
    });
  } catch { /* best-effort — never block main flow */ }
}

export function getRoleLevel(roleObj: RoleInfo): number {
  if (roleObj.superAdmin) return 4;
  if (roleObj.admin) return 3;
  if (roleObj.moderator) return 2;
  if (roleObj.verifier) return 1;
  return 0;
}

export function targetRoleLevel(roleName: string): number {
  switch (roleName) {
    case 'admin': return 3;
    case 'moderator': return 2;
    case 'verifier': return 1;
    case 'user': return 0;
    default: return -1;
  }
}

export const GAME_ADMIN_ONLY_FIELDS = ['game_name', 'game_name_aliases', 'status', 'is_modded', 'base_game'];

/** All allowed game data fields — anything not in this list is stripped */
export const GAME_ALLOWED_FIELDS = [
  'game_name', 'game_name_aliases', 'status', 'timing_method',
  'genres', 'platforms', 'cover', 'cover_position',
  'full_runs', 'mini_challenges', 'player_made',
  'general_rules', 'challenges_data', 'glitches_data',
  'restrictions_data', 'character_column', 'characters_data',
  'difficulty_column', 'difficulties_data',
  'additional_tabs', 'community_achievements', 'credits',
  'is_modded', 'base_game', 'tabs', 'reviewers',
  'nmg_rules', 'glitch_doc_links'
];

/** Verify caller has game editor access for a specific game */
export async function checkGameEditorAccess(env: Env, userId: string, gameId: string): Promise<GameEditorAccess> {
  const role = await isAdmin(env, userId);

  // Admins and super admins can edit any game
  if (role.admin) return { allowed: true, role, isAdmin: true };

  // Moderators can edit games they're assigned to
  if (role.moderator) {
    const modCheck = await supabaseQuery(env,
      `role_game_moderators?user_id=eq.${encodeURIComponent(userId)}&game_id=eq.${encodeURIComponent(gameId)}&select=id`,
      { method: 'GET' });
    if (modCheck.ok && Array.isArray(modCheck.data) && modCheck.data.length > 0) {
      return { allowed: true, role, isAdmin: false };
    }
  }

  return { allowed: false, role, isAdmin: false };
}
