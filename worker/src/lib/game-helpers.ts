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

// ── Human-readable change descriptions ───────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  game_name: 'Game name',
  game_name_aliases: 'Aliases',
  status: 'Status',
  timing_method: 'Timing method',
  genres: 'Genres',
  platforms: 'Platforms',
  cover: 'Cover image',
  cover_position: 'Cover position',
  is_modded: 'Modded game',
  base_game: 'Base game',
  full_runs: 'Full runs',
  mini_challenges: 'Mini-challenges',
  player_made: 'Player-made challenges',
  general_rules: 'General rules',
  challenges_data: 'Challenges',
  glitches_data: 'Glitches',
  restrictions_data: 'Restrictions',
  character_column: 'Character column',
  characters_data: 'Characters',
  difficulty_column: 'Difficulty column',
  difficulties_data: 'Difficulties',
  additional_tabs: 'Custom tabs',
  community_achievements: 'Achievements',
  nmg_rules: 'NMG rules',
  glitch_doc_links: 'Glitch doc links',
};

function describeArrayDiff(label: string, oldArr: any[], newArr: any[]): string | null {
  // Extract labels/slugs for comparison
  const getLabel = (item: any): string =>
    typeof item === 'string' ? item : (item.label || item.title || item.slug || JSON.stringify(item)).slice(0, 40);

  const oldLabels = (oldArr || []).map(getLabel);
  const newLabels = (newArr || []).map(getLabel);
  const added = newLabels.filter(l => !oldLabels.includes(l));
  const removed = oldLabels.filter(l => !newLabels.includes(l));

  // If same items but different order/content, note modification
  if (added.length === 0 && removed.length === 0) {
    if (JSON.stringify(oldArr) !== JSON.stringify(newArr)) {
      return `${label} modified`;
    }
    return null;
  }

  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${added.slice(0, 3).join(', ')}${added.length > 3 ? ` +${added.length - 3} more` : ''}`);
  if (removed.length > 0) parts.push(`removed ${removed.slice(0, 3).join(', ')}${removed.length > 3 ? ` +${removed.length - 3} more` : ''}`);
  return `${label}: ${parts.join('; ')}`;
}

/**
 * Compare old game state with new updates and produce a human-readable summary.
 * Returns a descriptive string like "Cover image updated · Genres: added RPG"
 */
export function buildChangeDescription(oldGame: Record<string, any>, updates: Record<string, any>): string {
  const changes: string[] = [];

  for (const key of Object.keys(updates)) {
    const oldVal = oldGame[key];
    const newVal = updates[key];
    const label = FIELD_LABELS[key] || key.replace(/_/g, ' ');

    // Skip if unchanged
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    // Skip internal fields
    if (key === 'rules_version') continue;

    // Cover image — don't dump URLs
    if (key === 'cover') {
      if (!oldVal && newVal) changes.push('Cover image added');
      else if (oldVal && !newVal) changes.push('Cover image removed');
      else changes.push('Cover image updated');
      continue;
    }

    // Booleans
    if (typeof newVal === 'boolean') {
      changes.push(`${label}: ${newVal ? 'enabled' : 'disabled'}`);
      continue;
    }

    // Arrays
    if (Array.isArray(newVal) || Array.isArray(oldVal)) {
      const desc = describeArrayDiff(label, oldVal || [], newVal || []);
      if (desc) changes.push(desc);
      continue;
    }

    // Simple strings
    if (typeof newVal === 'string' || typeof oldVal === 'string') {
      if (!oldVal && newVal) {
        changes.push(`${label} added`);
      } else if (oldVal && !newVal) {
        changes.push(`${label} cleared`);
      } else {
        // Show before → after for short values, just "changed" for long ones
        const oldStr = String(oldVal || '');
        const newStr = String(newVal || '');
        if (oldStr.length <= 60 && newStr.length <= 60) {
          changes.push(`${label}: "${oldStr}" → "${newStr}"`);
        } else {
          changes.push(`${label} updated`);
        }
      }
      continue;
    }

    // Objects (JSONB — additional_tabs, character_column, etc.)
    if (typeof newVal === 'object' && newVal !== null) {
      changes.push(`${label} updated`);
      continue;
    }

    // Fallback
    changes.push(`${label} changed`);
  }

  if (changes.length === 0) return 'No visible changes';
  return changes.join(' · ');
}

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
