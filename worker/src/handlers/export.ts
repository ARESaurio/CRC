// ═══════════════════════════════════════════════════════════════════════════════
// DATA EXPORT HANDLER (GDPR/CCPA)
// ═══════════════════════════════════════════════════════════════════════════════

import type { Env } from '../types/index.js';
import { jsonResponse } from '../lib/cors.js';
import { supabaseQuery } from '../lib/supabase.js';
import { authenticateUser } from '../lib/auth.js';

export async function handleDataExport(body: Record<string, unknown>, env: Env, request: Request): Promise<Response> {
  // Authenticate — any signed-in user can export their own data
  const auth = await authenticateUser(env, body, request);
  if (auth.error) return jsonResponse({ error: auth.error }, auth.status, env, request);

  const userId = auth.user.id;
  const exportData: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    categories_collected: [
      'Profile information (display name, bio, social links)',
      'Run submissions and gaming activity',
      'Account connections (Discord, Twitch)',
      'Support communications',
      'Moderation history (if applicable)',
    ],
    sections: {} as Record<string, unknown>,
  };

  const sections = exportData.sections as Record<string, unknown>;

  // 1. Profile
  const profile = await supabaseQuery(env,
    `profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  sections.profile = profile.ok ? (profile.data || []) : [];

  // 2. Pending profiles (in-progress profile edits)
  const pendingProfiles = await supabaseQuery(env,
    `pending_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  sections.pending_profiles = pendingProfiles.ok ? (pendingProfiles.data || []) : [];

  // 3. Pending run submissions
  const runs = await supabaseQuery(env,
    `pending_runs?submitted_by=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  sections.pending_runs = runs.ok ? (runs.data || []) : [];

  // 3b. Approved runs (GDPR Article 15 — all personal data must be included)
  const runnerId = profile.ok && Array.isArray(profile.data) && (profile.data[0] as Record<string, unknown>)?.runner_id;
  if (runnerId) {
    const approvedRuns = await supabaseQuery(env,
      `runs?runner_id=eq.${encodeURIComponent(runnerId as string)}&select=*`, { method: 'GET' });
    sections.approved_runs = approvedRuns.ok ? (approvedRuns.data || []) : [];

    // 3c. Achievements
    const achievements = await supabaseQuery(env,
      `game_achievements?runner_id=eq.${encodeURIComponent(runnerId as string)}&select=*`, { method: 'GET' });
    sections.achievements = achievements.ok ? (achievements.data || []) : [];
  }

  // 4. Linked accounts
  const linked = await supabaseQuery(env,
    `linked_accounts?user_id=eq.${encodeURIComponent(userId)}&select=provider,provider_username,created_at`, { method: 'GET' });
  sections.linked_accounts = linked.ok ? (linked.data || []) : [];

  // 5. Game submissions
  const games = await supabaseQuery(env,
    `pending_games?submitter_user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  sections.game_submissions = games.ok ? (games.data || []) : [];

  // 6. Game update requests
  const updates = await supabaseQuery(env,
    `game_update_requests?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  sections.game_update_requests = updates.ok ? (updates.data || []) : [];

  // 7. Support tickets
  const tickets = await supabaseQuery(env,
    `support_tickets?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  sections.support_tickets = tickets.ok ? (tickets.data || []) : [];

  // 8. Support messages
  const messages = await supabaseQuery(env,
    `support_messages?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: 'GET' });
  sections.support_messages = messages.ok ? (messages.data || []) : [];

  // 9. Profile audit log (actions performed on this user's profile)
  if (runnerId) {
    const audit = await supabaseQuery(env,
      `audit_profile_log?runner_id=eq.${encodeURIComponent(runnerId as string)}&select=*`, { method: 'GET' });
    sections.audit_log = audit.ok ? (audit.data || []) : [];
  }

  // 10. Moderator/admin record (reuses profile query from section 1)
  if (profile.ok && Array.isArray(profile.data) && profile.data.length > 0) {
    const p = profile.data[0] as Record<string, unknown>;
    if (p.is_admin || p.is_super_admin || p.role === 'moderator') {
      sections.moderator_record = profile.data;
    }
  }

  return jsonResponse(exportData, 200, env, request);
}
